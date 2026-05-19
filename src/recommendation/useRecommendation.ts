/**
 * useRecommendation — React hook that returns the current Recommendation
 * for the local user. Reactive: re-runs whenever sessions/attempts/mistakes
 * change in Dexie.
 *
 * Pipeline:
 *   1. Compute fresh recommendation from current persistence snapshot.
 *   2. Read the previously-shown recommendation from localStorage.
 *   3. Run hysteresis to decide whether to swap.
 *   4. Persist the chosen recommendation for next time.
 *
 * Returns:
 *   - undefined while data is still loading
 *   - a Recommendation object otherwise
 */

import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_USER_ID } from '../persistence/index.ts';
import { LESSONS } from '../content/lessons/index.ts';
import { computeRecommendation } from './computeRecommendation.ts';
import { applyHysteresis } from './hysteresis.ts';
import {
  readPersistedRecommendation,
  writePersistedRecommendation,
} from './persistence.ts';
import type { Recommendation } from './types.ts';

const RECENT_SESSIONS_LIMIT = 10;

export function useRecommendation(): Recommendation | undefined {
  const recentSessions = useLiveQuery(
    async () => {
      const all = await db.sessions
        .where('userId')
        .equals(DEFAULT_USER_ID)
        .reverse()
        .sortBy('createdAt');
      return all.slice(0, RECENT_SESSIONS_LIMIT);
    },
    [],
    undefined,
  );

  const attempts = useLiveQuery(
    () => db.lessonAttempts.where('userId').equals(DEFAULT_USER_ID).toArray(),
    [],
    undefined,
  );

  const mistakes = useLiveQuery(
    () => db.mistakes.where('userId').equals(DEFAULT_USER_ID).toArray(),
    [],
    undefined,
  );

  const final = useMemo(() => {
    if (!recentSessions || !attempts || !mistakes) return undefined;
    const fresh = computeRecommendation({
      lessons: LESSONS,
      recentSessions,
      attempts,
      mistakes,
      now: new Date(),
    });
    const prev = readPersistedRecommendation();
    const lastSession = recentSessions[0] ?? null;
    return applyHysteresis(prev, fresh, lastSession);
  }, [recentSessions, attempts, mistakes]);

  // Persist the chosen recommendation so the next computation has prev to
  // compare against. Side effect lives in useEffect, not useMemo.
  useEffect(() => {
    if (final) writePersistedRecommendation(final);
  }, [final]);

  return final;
}
