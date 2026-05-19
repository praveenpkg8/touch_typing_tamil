/**
 * KeyComposer — rule-based Tamil99 input layer.
 *
 * Consumes a stream of ComposerInput (physical keystrokes), applies the
 * 8 m17n composition rules (R1–R8) plus an exception override, and produces
 * a stream of EmittedToken — one per keystroke. See docs/design-freeze.md §7.
 *
 * The composer maintains an append-only event log that is the source of truth
 * for backspace rollback and for downstream analytics. State (lastEmittedKind,
 * lastMei, delinkNext) is derivable from the log if rebuilt; the field copies
 * exist only for hot-path lookups.
 */

import keymapData from './keymap.json' with { type: 'json' };
import { classifyEmission, PULLI_CODEPOINT } from './classify.ts';
import type {
  AtomicEntry,
  AtomicKind,
  ComposerInput,
  ComposerSnapshot,
  EmittedKind,
  EmittedToken,
} from './types.ts';

// ─────────────────────────────────────────────────────────────────────────
// Keymap loading + lookup tables
// ─────────────────────────────────────────────────────────────────────────

interface KeymapShape {
  unshifted: Record<string, AtomicEntry>;
  shifted: Record<string, AtomicEntry>;
  altgr: Record<string, AtomicEntry>;
  altgrShift: Record<string, AtomicEntry>;
  uyirToSign: Record<string, string | null>;
  softHardPairs: Array<[string, string]>;
  pulliCode: string;
}

const KEYMAP: KeymapShape = keymapData as unknown as KeymapShape;

const SOFT_HARD_NEXT: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [soft, hard] of KEYMAP.softHardPairs) m.set(soft, hard);
  return m;
})();

function isSoftHardPair(prev: string | null, next: string): boolean {
  if (prev === null) return false;
  return SOFT_HARD_NEXT.get(prev) === next;
}

/**
 * Passthrough for keys the .mim doesn't bind. Currently only Space —
 * m17n input methods pass unbound printable keys through to the document
 * unchanged, and Space is the only one our lessons need.
 */
const PASSTHROUGH: Record<string, AtomicEntry> = {
  Space: { output: ' ', kind: 'other' },
};

function lookupAtomic(input: ComposerInput): AtomicEntry | null {
  const layer = input.altGr
    ? (input.shift ? KEYMAP.altgrShift : KEYMAP.altgr)
    : (input.shift ? KEYMAP.shifted    : KEYMAP.unshifted);
  const fromMim = layer[input.code];
  if (fromMim) return fromMim;
  // Fall back to passthrough table for unbound keys (only Space for now).
  if (!input.altGr && !input.shift) return PASSTHROUGH[input.code] ?? null;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Exception matcher
// ─────────────────────────────────────────────────────────────────────────

interface ExceptionFixture {
  inputs: Array<{ code: string; shift: boolean; altGr: boolean }>;
  output: string;
}

interface ExceptionMatch {
  length: number;
  output: string;
}

function inputKey(i: { code: string; shift: boolean; altGr: boolean }): string {
  return `${i.code}|${i.shift ? 1 : 0}|${i.altGr ? 1 : 0}`;
}

export class ExceptionMatcher {
  private byPattern: Map<string, ExceptionMatch> = new Map();
  private maxLength = 0;

  constructor(exceptions: ExceptionFixture[]) {
    for (const ex of exceptions) {
      const pattern = ex.inputs.map(inputKey).join('>');
      this.byPattern.set(pattern, { length: ex.inputs.length, output: ex.output });
      if (ex.inputs.length > this.maxLength) this.maxLength = ex.inputs.length;
    }
  }

  /**
   * Find the LONGEST exception whose key sequence equals the suffix of `log`.
   * Returns null if no exception matches.
   */
  match(log: EmittedToken[]): ExceptionMatch | null {
    const maxN = Math.min(this.maxLength, log.length);
    for (let n = maxN; n >= 2; n--) {
      const suffix = log.slice(-n);
      const pattern = suffix.map(t => `${t.triggeringCode}|${t.shift ? 1 : 0}|${t.altGr ? 1 : 0}`).join('>');
      const found = this.byPattern.get(pattern);
      if (found && found.length === n) return found;
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// KeyComposer
// ─────────────────────────────────────────────────────────────────────────

export class KeyComposer {
  private lastEmittedKind: EmittedKind = 'none';
  /**
   * The FULL atomic output of the most recent mei emission (not just the last
   * codepoint). Cleared when a non-mei is emitted. Tracked as the full atomic
   * so R4 (gemination) can match multi-codepoint mei conjuncts like `க்ஷ`
   * against themselves — m17n treats the conjunct as a single "mei unit".
   */
  private lastMei: string | null = null;
  private delinkNext: boolean = false;
  private log: EmittedToken[] = [];
  private _currentString: string = '';
  private exceptions: ExceptionMatcher;

  constructor(exceptions: ExceptionFixture[] = []) {
    this.exceptions = new ExceptionMatcher(exceptions);
  }

  get currentString(): string { return this._currentString; }
  get eventLog(): readonly EmittedToken[] { return this.log; }

  reset(): void {
    this.lastEmittedKind = 'none';
    this.lastMei = null;
    this.delinkNext = false;
    this.log = [];
    this._currentString = '';
  }

  /**
   * Process one input keystroke. Returns the emitted token (also pushed to log).
   */
  step(input: ComposerInput): EmittedToken {
    if (input.isBackspace) return this.doBackspace(input);

    const atomic = lookupAtomic(input);
    if (atomic === null) return this.pushNoop(input);

    const snapshot = this.snapshot();
    let token: EmittedToken;

    // AltGr emissions bypass composition rules (R2–R7).
    if (input.altGr) {
      token = this.applyDefaultEmit(atomic, input, snapshot);
    }
    // R2: pulli after mei
    else if (atomic.output === PULLI_CODEPOINT && this.lastEmittedKind === 'mei') {
      token = this.applyR2_pulliAttach(atomic, input, snapshot);
    }
    // R3 / R6: uyir after mei (subject to delinkNext)
    else if (atomic.kind === 'uyir' && this.lastEmittedKind === 'mei' && !this.delinkNext) {
      if (atomic.output === 'அ') {
        token = this.applyR6_delink(atomic, input, snapshot);
      } else {
        token = this.applyR3_uyirSubstitution(atomic, input, snapshot);
      }
    }
    // R4: gemination
    else if (
      atomic.kind === 'mei' &&
      this.lastMei !== null &&
      this.lastMei === atomic.output &&
      !this.delinkNext
    ) {
      token = this.applyR4_gemination(atomic, input, snapshot);
    }
    // R7: soft-hard pair auto-pulli
    else if (
      atomic.kind === 'mei' &&
      isSoftHardPair(this.lastMei, atomic.output) &&
      !this.delinkNext
    ) {
      token = this.applyR7_softHardPulli(atomic, input, snapshot);
    }
    // Default: just emit the atomic
    else {
      token = this.applyDefaultEmit(atomic, input, snapshot);
    }

    // Single-use delink flag: clears on any non-delink token
    if (token.op !== 'delink') this.delinkNext = false;

    this.log.push(token);

    // Post-process: exception override (e.g., ZWNJ insertion for hfW*)
    const ex = this.exceptions.match(this.log);
    if (ex !== null) this.applyExceptionOverride(ex);

    return this.log[this.log.length - 1]!;
  }

  // ─── Rule implementations ──────────────────────────────────────────────

  private applyDefaultEmit(
    atomic: AtomicEntry,
    input: ComposerInput,
    snapshot: ComposerSnapshot,
  ): EmittedToken {
    this._currentString += atomic.output;
    const kindAfter = classifyEmission(atomic.output);
    this.lastEmittedKind = kindAfter;
    this.lastMei = kindAfter === 'mei' ? atomic.output : null;
    return this.makeToken(input, 'emit', '', atomic.output, kindAfter, snapshot);
  }

  /** R2: pulli after mei — append pulli, advance state to mei+pulli. */
  private applyR2_pulliAttach(
    _atomic: AtomicEntry,
    input: ComposerInput,
    snapshot: ComposerSnapshot,
  ): EmittedToken {
    this._currentString += PULLI_CODEPOINT;
    this.lastEmittedKind = 'mei+pulli';
    this.lastMei = null;
    return this.makeToken(input, 'pulli-attach', '', PULLI_CODEPOINT, 'mei+pulli', snapshot);
  }

  /** R3: uyir after mei — substitute trailing uyir-codepoint never-emitted with vowel sign. */
  private applyR3_uyirSubstitution(
    atomic: AtomicEntry,
    input: ComposerInput,
    snapshot: ComposerSnapshot,
  ): EmittedToken {
    const sign = KEYMAP.uyirToSign[atomic.output];
    if (sign === null || sign === undefined) {
      // Shouldn't happen for non-அ uyirs; defensive fallback to default emit.
      return this.applyDefaultEmit(atomic, input, snapshot);
    }
    this._currentString += sign;
    this.lastEmittedKind = 'vowel-sign';
    this.lastMei = null;
    // 'before' records the codepoint that WOULD have been emitted by the atomic
    // but was replaced (the full uyir). Useful for analytics.
    return this.makeToken(input, 'substitute', atomic.output, sign, 'vowel-sign', snapshot);
  }

  /** R4/R7: insert pulli into prior mei, then emit new mei. */
  private applyAutoPulli(
    atomic: AtomicEntry,
    input: ComposerInput,
    snapshot: ComposerSnapshot,
    op: 'auto-pulli',
  ): EmittedToken {
    // Insert pulli AFTER the prior mei, then append the new mei.
    // After this op: currentString tail is `${priorMei}${pulli}${newMei}`.
    this._currentString += PULLI_CODEPOINT + atomic.output;
    const kindAfter = classifyEmission(atomic.output);
    this.lastEmittedKind = kindAfter;
    this.lastMei = kindAfter === 'mei' ? atomic.output : null;
    return this.makeToken(input, op, '', PULLI_CODEPOINT + atomic.output, kindAfter, snapshot);
  }

  private applyR4_gemination(
    atomic: AtomicEntry,
    input: ComposerInput,
    snapshot: ComposerSnapshot,
  ): EmittedToken {
    return this.applyAutoPulli(atomic, input, snapshot, 'auto-pulli');
  }

  private applyR7_softHardPulli(
    atomic: AtomicEntry,
    input: ComposerInput,
    snapshot: ComposerSnapshot,
  ): EmittedToken {
    return this.applyAutoPulli(atomic, input, snapshot, 'auto-pulli');
  }

  /** R6: mei + அ — emit nothing, set delinkNext for one stroke. */
  private applyR6_delink(
    _atomic: AtomicEntry,
    input: ComposerInput,
    snapshot: ComposerSnapshot,
  ): EmittedToken {
    this.delinkNext = true;
    // lastEmittedKind and lastMei are unchanged (the prior mei still "owns" the cursor).
    return this.makeToken(input, 'delink', '', '', this.lastEmittedKind, snapshot);
  }

  // ─── Exception override ────────────────────────────────────────────────

  /**
   * Rewrite the last `match.length` tokens so the combined emission equals
   * `match.output`. The intermediate per-keystroke tokens are kept; only the
   * LAST token is mutated to swallow the difference. Used for ZWNJ insertions
   * (hfW family) that can't be derived from R1–R8.
   */
  private applyExceptionOverride(match: ExceptionMatch): void {
    const matched = this.log.slice(-match.length);
    // Net contribution of the matched tokens to currentString:
    //   sum of `.after` lengths minus sum of `.before` lengths.
    let ruleEmission = '';
    for (const t of matched) {
      // Reconstruct what each token added net.
      // For 'substitute': it added `after`, but it also "replaced" before — though
      //   `before` didn't yet exist as visible chars (it was an atomic that never emitted).
      //   So the visible net is just `after`.
      // For 'auto-pulli': it added `after`.
      // For 'delink' / 'noop': it added nothing.
      ruleEmission += t.after;
    }
    if (ruleEmission === match.output) return; // no override needed

    // Remove the rule-based tail and replace with the exception's output.
    if (ruleEmission.length > 0) {
      this._currentString = this._currentString.slice(0, this._currentString.length - ruleEmission.length);
    }
    this._currentString += match.output;

    // Mutate the LAST token to reflect the override.
    // The prefix N-1 tokens collectively contributed `ruleEmission - lastToken.after`
    // pre-override. After override, the prefix is still those characters; the
    // last token now contributes `match.output - prefixContribution`.
    const last = this.log[this.log.length - 1]!;
    const prefixContribution = ruleEmission.slice(0, ruleEmission.length - last.after.length);
    const newAfter = match.output.slice(prefixContribution.length);

    // Reclassify based on new emission.
    const kindAfter = classifyEmission(this._currentString);
    this.lastEmittedKind = kindAfter;
    this.lastMei = kindAfter === 'mei' ? this.tailCodepoint(this._currentString) : null;

    this.log[this.log.length - 1] = {
      ...last,
      op: 'exception',
      after: newAfter,
      kindAfter,
    };
  }

  // ─── Backspace ─────────────────────────────────────────────────────────

  private doBackspace(input: ComposerInput): EmittedToken {
    // The internal log holds ONLY emission tokens (things present in
    // currentString). Backspace itself produces no characters and is NOT
    // appended to the log — otherwise consecutive backspaces would pop
    // empty backspace tokens and appear to do nothing every other press.
    // The KeystrokeEvent record for the backspace is created downstream
    // (typingEngineStore.handleKey) for analytics, independent of the log.
    if (this.log.length === 0) {
      const snapshot = this.snapshot();
      return this.makeToken(input, 'backspace', '', '', this.lastEmittedKind, snapshot);
    }
    const popped = this.log.pop()!;
    // Reverse the popped token's contribution to currentString.
    if (popped.after.length > 0) {
      this._currentString = this._currentString.slice(
        0,
        this._currentString.length - popped.after.length,
      );
    }
    // For 'substitute' the suppressed `before` codepoint was never visible,
    // so we don't restore it. For 'auto-pulli' the `after` already includes
    // the inserted pulli + new mei, both of which are removed by the slice
    // above. So no extra restoration is needed in either case.

    // Restore the composer state to what it was BEFORE the popped token.
    this.lastEmittedKind = popped.prevSnapshot.lastEmittedKind;
    this.lastMei = popped.prevSnapshot.lastMei;
    this.delinkNext = popped.prevSnapshot.delinkNext;

    const snapshot = this.snapshot();
    return this.makeToken(input, 'backspace', popped.after, '', this.lastEmittedKind, snapshot);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private pushNoop(input: ComposerInput): EmittedToken {
    const snapshot = this.snapshot();
    const token = this.makeToken(input, 'noop', '', '', this.lastEmittedKind, snapshot);
    this.log.push(token);
    // delinkNext is NOT cleared by a noop — feels right; an unmapped key
    // (function key, modifier alone) shouldn't reset Tamil composition state.
    return token;
  }

  private snapshot(): ComposerSnapshot {
    return {
      lastEmittedKind: this.lastEmittedKind,
      lastMei: this.lastMei,
      delinkNext: this.delinkNext,
    };
  }

  private makeToken(
    input: ComposerInput,
    op: EmittedToken['op'],
    before: string,
    after: string,
    kindAfter: EmittedKind,
    prevSnapshot: ComposerSnapshot,
  ): EmittedToken {
    return {
      triggeringCode: input.code,
      shift: input.shift,
      altGr: input.altGr,
      isBackspace: input.isBackspace,
      op,
      before,
      after,
      kindAfter,
      prevSnapshot,
    };
  }

  /** Returns the last codepoint of `s` as a one-char string. */
  private tailCodepoint(s: string): string | null {
    if (s === '') return null;
    const cps = [...s];
    return cps[cps.length - 1] ?? null;
  }
}
