/**
 * Validator — compares composer output against target text, advances grapheme
 * cursor on correct keystrokes, classifies mistakes when divergence is
 * detected. Strict mode: cursor does not advance on incorrect keystroke.
 *
 * See docs/design-freeze.md §9.
 */

import { segmentGraphemes } from '../segmenter/index.ts';
import { classifyMistake } from './classify.ts';
import type { MistakeKind, ValidationResult } from './types.ts';

interface Target {
  text: string;
  graphemes: string[];
}

export class Validator {
  private target: Target;
  private cursorGraphemes: number = 0;
  private cursorCodepoints: number = 0;

  constructor(targetText: string) {
    this.target = {
      text: targetText,
      graphemes: segmentGraphemes(targetText),
    };
  }

  get targetText(): string { return this.target.text; }
  get targetGraphemes(): readonly string[] { return this.target.graphemes; }
  get cursorPosGraphemes(): number { return this.cursorGraphemes; }
  get cursorPosCodepoints(): number { return this.cursorCodepoints; }
  get isComplete(): boolean { return this.cursorCodepoints === this.target.text.length; }

  reset(): void {
    this.cursorGraphemes = 0;
    this.cursorCodepoints = 0;
  }

  /**
   * Validate the composer's currentString against the target.
   * Call this AFTER each composer.step(). Pure function of (composerString).
   */
  validate(composerString: string): ValidationResult {
    const isPrefix = this.target.text.startsWith(composerString);
    const isComplete = composerString === this.target.text;

    if (isPrefix) {
      // Correct keystroke. Update cursor.
      const typedGraphemes = segmentGraphemes(composerString);
      this.cursorGraphemes = this.countMatchedGraphemes(typedGraphemes);
      this.cursorCodepoints = composerString.length;
      return {
        wasCorrect: true,
        mistakeKind: null,
        cursorPosCodepoints: this.cursorCodepoints,
        cursorPosGraphemes: this.cursorGraphemes,
        expectedGrapheme: this.target.graphemes[this.cursorGraphemes] ?? null,
        typedGrapheme: typedGraphemes[this.cursorGraphemes] ?? null,
        isComplete,
      };
    }

    // Divergence — classify mistake.
    const typedGraphemes = segmentGraphemes(composerString);
    const matchUpTo = this.countMatchedGraphemes(typedGraphemes);
    const expectedGrapheme = this.target.graphemes[matchUpTo] ?? null;
    const typedGrapheme = typedGraphemes[matchUpTo] ?? null;
    const mistakeKind: MistakeKind = classifyMistake(expectedGrapheme, typedGrapheme);

    // Cursor stays at the last validated position (strict mode).
    return {
      wasCorrect: false,
      mistakeKind,
      cursorPosCodepoints: this.cursorCodepoints,
      cursorPosGraphemes: this.cursorGraphemes,
      expectedGrapheme,
      typedGrapheme,
      isComplete: false,
    };
  }

  private countMatchedGraphemes(typed: string[]): number {
    let i = 0;
    while (i < typed.length && i < this.target.graphemes.length) {
      if (typed[i] === this.target.graphemes[i]) i++;
      else break;
    }
    return i;
  }
}
