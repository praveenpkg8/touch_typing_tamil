/**
 * Validator types — see docs/design-freeze.md §6 and §9.
 */

export type MistakeKind =
  | 'wrong-key'
  | 'wrong-mei'
  | 'wrong-uyir'
  | 'wrong-vowel-sign'
  | 'missing-pulli'
  | 'extra-pulli'
  | 'transposition'
  | 'extra-keystroke'
  | 'omission';

export interface ValidationResult {
  wasCorrect: boolean;
  mistakeKind: MistakeKind | null;
  cursorPosCodepoints: number;
  cursorPosGraphemes: number;
  /** The target grapheme the user is currently working on. */
  expectedGrapheme: string | null;
  /** The grapheme the user actually produced at the divergence point (mistakes only). */
  typedGrapheme: string | null;
  /** True if composer.currentString exactly equals the target text. */
  isComplete: boolean;
}
