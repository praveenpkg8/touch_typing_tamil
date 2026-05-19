/**
 * localStorage persistence for the last-shown recommendation.
 *
 * Kept separate from hysteresis.ts so the pure logic stays testable
 * without DOM dependencies. Both reads and writes silently swallow
 * errors — localStorage may be unavailable (private browsing, quota,
 * SSR pre-hydration) and hysteresis should degrade gracefully to
 * "no previous" rather than crashing.
 */

import type { Recommendation } from './types.ts';

const STORAGE_KEY = 'tamil99.lastShownRecommendation';

export function readPersistedRecommendation(): Recommendation | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPlausibleRecommendation(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePersistedRecommendation(rec: Recommendation): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
  } catch {
    // Quota / disabled — silently ignore.
  }
}

export function clearPersistedRecommendation(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Cheap shape check so corrupted localStorage doesn't blow up the app.
 * Doesn't try to be exhaustive — just enough that downstream consumers
 * can treat the value as a Recommendation safely.
 */
function isPlausibleRecommendation(v: unknown): v is Recommendation {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (typeof r.kind !== 'string') return false;
  switch (r.kind) {
    case 'start-first':
    case 'next-lesson':
    case 'retry-lesson':
    case 'refresher':
      return typeof r.lessonId === 'string' && typeof r.reason === 'string';
    case 'targeted-drill':
      return Array.isArray(r.weakGraphemes) && typeof r.reason === 'string';
    case 'all-done':
      return typeof r.reason === 'string';
    default:
      return false;
  }
}
