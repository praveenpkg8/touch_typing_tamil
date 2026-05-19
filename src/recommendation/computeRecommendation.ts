/**
 * computeRecommendation — pure function from persistence snapshot to
 * Recommendation. Implements the 4 rules in design-freeze §11:
 *
 *   R1. accuracyGraphemes < 80  → retry-lesson (same lesson, accuracy mode)
 *   R2. accuracyGraphemes ≥ 95 AND achievedGPM ≥ 90% of target  → next-lesson
 *   R3. same (grapheme, kind) ≥ 5× in last 3 sessions  → targeted-drill
 *   R4. lastPracticedAt ≥ 3 days ago  → refresher
 *
 * Precedence order (highest first):
 *   0. Brand-new user (no sessions yet) → start-first
 *   1. R4 (stale)
 *   2. R1 (low accuracy on last session)
 *   3. R3 (recurring weak grapheme)
 *   4. R2 (advance)
 *   5. Default: keep practicing the most recently attempted lesson
 *
 * The 20% hysteresis on next-lesson swaps mentioned in design-freeze is
 * deferred — it requires persisting "last shown recommendation" in IDB,
 * which is a separate piece of state. For MVP, recommendations may flip
 * with each session if user oscillates around the thresholds.
 */

import type { Lesson } from '../content/lessons/index.ts';
import type { LessonAttempt, Mistake, Session } from '../persistence/index.ts';
import type { Recommendation } from './types.ts';

const STALE_DAYS = 3;
const LOW_ACCURACY_THRESHOLD = 80;
const ADVANCE_ACCURACY_THRESHOLD = 95;
const ADVANCE_GPM_RATIO = 0.9;
const WEAK_GRAPHEME_COUNT = 5;
const RECENT_SESSIONS_FOR_WEAK_GRAPHEME = 3;
const MAX_TARGETED_GRAPHEMES = 3;

export interface ComputeRecommendationInput {
  lessons: Lesson[];
  recentSessions: Session[];     // sorted by createdAt DESC
  attempts: LessonAttempt[];     // all
  mistakes: Mistake[];           // all (will be filtered)
  now: Date;
}

export function computeRecommendation(input: ComputeRecommendationInput): Recommendation {
  const { lessons, recentSessions, attempts, mistakes, now } = input;

  // R0: brand-new user — no sessions ever.
  if (recentSessions.length === 0) {
    const first = pickFirstLesson(lessons);
    if (!first) return { kind: 'all-done', reason: 'No lessons available.' };
    return {
      kind: 'start-first',
      lessonId: first.id,
      reason: 'Welcome — start with the home-row consonants.',
    };
  }

  const lastSession = recentSessions[0]!;
  const passedLessonIds = new Set(
    attempts.filter(a => a.metCompletionCriteria).map(a => a.lessonId),
  );

  // R4: stale — user hasn't practiced in 3+ days. Suggest refreshing the
  // most recently passed lesson before they try anything new.
  const lastPracticedAt = new Date(lastSession.endedAt);
  const daysSince = (now.getTime() - lastPracticedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince >= STALE_DAYS) {
    const mostRecentPass = [...attempts]
      .filter(a => a.metCompletionCriteria)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (mostRecentPass) {
      return {
        kind: 'refresher',
        lessonId: mostRecentPass.lessonId,
        reason: `${Math.floor(daysSince)} days since your last practice — warm up with a familiar lesson.`,
      };
    }
  }

  // R1: low accuracy on last session — retry the same lesson.
  // Guard: don't suggest retrying a lesson the user has ALREADY passed in a
  // prior session. They have the skill; a low score is just variance, and
  // telling them to redo it feels like a regression.
  if (
    lastSession.lessonId !== null &&
    lastSession.accuracyGraphemes < LOW_ACCURACY_THRESHOLD &&
    !passedLessonIds.has(lastSession.lessonId)
  ) {
    return {
      kind: 'retry-lesson',
      lessonId: lastSession.lessonId,
      reason: `Last run was ${lastSession.accuracyGraphemes}% accurate — repeat to lock it in.`,
    };
  }

  // R3: recurring weak grapheme across last 3 sessions.
  const recentSessionIds = new Set(
    recentSessions.slice(0, RECENT_SESSIONS_FOR_WEAK_GRAPHEME).map(s => s.id),
  );
  const weakAggregates = aggregateWeak(mistakes, recentSessionIds);
  const triggering = weakAggregates.filter(a => a.count >= WEAK_GRAPHEME_COUNT);
  if (triggering.length > 0) {
    const top = triggering.slice(0, MAX_TARGETED_GRAPHEMES);
    const focus = top[0]!;
    return {
      kind: 'targeted-drill',
      weakGraphemes: top.map(t => t.grapheme),
      reason: `You've mistyped ${focus.grapheme} ${focus.count} times recently — let's drill it.`,
    };
  }

  // R2: advance — last session crossed the bar.
  if (lastSession.lessonId !== null) {
    const currentLesson = lessons.find(l => l.id === lastSession.lessonId);
    if (
      currentLesson &&
      lastSession.accuracyGraphemes >= ADVANCE_ACCURACY_THRESHOLD &&
      lastSession.graphemesPerMinute >= currentLesson.completion.minGPM * ADVANCE_GPM_RATIO
    ) {
      const next = findNextLesson(lessons, currentLesson, passedLessonIds);
      if (next) {
        return {
          kind: 'next-lesson',
          lessonId: next.id,
          reason: `${lastSession.accuracyGraphemes}% accuracy at ${lastSession.graphemesPerMinute} gpm — ready to advance.`,
        };
      }
      return {
        kind: 'all-done',
        reason: "You've completed every lesson we have. Try custom practice to keep your edge.",
      };
    }
  }

  // Default: keep working on the last lesson UNLESS it's already passed.
  // If it's passed, look for the next unpassed lesson and suggest that instead.
  if (lastSession.lessonId !== null && !passedLessonIds.has(lastSession.lessonId)) {
    return {
      kind: 'retry-lesson',
      lessonId: lastSession.lessonId,
      reason: 'Keep going — one more solid run should consolidate it.',
    };
  }

  const nextUnpassed = sortedLessons(lessons).find(l => !passedLessonIds.has(l.id));
  if (nextUnpassed) {
    return {
      kind: 'next-lesson',
      lessonId: nextUnpassed.id,
      reason:
        lastSession.lessonId !== null && passedLessonIds.has(lastSession.lessonId)
          ? 'You already passed that one — try the next lesson.'
          : 'Continue with the curated lessons.',
    };
  }
  return {
    kind: 'all-done',
    reason: "You've completed every lesson we have.",
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────

function sortedLessons(lessons: Lesson[]): Lesson[] {
  return [...lessons].sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
}

function pickFirstLesson(lessons: Lesson[]): Lesson | null {
  const sorted = sortedLessons(lessons);
  return sorted[0] ?? null;
}

function findNextLesson(
  lessons: Lesson[],
  current: Lesson,
  passed: Set<string>,
): Lesson | null {
  const sorted = sortedLessons(lessons);
  const currentIdx = sorted.findIndex(l => l.id === current.id);
  if (currentIdx < 0) return null;
  for (let i = currentIdx + 1; i < sorted.length; i++) {
    const candidate = sorted[i]!;
    // Skip lessons the user has already passed — they don't need them again.
    if (passed.has(candidate.id)) continue;
    // All prerequisites must be passed (or be the current lesson itself).
    const prereqsOk = candidate.prerequisites.every(
      p => p === current.id || passed.has(p),
    );
    if (prereqsOk) return candidate;
  }
  return null;
}

function aggregateWeak(
  mistakes: Mistake[],
  recentSessionIds: Set<string>,
): Array<{ grapheme: string; count: number; kind: string }> {
  const buckets = new Map<string, { grapheme: string; count: number; kind: string }>();
  for (const m of mistakes) {
    if (!recentSessionIds.has(m.sessionId)) continue;
    const key = `${m.expectedGrapheme}::${m.kind}`;
    const b = buckets.get(key);
    if (b) b.count++;
    else buckets.set(key, { grapheme: m.expectedGrapheme, count: 1, kind: m.kind });
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count);
}
