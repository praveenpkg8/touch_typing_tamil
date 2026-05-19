/**
 * Tamil Unicode codepoint classification. Pure functions.
 * Tamil block: U+0B80–U+0BFF.
 */

import type { AtomicKind, EmittedKind } from './types.ts';

export const PULLI_CODEPOINT = '்';

/**
 * Classify a single codepoint by its Tamil Unicode role.
 * Pulli is reported as 'mei+pulli' — by itself it indicates the *result* of
 * attaching pulli to a mei, which is the state we want downstream.
 */
export function classifyCodepoint(cp: number): AtomicKind {
  if (cp === 0x0BCD) return 'mei+pulli';
  if (cp >= 0x0B85 && cp <= 0x0B94) return 'uyir';
  if (cp >= 0x0B95 && cp <= 0x0BB9) return 'mei';
  if (cp >= 0x0BBE && cp <= 0x0BCC) return 'vowel-sign';
  return 'other';
}

/**
 * Classify an emission (possibly multi-codepoint) by its last codepoint.
 * Used to determine the composer's `kindAfter` state after an emission.
 */
export function classifyEmission(output: string): EmittedKind {
  if (!output) return 'none';
  const codepoints = [...output];
  const last = codepoints[codepoints.length - 1]!;
  return classifyCodepoint(last.codePointAt(0)!);
}
