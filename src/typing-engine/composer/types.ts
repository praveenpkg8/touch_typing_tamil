/**
 * Type definitions for the KeyComposer.
 * See docs/design-freeze.md §7 for the contract.
 */

export type AtomicKind = 'mei' | 'uyir' | 'vowel-sign' | 'mei+pulli' | 'other';

export type EmittedKind =
  | 'mei'
  | 'mei+pulli'
  | 'vowel-sign'
  | 'uyir'
  | 'other'
  | 'none';

export type ComposerOp =
  | 'emit'           // default: atomic added to currentString tail
  | 'substitute'     // R3: replaced trailing uyir with vowel sign
  | 'pulli-attach'   // R2: appended pulli after mei
  | 'auto-pulli'     // R4 or R7: inserted pulli into prior mei, then emitted new mei
  | 'delink'         // R6: mei + அ — emitted nothing, set delinkNext
  | 'noop'           // R1: unmapped key
  | 'exception'      // post-process override (ZWNJ insertion etc.)
  | 'backspace';     // user pressed backspace

export interface AtomicEntry {
  output: string;
  kind: AtomicKind;
}

export interface ComposerInput {
  code: string;        // event.code (physical key identity, locale-independent)
  shift: boolean;
  altGr: boolean;
  isBackspace: boolean;
  ts: number;          // performance.now() at keydown
}

export interface ComposerSnapshot {
  lastEmittedKind: EmittedKind;
  lastMei: string | null;
  delinkNext: boolean;
}

export interface EmittedToken {
  triggeringCode: string;
  shift: boolean;
  altGr: boolean;
  isBackspace: boolean;
  op: ComposerOp;
  /** Codepoints removed from the tail of currentString (substitution / auto-pulli). */
  before: string;
  /** Codepoints appended to currentString. */
  after: string;
  /** Kind of the LAST codepoint of the emission, or 'none' for empty emissions. */
  kindAfter: EmittedKind;
  /** State before this token was applied — used by backspace to roll back. */
  prevSnapshot: ComposerSnapshot;
}
