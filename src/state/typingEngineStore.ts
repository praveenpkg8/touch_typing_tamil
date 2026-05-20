/**
 * TypingEngineStore — Zustand store that wires Composer → Validator and
 * exposes the live state React needs to render the lesson runner UI.
 *
 * Design intent (design-freeze §2 architecture):
 *   - Hot path (per keystroke) updates ref-held state inside the engine.
 *   - React subscribes only to coarse-grained derived snapshots (cursor,
 *     accuracy, CPM, last mistake) — not to the keystroke event log.
 *   - The full event log is held internally and flushed to IndexedDB
 *     on session end (not on every keystroke).
 */

import { create } from 'zustand';
import { uuidv7 } from 'uuidv7';
import {
  KeyComposer,
  predictNextKey,
  type ComposerInput,
  type EmittedToken,
  type PredictedKey,
} from '../typing-engine/composer/index.ts';
import { Validator, type MistakeKind } from '../typing-engine/validator/index.ts';
// Runtime imports only the 7KB exceptions array — the full 256KB fixtures
// file is a test oracle and stays out of the production bundle.
import keymapExceptions from '../typing-engine/composer/keymap.exceptions.json' with { type: 'json' };
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_USER_ID,
  persistSession,
  type KeystrokeEvent,
  type LessonAttempt,
  type Mistake,
  type Session,
} from '../persistence/index.ts';
import type { Lesson } from '../content/lessons/index.ts';

const IDLE_CAP_MS = 5000;

interface DrillContext {
  lesson: Lesson;
  drillIndex: number;
  repeatIndex: number;
}

interface ActiveSessionData {
  sessionId: string;
  deviceId: string;
  startedAt: string;
  startMs: number;
  drillContext: DrillContext | null;
  /** True if this session is custom-text practice; suppresses LessonAttempt creation. */
  isCustomPractice: boolean;
  composer: KeyComposer;
  validator: Validator;
  /** Sum of effective inter-keystroke delays (with idle cap). */
  effectiveMs: number;
  /** Last keystroke wall-clock time. */
  lastTs: number;
  /** Raw keystroke log; flushed to IDB on session end. */
  keystrokeEvents: KeystrokeEvent[];
  /** Sequence number per session. */
  sequenceNumber: number;
  totalKeystrokes: number;
  correctKeystrokes: number;
  /** Total target graphemes the user has produced correctly across the session. */
  correctGraphemesCount: number;
  /** Mistakes recorded so far (one per incorrect keystroke). */
  mistakes: Mistake[];
}

export interface DerivedSnapshot {
  // Per-drill
  targetText: string;
  targetGraphemes: readonly string[];
  composerString: string;
  cursorGraphemes: number;
  cursorCodepoints: number;
  // Status flags
  isActive: boolean;
  isDrillComplete: boolean;
  drillContext: DrillContext | null;
  // Last keystroke
  lastWasCorrect: boolean | null;
  lastMistakeKind: MistakeKind | null;
  expectedGrapheme: string | null;
  // Aggregates (live)
  totalKeystrokes: number;
  correctKeystrokes: number;
  accuracyKeystrokes: number;
  graphemesPerMinute: number;
  keystrokesPerMinute: number;
  // Tutoring hint: the key the user should press next, or null if the
  // current grapheme is done / user has diverged.
  nextKey: PredictedKey | null;
  // Counter to force re-renders even when refs change
  tick: number;
}

interface SessionSummary {
  sessionId: string;
  lessonId: string | null;
  durationSeconds: number;
  targetText: string;
  targetGraphemeCount: number;
  correctGraphemes: number;
  incorrectGraphemes: number;
  totalKeystrokes: number;
  correctKeystrokes: number;
  graphemesPerMinute: number;
  keystrokesPerMinute: number;
  accuracyGraphemes: number;
  accuracyKeystrokes: number;
  metCompletionCriteria: boolean;
  mistakeBreakdown: Array<{ kind: MistakeKind; expected: string; count: number }>;
}

interface TypingEngineStore {
  active: ActiveSessionData | null;
  snapshot: DerivedSnapshot;
  lastSummary: SessionSummary | null;

  startLesson: (lesson: Lesson) => void;
  startCustomPractice: (text: string) => void;
  /** Move to the next drill in the active lesson; returns false if no more drills. */
  advanceDrill: () => boolean;
  handleKey: (input: Omit<ComposerInput, 'ts'>) => void;
  endSession: () => Promise<SessionSummary | null>;
  resetSummary: () => void;
}

function emptySnapshot(): DerivedSnapshot {
  return {
    targetText: '',
    targetGraphemes: [],
    composerString: '',
    cursorGraphemes: 0,
    cursorCodepoints: 0,
    isActive: false,
    isDrillComplete: false,
    drillContext: null,
    lastWasCorrect: null,
    lastMistakeKind: null,
    expectedGrapheme: null,
    totalKeystrokes: 0,
    correctKeystrokes: 0,
    accuracyKeystrokes: 100,
    graphemesPerMinute: 0,
    keystrokesPerMinute: 0,
    nextKey: null,
    tick: 0,
  };
}

function getCurrentDrillTarget(lesson: Lesson, drillIndex: number, _repeatIndex: number): string {
  const drill = lesson.drills[drillIndex];
  if (!drill) throw new Error(`Drill index ${drillIndex} out of range for ${lesson.id}`);
  return drill.target;
}

function effectiveDurationSecs(effectiveMs: number): number {
  return effectiveMs / 1000;
}

function gpm(correctGraphemes: number, effectiveSecs: number): number {
  if (effectiveSecs <= 0) return 0;
  return (correctGraphemes / effectiveSecs) * 60;
}

function kpm(totalKeystrokes: number, effectiveSecs: number): number {
  if (effectiveSecs <= 0) return 0;
  return (totalKeystrokes / effectiveSecs) * 60;
}

function buildKeystrokeEvent(args: {
  sessionId: string;
  userId: string;
  sequenceNumber: number;
  token: EmittedToken;
  ts: number;
  cursorPosCodepoints: number;
  cursorPosGraphemes: number;
  wasCorrect: boolean;
  mistakeKind: MistakeKind | null;
  expectedGrapheme: string | null;
  typedGrapheme: string | null;
  tamil99Char: string | null;
}): KeystrokeEvent {
  return {
    id: uuidv7(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sessionId: args.sessionId,
    userId: args.userId,
    sequenceNumber: args.sequenceNumber,
    ts: args.ts,
    code: args.token.triggeringCode,
    shift: args.token.shift,
    altGr: args.token.altGr,
    tamil99Char: args.tamil99Char,
    composedOp: args.token.op,
    composedBefore: args.token.before === '' ? null : args.token.before,
    composedAfter: args.token.after,
    cursorPosCodepoints: args.cursorPosCodepoints,
    cursorPosGraphemes: args.cursorPosGraphemes,
    wasCorrect: args.wasCorrect,
    mistakeKind: args.mistakeKind,
    expectedGrapheme: args.expectedGrapheme,
    typedGrapheme: args.typedGrapheme,
  };
}

export const useTypingEngine = create<TypingEngineStore>((set, get) => ({
  active: null,
  snapshot: emptySnapshot(),
  lastSummary: null,

  startLesson(lesson: Lesson) {
    const sessionId = uuidv7();
    const now = new Date();
    const targetText = getCurrentDrillTarget(lesson, 0, 0);

    const composer = new KeyComposer(keymapExceptions);
    const validator = new Validator(targetText);

    const active: ActiveSessionData = {
      sessionId,
      deviceId: localStorage.getItem('tamil99.deviceId') ?? 'unknown',
      startedAt: now.toISOString(),
      startMs: performance.now(),
      drillContext: { lesson, drillIndex: 0, repeatIndex: 0 },
      isCustomPractice: false,
      composer,
      validator,
      effectiveMs: 0,
      lastTs: performance.now(),
      keystrokeEvents: [],
      sequenceNumber: 0,
      totalKeystrokes: 0,
      correctKeystrokes: 0,
      correctGraphemesCount: 0,
      mistakes: [],
    };

    set({
      active,
      snapshot: {
        ...emptySnapshot(),
        isActive: true,
        targetText,
        targetGraphemes: validator.targetGraphemes,
        drillContext: active.drillContext,
        expectedGrapheme: validator.targetGraphemes[0] ?? null,
        nextKey: predictNextKey(composer, targetText),
      },
      lastSummary: null,
    });
  },

  startCustomPractice(text: string) {
    const sessionId = uuidv7();
    const now = new Date();
    const targetText = text;

    const composer = new KeyComposer(keymapExceptions);
    const validator = new Validator(targetText);

    const active: ActiveSessionData = {
      sessionId,
      deviceId: localStorage.getItem('tamil99.deviceId') ?? 'unknown',
      startedAt: now.toISOString(),
      startMs: performance.now(),
      drillContext: null,
      isCustomPractice: true,
      composer,
      validator,
      effectiveMs: 0,
      lastTs: performance.now(),
      keystrokeEvents: [],
      sequenceNumber: 0,
      totalKeystrokes: 0,
      correctKeystrokes: 0,
      correctGraphemesCount: 0,
      mistakes: [],
    };

    set({
      active,
      snapshot: {
        ...emptySnapshot(),
        isActive: true,
        targetText,
        targetGraphemes: validator.targetGraphemes,
        drillContext: null,
        expectedGrapheme: validator.targetGraphemes[0] ?? null,
        nextKey: predictNextKey(composer, targetText),
      },
      lastSummary: null,
    });
  },

  advanceDrill(): boolean {
    const state = get();
    if (!state.active || !state.active.drillContext) return false;
    const { lesson, drillIndex, repeatIndex } = state.active.drillContext;
    const drill = lesson.drills[drillIndex];
    if (!drill) return false;

    let nextDrill = drillIndex;
    let nextRepeat = repeatIndex + 1;
    if (nextRepeat >= drill.repeats) {
      nextDrill++;
      nextRepeat = 0;
    }
    if (nextDrill >= lesson.drills.length) {
      // Lesson finished
      return false;
    }

    const targetText = getCurrentDrillTarget(lesson, nextDrill, nextRepeat);

    // New composer + validator for the new drill (clean state per drill).
    state.active.composer = new KeyComposer(keymapExceptions);
    state.active.validator = new Validator(targetText);
    state.active.drillContext = {
      lesson,
      drillIndex: nextDrill,
      repeatIndex: nextRepeat,
    };

    set({
      snapshot: {
        ...state.snapshot,
        targetText,
        targetGraphemes: state.active.validator.targetGraphemes,
        composerString: '',
        cursorGraphemes: 0,
        cursorCodepoints: 0,
        isDrillComplete: false,
        drillContext: state.active.drillContext,
        lastWasCorrect: null,
        lastMistakeKind: null,
        expectedGrapheme: state.active.validator.targetGraphemes[0] ?? null,
        nextKey: predictNextKey(state.active.composer, targetText),
        tick: state.snapshot.tick + 1,
      },
    });
    return true;
  },

  handleKey(input) {
    const state = get();
    const a = state.active;
    if (!a) return;
    if (state.snapshot.isDrillComplete) return; // Don't accept input after completion

    const now = performance.now();
    const delta = Math.min(now - a.lastTs, IDLE_CAP_MS);
    a.lastTs = now;
    a.effectiveMs += delta;

    const fullInput: ComposerInput = { ...input, ts: now };
    const token = a.composer.step(fullInput);
    const composerString = a.composer.currentString;
    const v = a.validator.validate(composerString);

    const isBackspace = input.isBackspace === true;
    // Don't count backspaces as "keystrokes typed" for CPM, but do log them.
    if (!isBackspace) {
      a.totalKeystrokes++;
      if (v.wasCorrect) a.correctKeystrokes++;
    }

    // Update correctGraphemesCount on cursor advance.
    if (v.wasCorrect) {
      a.correctGraphemesCount = Math.max(a.correctGraphemesCount, v.cursorPosGraphemes);
    }

    a.sequenceNumber++;
    const userId = DEFAULT_USER_ID;
    const tamil99Char = token.after.length > 0 ? token.after : null;
    const event = buildKeystrokeEvent({
      sessionId: a.sessionId,
      userId,
      sequenceNumber: a.sequenceNumber,
      token,
      ts: now,
      cursorPosCodepoints: v.cursorPosCodepoints,
      cursorPosGraphemes: v.cursorPosGraphemes,
      wasCorrect: v.wasCorrect,
      mistakeKind: v.mistakeKind,
      expectedGrapheme: v.expectedGrapheme,
      typedGrapheme: v.typedGrapheme,
      tamil99Char,
    });
    a.keystrokeEvents.push(event);

    if (!v.wasCorrect && v.mistakeKind && v.expectedGrapheme) {
      a.mistakes.push({
        id: uuidv7(),
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sessionId: a.sessionId,
        userId,
        createdAt: new Date().toISOString(),
        kind: v.mistakeKind,
        expectedGrapheme: v.expectedGrapheme,
        typedGrapheme: v.typedGrapheme ?? '',
        expectedCode: '',
        typedCode: token.triggeringCode,
        cursorPosGraphemes: v.cursorPosGraphemes,
        keystrokeEventIds: [event.id],
      });
    }

    const effectiveSecs = effectiveDurationSecs(a.effectiveMs);
    const isDrillComplete = v.isComplete;

    // Only recompute next-key prediction when on the correct path. After a
    // mistake the user must backspace; we'd return null anyway, but skipping
    // the work keeps the keyboard hint from flickering off mid-drill.
    const nextKey = v.wasCorrect && !isDrillComplete
      ? predictNextKey(a.composer, a.validator.targetText)
      : null;

    set({
      snapshot: {
        targetText: a.validator.targetText,
        targetGraphemes: a.validator.targetGraphemes,
        composerString,
        cursorGraphemes: v.cursorPosGraphemes,
        cursorCodepoints: v.cursorPosCodepoints,
        isActive: true,
        isDrillComplete,
        drillContext: a.drillContext,
        lastWasCorrect: isBackspace ? state.snapshot.lastWasCorrect : v.wasCorrect,
        lastMistakeKind: v.mistakeKind,
        expectedGrapheme: v.expectedGrapheme,
        totalKeystrokes: a.totalKeystrokes,
        correctKeystrokes: a.correctKeystrokes,
        accuracyKeystrokes: a.totalKeystrokes > 0
          ? Math.round((a.correctKeystrokes / a.totalKeystrokes) * 100)
          : 100,
        graphemesPerMinute: gpm(a.correctGraphemesCount, effectiveSecs),
        keystrokesPerMinute: kpm(a.totalKeystrokes, effectiveSecs),
        nextKey,
        tick: state.snapshot.tick + 1,
      },
    });
  },

  async endSession(): Promise<SessionSummary | null> {
    const state = get();
    const a = state.active;
    if (!a) return null;
    const closingSessionId = a.sessionId;

    // Empty session: don't persist, don't clobber state in case a fresh
    // session has already taken over (React StrictMode double-mount).
    if (a.totalKeystrokes === 0) {
      const after = get();
      if (after.active?.sessionId === closingSessionId) {
        set({ active: null, snapshot: emptySnapshot() });
      }
      return null;
    }

    const endedAt = new Date().toISOString();
    const durationSeconds = effectiveDurationSecs(a.effectiveMs);
    const lesson = a.drillContext?.lesson ?? null;

    const targetText = a.validator.targetText;
    const targetGraphemeCount = a.validator.targetGraphemes.length;
    const correctGraphemes = a.correctGraphemesCount;
    const incorrectGraphemes = Math.max(0, targetGraphemeCount - correctGraphemes);

    const accuracyKeystrokes = a.totalKeystrokes > 0
      ? Math.round((a.correctKeystrokes / a.totalKeystrokes) * 100)
      : 100;
    const accuracyGraphemes = targetGraphemeCount > 0
      ? Math.round((correctGraphemes / targetGraphemeCount) * 100)
      : 100;
    const graphemesPerMinute = Math.round(gpm(correctGraphemes, durationSeconds) * 10) / 10;
    const keystrokesPerMinute = Math.round(kpm(a.totalKeystrokes, durationSeconds) * 10) / 10;

    const session: Session = {
      id: a.sessionId,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      userId: DEFAULT_USER_ID,
      deviceId: a.deviceId,
      createdAt: a.startedAt,
      practiceMode: a.isCustomPractice
        ? 'custom'
        : lesson?.type === 'sentence'
          ? 'sentence'
          : lesson?.type === 'word'
            ? 'word'
            : 'character',
      lessonId: lesson?.id ?? null,
      startedAt: a.startedAt,
      endedAt,
      durationSeconds: Math.round(durationSeconds * 10) / 10,
      targetText,
      targetGraphemeCount,
      typedGraphemeCount: a.validator.cursorPosGraphemes,
      correctGraphemes,
      incorrectGraphemes,
      totalKeystrokes: a.totalKeystrokes,
      correctKeystrokes: a.correctKeystrokes,
      graphemesPerMinute,
      keystrokesPerMinute,
      accuracyGraphemes,
      accuracyKeystrokes,
    };

    let lessonAttempt: LessonAttempt | null = null;
    let metCompletionCriteria = false;
    if (lesson) {
      metCompletionCriteria =
        accuracyGraphemes >= lesson.completion.minAccuracyGraphemes &&
        graphemesPerMinute >= lesson.completion.minGPM &&
        a.validator.isComplete;
      lessonAttempt = {
        id: uuidv7(),
        schemaVersion: CURRENT_SCHEMA_VERSION,
        userId: DEFAULT_USER_ID,
        lessonId: lesson.id,
        sessionId: a.sessionId,
        createdAt: endedAt,
        status: a.validator.isComplete ? 'completed' : 'abandoned',
        achievedAccuracyGraphemes: accuracyGraphemes,
        achievedGPM: graphemesPerMinute,
        metCompletionCriteria,
      };
    }

    // Mistake breakdown
    const mb = new Map<string, { kind: MistakeKind; expected: string; count: number }>();
    for (const m of a.mistakes) {
      const k = `${m.kind}::${m.expectedGrapheme}`;
      const bucket = mb.get(k);
      if (bucket) bucket.count++;
      else mb.set(k, { kind: m.kind, expected: m.expectedGrapheme, count: 1 });
    }
    const mistakeBreakdown = [...mb.values()].sort((a, b) => b.count - a.count);

    try {
      await persistSession({
        session,
        keystrokeEvents: a.keystrokeEvents,
        mistakes: a.mistakes,
        lessonAttempt,
      });
    } catch (err) {
      console.error('Failed to persist session', err);
    }

    const summary: SessionSummary = {
      sessionId: a.sessionId,
      lessonId: lesson?.id ?? null,
      durationSeconds: session.durationSeconds,
      targetText,
      targetGraphemeCount,
      correctGraphemes,
      incorrectGraphemes,
      totalKeystrokes: a.totalKeystrokes,
      correctKeystrokes: a.correctKeystrokes,
      graphemesPerMinute,
      keystrokesPerMinute,
      accuracyGraphemes,
      accuracyKeystrokes,
      metCompletionCriteria,
      mistakeBreakdown,
    };

    // After the await, a different session may have become active
    // (StrictMode double-mount race). Only clobber state if we're still it.
    const afterPersist = get();
    if (afterPersist.active?.sessionId === closingSessionId) {
      set({ active: null, snapshot: emptySnapshot(), lastSummary: summary });
    }
    return summary;
  },

  resetSummary() {
    set({ lastSummary: null });
  },
}));

export type { SessionSummary };
