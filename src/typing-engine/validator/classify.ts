/**
 * Mistake classification — pure function from (expected, typed) to MistakeKind.
 * See docs/design-freeze.md §6.
 */

import type { MistakeKind } from './types.ts';
import { PULLI_CODEPOINT } from '../composer/classify.ts';
import { classifyCodepoint } from '../composer/classify.ts';

/**
 * Decompose a Tamil grapheme into (mei | uyir, rest).
 *   "க"   → ['mei', 'க', '']
 *   "கா"  → ['mei', 'க', 'ா']
 *   "க்"  → ['mei', 'க', '்']
 *   "க்ஷ" → ['mei', 'க', '்ஷ']  (compound; first mei is the base)
 *   "அ"   → ['uyir', 'அ', '']
 *   " "   → ['other', ' ', '']
 */
function decompose(g: string): { kind: 'mei' | 'uyir' | 'other'; head: string; tail: string } {
  if (g === '') return { kind: 'other', head: '', tail: '' };
  const codepoints = [...g];
  const firstCp = codepoints[0]!.codePointAt(0)!;
  const headKind = classifyCodepoint(firstCp);
  if (headKind === 'mei') {
    return { kind: 'mei', head: codepoints[0]!, tail: codepoints.slice(1).join('') };
  }
  if (headKind === 'uyir') {
    return { kind: 'uyir', head: codepoints[0]!, tail: codepoints.slice(1).join('') };
  }
  return { kind: 'other', head: codepoints[0]!, tail: codepoints.slice(1).join('') };
}

export function classifyMistake(
  expected: string | null,
  typed: string | null,
): MistakeKind {
  if (typed === null || typed === '') return 'omission';
  if (expected === null || expected === '') return 'extra-keystroke';

  const e = decompose(expected);
  const t = decompose(typed);

  // Both are consonant-rooted graphemes
  if (e.kind === 'mei' && t.kind === 'mei') {
    if (e.head === t.head) {
      // Same base consonant; difference is in the tail (vowel sign / pulli)
      const eHasPulli = e.tail.includes(PULLI_CODEPOINT);
      const tHasPulli = t.tail.includes(PULLI_CODEPOINT);
      if (eHasPulli && !tHasPulli) return 'missing-pulli';
      if (!eHasPulli && tHasPulli) return 'extra-pulli';
      // Same mei, different vowel sign (or one bare and one signed)
      return 'wrong-vowel-sign';
    }
    return 'wrong-mei';
  }

  // Both are independent vowels
  if (e.kind === 'uyir' && t.kind === 'uyir') {
    return 'wrong-uyir';
  }

  // Mismatched kinds (mei vs uyir, etc.) — closest taxonomy is wrong-key
  return 'wrong-key';
}
