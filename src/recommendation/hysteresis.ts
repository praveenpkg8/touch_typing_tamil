/**
 * Hysteresis on recommendation transitions.
 *
 * Without hysteresis, the recommendation can flip every session if the
 * user oscillates around a threshold. Concretely, "user passed L02 at 96%
 * then practiced L02 again and got 78%" would flip recommendation from
 * "next-lesson:L03" to "retry-lesson:L02" — feels like a regression for
 * the user.
 *
 * Design (informed by design-freeze §11):
 *   - The "last shown" recommendation is persisted in localStorage.
 *   - On each fresh computation we compare against the persisted one.
 *   - Critical kinds (targeted-drill, refresher, all-done, start-first)
 *     are always honored — they're not regressions, they're new signals.
 *   - The "next-lesson(X) → retry-lesson(X) on the SAME lesson" transition
 *     is the only one that triggers margin-based suppression. We only flip
 *     to retry if accuracy is meaningfully below the threshold (5 points,
 *     i.e., accuracyGraphemes < 75 instead of < 80). This prevents one bad
 *     practice run after passing from regressing the user's guidance.
 *   - Anti-promotion is intentionally NOT applied — if the user crosses
 *     the advance threshold, they should be acknowledged immediately.
 *
 * Everything is a pure function. localStorage is touched only by
 * persistRec / readPersistedRec (separate file).
 */

import type { Session } from '../persistence/index.ts';
import type { Recommendation } from './types.ts';

const LOW_ACCURACY_THRESHOLD = 80;
const REGRESSION_MARGIN = 5;

export function recommendationsEqual(a: Recommendation, b: Recommendation): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'start-first':
    case 'next-lesson':
    case 'retry-lesson':
    case 'refresher':
      return a.lessonId === (b as typeof a).lessonId;
    case 'targeted-drill':
      return a.weakGraphemes.join('|') === (b as typeof a).weakGraphemes.join('|');
    case 'all-done':
      return true;
  }
}

function isCritical(kind: Recommendation['kind']): boolean {
  return (
    kind === 'targeted-drill' ||
    kind === 'refresher' ||
    kind === 'all-done' ||
    kind === 'start-first'
  );
}

export function applyHysteresis(
  prev: Recommendation | null,
  next: Recommendation,
  lastSession: Session | null,
): Recommendation {
  if (prev === null) return next;
  if (recommendationsEqual(prev, next)) return next;

  // Always honor critical kinds — these surface new signals (urgent drill,
  // stale practice, curriculum complete, brand-new user).
  if (isCritical(next.kind)) return next;

  // The single guarded transition: next-lesson(X) → retry-lesson(X) on the
  // SAME lesson. Only flip if the trigger crosses the threshold by a
  // meaningful margin; otherwise keep showing the advance.
  if (
    prev.kind === 'next-lesson' &&
    next.kind === 'retry-lesson' &&
    prev.lessonId === next.lessonId
  ) {
    if (lastSession === null) return prev;
    if (lastSession.accuracyGraphemes < LOW_ACCURACY_THRESHOLD - REGRESSION_MARGIN) {
      return next; // bad enough to actually regress the recommendation
    }
    return prev; // within margin — stick with the previous advance suggestion
  }

  // All other transitions (different lessons, retry→next promotion, etc.)
  // are honored.
  return next;
}
