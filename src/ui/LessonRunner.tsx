/**
 * LessonRunner — drives an active lesson:
 *   - Focusable div captures keydown events with preventDefault so the OS
 *     IME and browser shortcuts don't steal them.
 *   - Filters event.repeat, builds ComposerInput, hands to the engine store.
 *   - Renders target text + HUD + keyboard.
 *   - On drill completion, shows a "Next drill" prompt or ends the session.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTypingEngine } from '../state/typingEngineStore.ts';
import { usePreferences } from '../state/preferencesStore.ts';
import { playClick } from '../audio/soundFeedback.ts';
import { TargetText } from './TargetText.tsx';
import { LiveHUD } from './LiveHUD.tsx';
import { KeyboardWidget } from './KeyboardWidget.tsx';
import type { Lesson } from '../content/lessons/index.ts';

interface LessonRunnerProps {
  lesson: Lesson;
  onComplete: () => void;
  onExit: () => void;
}

export function LessonRunner({ lesson, onComplete, onExit }: LessonRunnerProps) {
  const snapshot = useTypingEngine(s => s.snapshot);
  const startLesson = useTypingEngine(s => s.startLesson);
  const handleKey = useTypingEngine(s => s.handleKey);
  const advanceDrill = useTypingEngine(s => s.advanceDrill);
  const endSession = useTypingEngine(s => s.endSession);
  const preferences = usePreferences();

  const captureRef = useRef<HTMLDivElement | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [lastPressedCode, setLastPressedCode] = useState<string | null>(null);
  const [pressTick, setPressTick] = useState(0);

  // Lesson lifecycle: start once on mount.
  // We deliberately do NOT call endSession in the cleanup. StrictMode runs
  // effects twice in dev; an async endSession in cleanup races with the
  // remount's startLesson and wipes state. Sessions are persisted via the
  // explicit "End session" button and via natural drill completion below.
  useEffect(() => {
    startLesson(lesson);
    setHasStarted(true);
    captureRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Skip auto-repeat from holding a key down.
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      // Allow Tab to exit focus naturally.
      if (e.key === 'Tab') return;
      e.preventDefault();

      const isBackspace = e.code === 'Backspace';
      // AltGr detection: on Linux it's AltRight, on Windows it's both Ctrl+Alt
      // or AltGraph in event.getModifierState. event.altKey covers most cases.
      const altGr =
        e.getModifierState?.('AltGraph') === true ||
        (e.altKey && !e.ctrlKey && !e.metaKey);

      handleKey({
        code: e.code,
        shift: e.shiftKey,
        altGr,
        isBackspace,
      });
      if (preferences.soundFeedback && !isBackspace) {
        const fresh = useTypingEngine.getState().snapshot;
        playClick(fresh.lastWasCorrect === true);
      }
      setLastPressedCode(e.code);
      setPressTick(t => t + 1);
    },
    [handleKey, preferences.soundFeedback],
  );

  // Auto-advance to next drill 1.2s after completion.
  useEffect(() => {
    if (!snapshot.isDrillComplete) return;
    const t = window.setTimeout(() => {
      const advanced = advanceDrill();
      if (!advanced) {
        // Lesson finished — end the session and show report.
        void endSession();
        onComplete();
      }
    }, 1200);
    return () => window.clearTimeout(t);
  }, [snapshot.isDrillComplete, advanceDrill, endSession, onComplete]);

  if (!hasStarted) return null;

  const drillIndex = snapshot.drillContext?.drillIndex ?? 0;
  const repeatIndex = snapshot.drillContext?.repeatIndex ?? 0;
  const totalDrills = lesson.drills.length;
  const repeatsForCurrent = lesson.drills[drillIndex]?.repeats ?? 1;

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 font-tamil">{lesson.title.ta}</h1>
          <p className="text-sm text-slate-500">{lesson.title.en}</p>
        </div>
        <div className="text-sm text-slate-500 tabular-nums">
          Drill {drillIndex + 1}/{totalDrills} &middot; Pass {repeatIndex + 1}/{repeatsForCurrent}
        </div>
        <button
          onClick={async () => {
            await endSession();
            onExit();
          }}
          className="text-sm px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100"
        >
          End session
        </button>
      </header>

      <LiveHUD
        graphemesPerMinute={snapshot.graphemesPerMinute}
        keystrokesPerMinute={snapshot.keystrokesPerMinute}
        accuracyKeystrokes={snapshot.accuracyKeystrokes}
        totalKeystrokes={snapshot.totalKeystrokes}
        cursorGraphemes={snapshot.cursorGraphemes}
        targetGraphemeCount={snapshot.targetGraphemes.length}
      />

      <div
        ref={captureRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="outline-none focus:ring-2 focus:ring-amber-300 rounded-xl"
      >
        <TargetText
          targetText={snapshot.targetText}
          typedText={snapshot.composerString}
          cursorGraphemes={snapshot.cursorGraphemes}
          hasMistake={preferences.realtimeErrorHighlight && snapshot.lastWasCorrect === false}
        />
        <div className="text-center text-xs text-slate-500 mt-2">
          {captureRef.current === document.activeElement ? (
            <span>Typing — press keys, Backspace to undo</span>
          ) : (
            <span className="text-amber-600">Click here to start typing</span>
          )}
        </div>
      </div>

      <KeyboardWidget
        lastPressedCode={lastPressedCode}
        lastWasCorrect={snapshot.lastWasCorrect}
        pressTick={pressTick}
        nextKey={snapshot.nextKey}
      />

      {snapshot.isDrillComplete && (
        <div className="text-center text-emerald-700 font-medium">
          Drill complete — loading next…
        </div>
      )}
    </div>
  );
}
