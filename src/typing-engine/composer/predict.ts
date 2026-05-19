/**
 * predictNextKey — given a composer in some state and a target text, return
 * the single key whose press would advance composer.currentString toward
 * matching the target. Returns null when no candidate works (user has
 * diverged from the target, or target is already complete).
 *
 * Algorithm: brute-force across all candidate (code, shift, altGr) tuples.
 * For each, we step() the composer, observe the new currentString, then
 * step(backspace) to roll back. Because step+backspace is symmetric for
 * every composer op (emit, substitute, pulli-attach, auto-pulli, delink,
 * exception, noop), the composer state at return is identical to entry.
 *
 * Candidate order prefers simple keys (unshifted, then shifted, then
 * AltGr) so a target reachable via multiple paths defaults to the most
 * pedagogically natural one. The first candidate that advances the
 * prefix correctly is returned.
 *
 * Cost: ~100 candidates × 2 composer ops each. Sub-millisecond on modern
 * hardware. Safe to call from the hot path.
 */

import keymapData from './keymap.json' with { type: 'json' };
import { KeyComposer } from './KeyComposer.ts';

interface KeymapShape {
  unshifted: Record<string, unknown>;
  shifted: Record<string, unknown>;
  altgr: Record<string, unknown>;
  altgrShift: Record<string, unknown>;
}

const KEYMAP: KeymapShape = keymapData as unknown as KeymapShape;

export interface PredictedKey {
  code: string;
  shift: boolean;
  altGr: boolean;
}

const BACKSPACE_INPUT = {
  code: 'Backspace',
  shift: false,
  altGr: false,
  isBackspace: true,
  ts: 0,
} as const;

let cachedCandidates: PredictedKey[] | null = null;

function getCandidates(): PredictedKey[] {
  if (cachedCandidates !== null) return cachedCandidates;
  const out: PredictedKey[] = [];
  for (const code of Object.keys(KEYMAP.unshifted).sort()) {
    out.push({ code, shift: false, altGr: false });
  }
  // Space is handled via composer's PASSTHROUGH (not in keymap.json), but
  // it's a valid candidate for any target containing a literal space.
  out.push({ code: 'Space', shift: false, altGr: false });
  for (const code of Object.keys(KEYMAP.shifted).sort()) {
    out.push({ code, shift: true, altGr: false });
  }
  for (const code of Object.keys(KEYMAP.altgr).sort()) {
    out.push({ code, shift: false, altGr: true });
  }
  for (const code of Object.keys(KEYMAP.altgrShift).sort()) {
    out.push({ code, shift: true, altGr: true });
  }
  cachedCandidates = out;
  return out;
}

export function predictNextKey(composer: KeyComposer, targetText: string): PredictedKey | null {
  const current = composer.currentString;
  if (current === targetText) return null;
  if (!targetText.startsWith(current)) return null; // user has diverged

  // Pick the candidate that advances the MOST while still being a valid prefix
  // of the target. Ties are broken by candidate order (unshifted before
  // shifted before altGr, then lexical by code). The longest-advancement
  // rule matches m17n's longest-prefix logic for free, so e.g. for target
  // "க்க" after typing "க", the predictor returns KeyH (R4 gemination,
  // advances by 2 codepoints) rather than KeyF (advances by 1).
  let best: PredictedKey | null = null;
  let bestAdvanceLen = current.length;

  for (const candidate of getCandidates()) {
    composer.step({
      code: candidate.code,
      shift: candidate.shift,
      altGr: candidate.altGr,
      isBackspace: false,
      ts: 0,
    });
    const after = composer.currentString;
    composer.step(BACKSPACE_INPUT);

    if (after.length > bestAdvanceLen && targetText.startsWith(after)) {
      best = candidate;
      bestAdvanceLen = after.length;
    }
  }
  return best;
}
