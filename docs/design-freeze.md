# Tamil99 Typing Tutor — Design Freeze

**Status:** Draft v1 — captures decisions made during BRD analysis on 2026-05-19.
**Owner:** Praveen G.
**Purpose:** This is the engineering contract for the MVP. It records what is **locked** (must not change without a follow-up review) and what is **draft** (starting defaults, can evolve while implementing).

This document is **not** a re-statement of the BRD. The BRD captures product intent; this document captures the technical decisions that flow from it.

---

## 1. Scope of the freeze

This freeze covers the MVP only (BRD Phase 1). Phase 2+ items are noted where they affect MVP decisions (e.g., schema must be sync-ready) but not specified in detail.

In scope:
- KeyComposer (Tamil99 input layer)
- Validator + analytics handoff
- Persistence schema
- Lesson content schema
- Frontend stack
- Mistake taxonomy + metrics conventions

Out of scope (deferred):
- Google Drive sync implementation (Phase 3)
- PWA install / offline service worker (Phase 4)
- Gamification, classroom mode (Phase 4)
- Mobile / soft-keyboard support (deferred indefinitely)

---

## 2. Architecture

```
┌────────────────────────────────────────────────────────────┐
│  React UI (Vite + TS)                                      │
│   LessonRunner • KeyboardWidget • Dashboard • Report       │
└────────────┬───────────────────────────────────────────────┘
             │  (React re-renders scoped to cursor + mistakes)
             ▼
┌────────────────────────────────────────────────────────────┐
│  TypingEngine (in-memory, ref-held, sub-frame)             │
│   ┌──────────────────┐    ┌────────────────────────────┐   │
│   │ KeyComposer      │ →  │ GraphemeSegmenter          │   │
│   │ event.code →     │    │ Intl.Segmenter('ta', ...)  │   │
│   │ Tamil codepoint  │    └────────────┬───────────────┘   │
│   │ (with state m/c) │                 ▼                   │
│   └──────────────────┘    ┌────────────────────────────┐   │
│                            │ Validator                  │   │
│                            │ target ⟷ typed grapheme    │   │
│                            │ emits MistakeRecord +      │   │
│                            │ KeystrokeEvent log         │   │
│                            └────────────┬───────────────┘   │
└─────────────────────────────────────────┼───────────────────┘
                                          │
                  ┌───────────────────────┴────┐
                  ▼                            ▼
         ┌────────────────┐         ┌───────────────────────┐
         │ Session log    │         │ Live HUD reducer      │
         │ (append-only,  │         │ CPM, accuracy, hints  │
         │ batched IDB)   │         │ (no IDB writes)       │
         └────────┬───────┘         └───────────────────────┘
                  │ on session_end
                  ▼
         ┌────────────────────────────────────┐
         │ Analytics & Recommendation         │
         │ pure functions over Dexie tables,  │
         │ result cached in 'recommendations' │
         └────────────────────────────────────┘
```

---

## 3. Locked decisions

| # | Decision | Choice | Why it's locked |
|---|---|---|---|
| L1 | Input model | Raw `event.code` interception; app owns Tamil99 mapping | Changes the whole event stream shape |
| L2 | Char unit (user-facing metrics) | Grapheme cluster (uyirmei) | Changes accuracy, CPM, reports |
| L3 | Char unit (raw signal) | Keystroke; logged separately | Both layers needed for analytics |
| L4 | Form factor | Desktop/laptop only for MVP | Mobile is a different product |
| L5 | Content source (MVP) | Pre-authored static curriculum | Procedural added in Phase 2 |
| L6 | Backspace model | Per-keystroke rollback | Pairs with keystroke log; matches IME convention |
| L7 | Tamil99 reference | m17n `ta-tamil99.mim` | Canonical, open, machine-readable |
| L8 | Storage | IndexedDB via Dexie; LocalStorage for preferences only | Sync-readiness requires structured store |
| L9 | ID strategy | UUIDv7 client-side for all records | Sync conflict-safe; time-sortable |
| L10 | Schema versioning | Every Dexie table is versioned from v1 | Retrofitting migrations is painful |
| L11 | Speed metric | `graphemesPerMinute` (primary) + `keystrokesPerMinute` (secondary). **No WPM.** | "Word" is undefined for Tamil |
| L12 | Capture surface | Custom focusable `<div tabIndex={0}>` listening to keydown | Avoids OS IME collision + unlocks Web Audio gesture |
| L13 | Key identity | `event.code` (physical), never `event.key` | Locale-independent; correct on AZERTY/Dvorak |
| L14 | Modifiers | Read `shiftKey` for grantha layer; ignore CapsLock; ignore `event.repeat` | Tamil has no case; auto-repeat is noise |
| L15 | Build tool | Vite | SPA, no SSR needed, static output |
| L16 | Frontend stack | React 18 + TypeScript (strict) | BRD §16.1 recommendation |
| L17 | State management | Zustand for engine state, React Context for app settings | Engine state is ref-driven; Zustand sidesteps render churn |
| L18 | Schema validation | Zod for lesson files, imports, settings | Runtime validation at boundaries |
| L19 | Tamil font | Noto Sans Tamil bundled (woff2), system Tamil fallback | Cross-OS rendering consistency |
| L20 | Styling | Tailwind for app chrome; CSS modules for the keyboard widget | Per-key state needs named scoped classes |
| L21 | Composer architecture | Rule-based state machine (8 m17n rules), not trie | Per-keystroke analytics required by recommendation engine; trie loses attribution |
| L22 | Pulli key position | `KeyF` (m17n canonical) | Verified against actual `ta-tamil99.mim` — not `BracketRight` as initially assumed |
| L23 | Keyboard layers | Three: unshifted, shifted, AltGr | m17n encodes standalone vowel signs + Tamil numerals on AltGr (`G-x`) |
| L24 | Keymap output split | `keymap.json` (runtime) + `keymap.fixtures.json` (test oracle) separate files | Runtime bundle stays lean; fixtures are large but dev-only |
| L25 | Provenance location | `ta-tamil99.SOURCE.md` next to `.mim`; `keymap.json` carries only `sourceSha256` | Human-readable provenance separate from machine identity |

---

## 4. Data model

All records are stored in IndexedDB via Dexie. Every record has:

- `id: string` — UUIDv7
- `schemaVersion: number` — current = 1
- `userId: string` — defaults to `'local-default'` until multi-profile lands
- `deviceId: string` — random UUID stored once in localStorage on first run
- `createdAt: string` — ISO 8601 with offset (e.g., `2026-05-19T10:30:00+05:30`)

### 4.1 UserProfile

```ts
interface UserProfile {
  id: string;                    // UUIDv7
  schemaVersion: 1;
  userId: string;
  deviceId: string;
  createdAt: string;
  displayName: string | null;    // optional
  lastPracticedAt: string | null;
  syncEnabled: false;            // Phase 3 will widen this type
  preferences: {
    theme: 'light' | 'dark' | 'system';
    soundFeedback: boolean;
    realtimeErrorHighlight: boolean;
  };
}
```

Single row in MVP. Indexed by `userId`.

### 4.2 Session

```ts
interface Session {
  id: string;                    // UUIDv7 sessionId
  schemaVersion: 1;
  userId: string;
  deviceId: string;
  createdAt: string;
  practiceMode: 'character' | 'word' | 'sentence' | 'custom';
  lessonId: string | null;       // null for custom practice
  startedAt: string;
  endedAt: string;
  durationSeconds: number;       // excludes idle (see §10)
  // Targets and outputs
  targetText: string;            // exact target shown
  targetGraphemeCount: number;
  typedGraphemeCount: number;
  correctGraphemes: number;
  incorrectGraphemes: number;
  totalKeystrokes: number;
  correctKeystrokes: number;
  // Metrics
  graphemesPerMinute: number;
  keystrokesPerMinute: number;
  accuracyGraphemes: number;     // 0–100
  accuracyKeystrokes: number;    // 0–100
  // No WPM. Do not add.
}
```

Indexes: `userId`, `createdAt`, `lessonId`.

### 4.3 KeystrokeEvent

The raw event log. Append-only. One row per keystroke (including backspace).

```ts
interface KeystrokeEvent {
  id: string;                    // UUIDv7
  schemaVersion: 1;
  sessionId: string;             // FK to Session
  userId: string;
  sequenceNumber: number;        // monotonic per session, starts at 0
  ts: number;                    // performance.now() at keydown
  code: string;                  // event.code, e.g. 'KeyH'
  shift: boolean;
  // What the layout table mapped this physical key to
  tamil99Char: string | null;    // null = unmapped key (e.g., function keys)
  // What the composer actually did
  composed: {
    op: 'emit' | 'substitute' | 'pulli-attach' | 'noop' | 'backspace';
    before: string | null;       // codepoint replaced (substitution only)
    after: string;               // codepoint(s) emitted (may be empty)
  };
  // Position at time of emission
  cursorPosCodepoints: number;
  cursorPosGraphemes: number;
  // Validator's verdict
  wasCorrect: boolean;
  // If incorrect, what kind of mistake (see §6)
  mistakeKind: MistakeKind | null;
  // The expected grapheme at this cursor position, for analytics
  expectedGrapheme: string | null;
  // The full grapheme that was typed (may include this keystroke + previous)
  typedGrapheme: string | null;
}
```

Indexes: `sessionId`, `userId+createdAt`, `wasCorrect`, `mistakeKind`.

**Retention:** keep indefinitely. Estimated growth: ~1000 events/session × 5 sessions/day × 365 days × ~150 bytes ≈ 270 MB/user/year. Acceptable for IDB. Revisit if user storage warnings appear.

### 4.4 Mistake (denormalized aggregate)

Derived on `session_end`. Not the source of truth — derivable from `KeystrokeEvent` if rebuilt.

```ts
interface Mistake {
  id: string;                    // UUIDv7
  schemaVersion: 1;
  sessionId: string;
  userId: string;
  createdAt: string;
  kind: MistakeKind;
  expectedGrapheme: string;
  typedGrapheme: string;
  expectedCode: string;          // physical key that should have been pressed
  typedCode: string;             // physical key actually pressed
  cursorPosGraphemes: number;
  keystrokeEventIds: string[];   // 1–3 keystroke events that caused this mistake
}
```

Indexes: `userId+kind`, `userId+expectedGrapheme`, `sessionId`.

Why denormalize: weak-key/weak-grapheme queries on the dashboard are hot paths. Scanning the entire `KeystrokeEvent` log every dashboard render is wasteful. The `Mistake` table is the analytics-friendly view.

### 4.5 LessonAttempt

```ts
interface LessonAttempt {
  id: string;                    // UUIDv7
  schemaVersion: 1;
  userId: string;
  lessonId: string;
  sessionId: string;             // the session in which this attempt happened
  createdAt: string;
  status: 'completed' | 'abandoned';
  achievedAccuracyGraphemes: number;
  achievedGPM: number;
  metCompletionCriteria: boolean;
}
```

Indexes: `userId+lessonId`, `lessonId+createdAt`.

Lesson-progress queries (e.g., "is L04 completed?") aggregate over this table:
- `completed = true` if any attempt has `metCompletionCriteria === true`.
- `bestAccuracy = max(achievedAccuracyGraphemes)`.

No separate "LessonProgress" table. Derive, don't denormalize unless dashboard latency demands it.

---

## 5. Lesson schema (the content contract)

Locked. Lesson files live in `/content/lessons/*.json` and are validated by Zod at load time.

```ts
import { z } from 'zod';

export const LessonSchema = z.object({
  id: z.string().regex(/^L\d{2,3}-[a-z0-9-]+$/),
  schemaVersion: z.literal(1),
  level: z.number().int().min(1).max(7),
  type: z.enum(['char_drill', 'word', 'sentence', 'accuracy', 'speed']),
  title: z.object({
    ta: z.string().min(1),
    en: z.string().min(1),
  }),
  introducedGraphemes: z.array(z.string()),
  introducedKeys: z.array(z.string()),        // e.g., ['KeyH', 'KeyQ']
  prerequisites: z.array(z.string()),         // lesson ids
  drills: z.array(z.object({
    target: z.string().min(1),
    repeats: z.number().int().min(1).max(20).default(1),
  })).min(1),
  completion: z.object({
    minAccuracyGraphemes: z.number().min(0).max(100),
    minGPM: z.number().min(0),
  }),
  showComposition: z.enum(['always', 'on-error', 'never']).default('on-error'),
});

export type Lesson = z.infer<typeof LessonSchema>;
```

**Example lesson:**

```jsonc
{
  "id": "L04-uyir-mei-composition",
  "schemaVersion": 1,
  "level": 2,
  "type": "char_drill",
  "title": {
    "ta": "உயிர்மெய் இணைப்பு",
    "en": "Combining consonants and vowels"
  },
  "introducedGraphemes": ["க", "கா", "கி", "கீ", "கு", "கூ"],
  "introducedKeys": ["KeyH", "KeyQ", "KeyS", "KeyW", "KeyD", "KeyE"],
  "prerequisites": ["L03-mei-intro"],
  "drills": [
    { "target": "க கா கி கீ கு கூ", "repeats": 3 },
    { "target": "கா கி கா கி கா கி", "repeats": 2 }
  ],
  "completion": { "minAccuracyGraphemes": 90, "minGPM": 20 },
  "showComposition": "always"
}
```

**Authoring rules:**
- Lesson IDs are immutable once shipped. Add `L04b-...` if a variant is needed.
- `target` strings are Unicode NFC-normalized at build time.
- Build-time validation: every grapheme in `target` must be producible from the keys listed in this lesson's `introducedKeys` ∪ prerequisites' `introducedKeys`. CI fails otherwise.

---

## 6. Mistake taxonomy

Locked enum. Classified at write-time by the Validator, not derived later.

```ts
type MistakeKind =
  | 'wrong-key'           // pressed an entirely unrelated key
  | 'wrong-mei'           // typed a different consonant
  | 'wrong-uyir'          // typed a different vowel (full uyir context)
  | 'wrong-vowel-sign'    // consonant right, vowel sign wrong
  | 'missing-pulli'       // expected dead consonant, got live consonant
  | 'extra-pulli'         // added pulli where not expected
  | 'transposition'       // correct chars, wrong order
  | 'extra-keystroke'     // typed something where nothing expected
  | 'omission';           // skipped a required keystroke
```

Classification logic lives in the Validator. Pseudo-code:

```ts
function classify(expected: Grapheme, typed: Grapheme, ctx: ValidationContext): MistakeKind {
  if (typed === '') return 'omission';
  if (expected === '') return 'extra-keystroke';
  const [eMei, eSign] = decompose(expected);
  const [tMei, tSign] = decompose(typed);
  if (eMei === tMei && eSign !== tSign) return 'wrong-vowel-sign';
  if (eMei !== tMei && eSign === tSign) return 'wrong-mei';
  // ... full table in the implementation
  return 'wrong-key';
}
```

Full classification truth table to be authored alongside the Validator implementation. Lives next to its unit tests.

---

## 7. KeyComposer contract

> **Revised 2026-05-19 after reading the actual m17n `ta-tamil99.mim`.** The original §7 assumed 3 composition rules; the real Tamil99 has 8 documented behaviors. Pulli is on `KeyF`, not `BracketRight`. There is a third layer (AltGr) for standalone vowel signs and Tamil numerals.

### 7.1 Architecture: rule-based, not trie-based

The composer is a **rule-based state machine** that emits one `KeystrokeEvent` per input keystroke. Each keystroke commits immediately — no preedit buffer. Rationale documented in change log entry for 2026-05-19; short version: per-keystroke analytics is required by the recommendation engine, and rule-based output is *provably equivalent* to m17n for every sequence in the .mim (validated by ~570 fixtures auto-extracted from the .mim).

### 7.2 State

```ts
type EmittedKind =
  | 'mei'              // consonant with inherent vowel
  | 'mei+pulli'        // pure consonant (with virama)
  | 'vowel-sign'       // dependent vowel mark
  | 'uyir'             // standalone vowel
  | 'other'            // digits, punctuation, grantha singletons, etc.
  | 'none';            // initial state, or after backspace clears log

interface ComposerState {
  lastEmittedKind: EmittedKind;
  lastMei: string | null;        // codepoint of most recent mei emission;
                                 // tracked for gemination (R4) + soft-hard (R7).
                                 // cleared on pulli, vowel-sign, uyir, other, none.
  delinkNext: boolean;           // set by R6 (mei + அ); suppresses composition
                                 // on the very next keystroke. Single-use flag.
  log: EmittedToken[];           // append-only; source of truth for backspace
  currentString: string;         // emitted codepoints concatenated
}

interface EmittedToken {
  triggeringCode: string;        // event.code that produced this token
  shift: boolean;
  altGr: boolean;
  op: 'emit'
    | 'substitute'               // R3: replaced trailing uyir with vowel sign
    | 'pulli-attach'             // R2: appended pulli to mei
    | 'auto-pulli'               // R4/R7: inserted pulli into prior mei before new emit
    | 'delink'                   // R6: mei + அ → emitted nothing, sets delinkNext
    | 'noop'                     // unmapped key, or delinkNext consumed
    | 'backspace';
  before: string | null;         // codepoints replaced/inserted-before, if any
  after: string;                 // codepoints emitted (may be empty for delink/noop)
  kindAfter: EmittedKind;        // classification of *last codepoint* of emission
  prevState: Pick<ComposerState, 'lastEmittedKind' | 'lastMei' | 'delinkNext'>;
}
```

Two state fields beyond the original design:

- **`lastMei`** is needed because R4 (gemination) and R7 (soft-hard auto-pulli) trigger only when the new mei matches or pairs with the *previous mei specifically* — not just any prior emission. Tracking `lastEmittedKind === 'mei'` isn't enough; we need the actual codepoint.
- **`delinkNext`** is the single-use flag from R6. After `mei + அ`, the next keystroke is emitted "raw" (no composition), then the flag clears.

### 7.3 Inputs

```ts
interface ComposerInput {
  code: string;                  // event.code
  shift: boolean;
  altGr: boolean;                // event.altKey OR event.code === 'AltRight'
                                 // (platform-dependent; resolve at capture layer)
  isBackspace: boolean;
  ts: number;                    // performance.now()
}
```

The composer **does not** receive `event.key`. Callers extract `code`, `shiftKey`, and the AltGr flag only.

### 7.4 Outputs

Each input produces exactly one `KeystrokeEvent` (without `wasCorrect`/`mistakeKind` — filled by Validator downstream).

### 7.5 Composition rules (m17n behavior)

Rule numbers match the .mim's documentation comment. Applied in order; first match wins.

| # | Rule | Trigger | Action |
|---|---|---|---|
| R1 | Unmapped key | No entry in atomic keymap for `(code, shift, altGr)` | Emit `op: 'noop'`, no state change |
| R2 | Pulli after mei | `code === pulliCode` AND `lastEmittedKind === 'mei'` | Append `் (U+0BCD)`; `kindAfter: 'mei+pulli'`; clear `lastMei` |
| R3 | Uyir after mei (non-`அ`) | New atomic is uyir, `lastEmittedKind === 'mei'`, `!delinkNext`, atomic !== `அ` | Look up `uyirToSign[atomic]`; replace trailing uyir-or-nothing with vowel sign; `kindAfter: 'vowel-sign'`; clear `lastMei` |
| R4 | Gemination | New atomic is mei, `lastMei === atomic` | Insert pulli into prior mei (so prior becomes mei+pulli), then emit new mei normally. Two codepoints inserted in total (`்` before this keystroke, `mei` for this keystroke). `op: 'auto-pulli'`. `kindAfter: 'mei'`; `lastMei` = new mei. |
| R6 | Delink marker | Atomic === `அ`, `lastEmittedKind === 'mei'`, `!delinkNext` | Emit nothing (`after: ''`). Set `delinkNext: true`. `lastEmittedKind` unchanged; `lastMei` retained but won't participate in R3 next time |
| R7 | Soft-hard auto-pulli | New atomic is mei, `(lastMei, atomic)` is a soft-hard pair | Same as R4: pulli into prior, then emit new. Pairs: (ங,க), (ஞ,ச), (ந,த), (ண,ட), (ம,ப), (ன,ற) |
| R8 | Independent vowel | New atomic is uyir, `lastEmittedKind !== 'mei'` (OR `delinkNext` is true) | Normal emit. If `delinkNext` was true, consume it. `kindAfter: 'uyir'` |
| —  | Default emit | None of the above | Emit atomic, set `kindAfter` from last codepoint of emission, update `lastMei` if kind is `'mei'` else clear |

#### Important: R3 substitution mechanics

The atomic keymap for uyir keys (q, w, e, r, t, a, s, d, g, z, x, c) maps to the **full uyir codepoint** (ஆ, ஈ, ...). R3 fires *after* the atomic lookup but *before* emission. The lookup says "you would emit ஆ"; R3 says "replace that with ா because we're after a mei." So:

```
keystroke 'h':  emit 'க'   (R0 default, kindAfter 'mei')
keystroke 'q':  atomic says 'ஆ'
                R3 fires:  substitute ஆ → ா
                emit:      append 'ா'
                kindAfter: 'vowel-sign'
                currentString: 'கா'
```

For the case of `அ` (atomic = `அ`, the inherent vowel), R3 does **not** fire — R6 fires instead and emits nothing.

#### Important: multi-codepoint atomic emissions

Some single-key atomics emit more than one codepoint:

- `KeyT` (shift) → `க்ஷ` (3 codepoints: க, ், ஷ)
- `KeyY` (shift) → `ஶ்ரீ` (4 codepoints: ஶ, ், ர, ீ)

Classification (`kindAfter`) uses the **last codepoint** of the emission:
- `க்ஷ` → last codepoint is `ஷ` (U+0BB7) → `kindAfter: 'mei'`, `lastMei = 'ஷ'`
- `ஶ்ரீ` → last codepoint is `ீ` (U+0BC0) → `kindAfter: 'vowel-sign'`, `lastMei` cleared

#### Special-case explicit entries

A small number of .mim entries are not derivable from R1–R8 and live in an explicit `exceptions` table:

- `KeyH + KeyF + ShiftW` → `க்‌ஷ` (k + pulli + **ZWNJ** + sh — non-conjunct form). The ZWNJ (U+200C) insertion is specific to this sequence.

The composer checks the exceptions table after every keystroke. If the recent keystroke history (up to 4 keys) matches an exception's pattern, the exception output replaces the rule-based output for that sequence. Exceptions are extracted by the parser, not hand-maintained.

### 7.6 AltGr layer

The third keymap layer (`altgr`) maps physical keys to standalone vowel signs (`KeyQ` → `ா`, `KeyS` → `ி`, ...) and Tamil numerals (`Digit1` → `௧`, ...). When `altGr === true` on input, the composer consults `altgr` instead of `unshifted`/`shifted`. AltGr emissions bypass R2–R8 (they're standalone codepoints, not composition triggers) — they act as plain emits.

### 7.7 Backspace

On `isBackspace`:
1. Pop the last `EmittedToken` from `log`.
2. Reverse its operation on `currentString`:
   - `emit`, `substitute`, `pulli-attach`, `auto-pulli` → remove the `after` codepoints from the tail of `currentString`. For `substitute`, also restore the `before` codepoint(s).
   - `delink` → no codepoint change; just reverts state.
   - `noop` → no change.
3. Restore `lastEmittedKind`, `lastMei`, `delinkNext` from the popped token's `prevState` field.
4. Emit a `KeystrokeEvent` with `composed.op: 'backspace'`.

### 7.8 Conformance fixtures

Two fixture sources:

1. **`keymap.fixtures.json`** — auto-generated from the .mim by the parser. Every multi-key entry in the .mim becomes a fixture asserting the composer produces the same output for the same key sequence. ~570 fixtures.
2. **Hand-authored named fixtures** — in `/src/typing-engine/composer/__fixtures__/*.json` — cover backspace, delink (R6), special exceptions, AltGr, and edge cases (orphan pulli, mixed Tamil + ASCII).

Auto-generated fixture format:

```jsonc
{
  "name": "mim-auto-hf",
  "source": "mim:line:148",
  "inputs": [
    { "code": "KeyH", "shift": false, "altGr": false },
    { "code": "KeyF", "shift": false, "altGr": false }
  ],
  "expectedString": "க்"
}
```

Hand-authored fixtures may additionally assert `expectedTokens`, `expectedKindAfter`, etc.

### 7.9 Layer-above responsibilities

- **Filter `event.repeat === true`** before passing to the composer. The composer assumes one input = one user action.
- **Ignore CapsLock.** Composer never sees a "caps" flag.
- **Resolve AltGr.** On macOS Option, on Linux AltGr, on Windows Right-Alt. Pass a single `altGr: boolean` to the composer.

---

## 8. Tamil99 keymap acquisition

**Source of truth:** [`m17n-db`](https://savannah.nongnu.org/projects/m17n/), file `MIM/ta-tamil99.mim`. A copy lives in `src/typing-engine/composer/ta-tamil99.mim`. Upstream provenance (commit, date, URL) is recorded in `src/typing-engine/composer/ta-tamil99.SOURCE.md`, **not** in `keymap.json`.

**Pipeline:**

```
m17n upstream  ── manual clone ──►  ta-tamil99.mim  (committed)
                                          │
                                          ▼
                              scripts/mim-to-json.ts
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                    keymap.json   keymap.fixtures.json   (logs)
                    (committed)    (committed)
                          │
                          ▼
   CI parity test: re-run script, byte-compare both outputs
```

**`keymap.json` shape:**

```ts
interface Keymap {
  schemaVersion: 1;
  source: 'm17n/ta-tamil99.mim';
  sourceSha256: string;                       // SHA-256 of the .mim file
  // Atomic single-key emissions (parser extracts only entries whose key string
  // is exactly one character; multi-key entries go to keymap.fixtures.json).
  unshifted: Record<string, AtomicEntry>;     // event.code → emission
  shifted: Record<string, AtomicEntry>;
  altgr: Record<string, AtomicEntry>;         // AltGr+key (G-x entries)
  altgrShift: Record<string, AtomicEntry>;    // AltGr+Shift+key (G-! G-@ G-# G-$)
  // Substitution table for R3 (uyir → vowel sign).
  // Generated programmatically from Tamil Unicode (not from .mim).
  uyirToSign: Record<string, string | null>;
  // Soft-hard mei pairs for R7. Programmatic.
  softHardPairs: Array<[string, string]>;     // [(ங, க), (ஞ, ச), ...]
  pulliCode: string;                          // 'KeyF' for Tamil99
  pulliCodepoint: '்';
}

interface AtomicEntry {
  output: string;                             // codepoints emitted (1–4 chars)
  // The kind of the *last codepoint* of output. Drives composer state.
  kind: 'mei' | 'uyir' | 'vowel-sign' | 'mei+pulli' | 'other';
}
```

**`keymap.fixtures.json` shape:**

```ts
interface KeymapFixtures {
  schemaVersion: 1;
  source: 'm17n/ta-tamil99.mim';
  sourceSha256: string;
  // Every multi-key entry from the .mim.
  // Each is an assertion the composer must satisfy.
  compositions: Array<{
    name: string;                             // e.g., "mim-hf"
    sourceLine: number;                       // line in the .mim
    inputs: Array<{ code: string; shift: boolean; altGr: boolean }>;
    expectedString: string;                   // exact .mim RHS
  }>;
  // .mim entries that don't fit R1–R8 cleanly — the composer's exception table.
  exceptions: Array<{
    keys: string[];                           // sequence of raw key chars
    output: string;
    reason: string;                           // why this is an exception
  }>;
}
```

**Two files, not one:** `keymap.json` is what the composer loads at runtime (lookup tables only, small). `keymap.fixtures.json` is the test oracle (large, no runtime cost). Splitting keeps the runtime bundle lean.

**Determinism rules** (so the CI parity test is meaningful):

- Sort all object keys lexically before serializing.
- Sort `compositions` by `(sourceLine, name)`.
- Use 2-space indent + trailing newline.
- Hash the .mim with SHA-256 of its raw bytes (no normalization).

**Re-pulling upstream:** see `src/typing-engine/composer/ta-tamil99.SOURCE.md`. After re-pulling, re-run the parser and inspect the diff in both JSON files. The parity test will fail until both regenerated files are committed.

---

## 9. Validator handoff

The Validator sits between the Composer and the persistence layer.

**Inputs per keystroke:**
- The `KeystrokeEvent` (without `wasCorrect` / `mistakeKind`)
- The target text's pre-segmented grapheme array
- The current target cursor position

**Outputs:**
- `wasCorrect: boolean`
- `mistakeKind: MistakeKind | null`
- Updated target cursor position
- 0 or 1 `Mistake` record (denormalized aggregate, written on session_end, not per-keystroke)

**Target text pre-processing:** done once when a lesson drill starts. Segment the target into graphemes using `Intl.Segmenter('ta', { granularity: 'grapheme' })`. Cache the array on the drill object.

**Cursor advancement rules:**
- On a correct grapheme completion, advance the target cursor.
- On an incorrect keystroke, the cursor does **not** advance. The user must produce the correct grapheme to move on. (This is the "strict" mode. A "forgiving" mode that advances on any keystroke is an opt-in future setting.)

---

## 10. Time accounting

- **Session duration** = sum of inter-keystroke deltas, capped at 5000 ms per delta. Any delta > 5s is treated as idle and counted as exactly 5s.
- **Session start** = first keystroke timestamp.
- **Session end** = either user clicks "end" or 60s of no input → auto-end and persist.
- **`durationSeconds`** on the Session row reflects effective time, not wall-clock between start and end.

This avoids two failure modes: (a) user tabs away, returns 20 minutes later, finishes the session, and gets credited with 20-minute CPM = 5 graphemes/hour; (b) auto-pause on every micro-pause makes timing feel inconsistent.

---

## 11. Decidable in flight

Starting defaults below. Each can change during MVP implementation without architectural impact:

| Item | Default | Notes |
|---|---|---|
| Recommendation engine rules | 4 rules (see below) | Rule set is data-driven; add rules over time |
| Recommendation hysteresis | "Next lesson" suggestion only changes if new candidate scores ≥ 20% better than current | Prevents flip-flopping |
| Recommendation refresh trigger | `session_end` only, not dashboard render | Result cached in `recommendations` table |
| Idle threshold for time accounting | 5000 ms | Tune after first user tests |
| Auto session-end threshold | 60s no input | Tune after first user tests |
| Export format | JSON file, `{ schemaVersion: 1, tables: {...} }` | Versioned from day 1 |
| Import collision policy | Reject if userId differs; warn if same userId has overlapping sessionIds | Future Drive sync will need a real merge |
| PWA / service worker | Not in MVP; add in Phase 4 | Vite plugin makes this a config change |
| Sound feedback engine | Web Audio, single-buffer key-click sample | Lazy-init on first user gesture |
| Theme | System-preference detection + manual override | `prefers-color-scheme` |

### Initial recommendation rules

1. If session `accuracyGraphemes < 80`, recommend the same lesson again in `accuracy` mode.
2. If session `accuracyGraphemes >= 95` and `achievedGPM >= 90% of target`, recommend the next lesson in prereq order.
3. If the same `(expectedGrapheme, mistakeKind)` appears ≥ 5 times across the last 3 sessions, recommend a targeted drill on that grapheme. (Phase 2 — needs "targeted drill" lesson type.)
4. If user hasn't practiced for ≥ 3 days, recommend a refresher of the most recent completed lesson before advancing.

---

## 12. Open questions deferred

From BRD §19, with current dispositions:

| # | BRD question | Status |
|---|---|---|
| 1 | Desktop only or mobile? | **Resolved:** Desktop only for MVP (L4). |
| 2 | Teach finger placement? | Deferred to UX/lesson authoring; not a code question. |
| 3 | Formal vs daily Tamil corpus? | Content-authoring decision; lesson schema accommodates both. |
| 4 | English vs Tamil UI text? | Both (`title` is bilingual). UI chrome strings: i18n stub in MVP, English default. |
| 5 | Mistakes by char/key/both? | **Resolved:** Both (keystroke log + grapheme aggregation). |
| 6 | Manual vs auto Drive sync? | Phase 3; manual first. |
| 7 | User-created lessons? | Phase 2 (procedural) + Phase 4 (custom upload). |
| 8 | Gamification? | Phase 4. |
| 9 | Multi-user per device? | Schema-ready (userId column). UI deferred. |
| 10 | PDF/CSV export? | Phase 2 (JSON only in MVP). |

---

## 13. Project layout

```
/touch_typing
├── docs/
│   ├── design-freeze.md         ← this file
│   └── (future: validator-classification-table.md, sync-protocol.md)
├── content/
│   └── lessons/
│       ├── L01-home-row.json
│       └── ...
├── scripts/
│   └── mim-to-json.ts           ← keymap generator
├── src/
│   ├── typing-engine/
│   │   ├── composer/
│   │   │   ├── KeyComposer.ts
│   │   │   ├── keymap.json
│   │   │   ├── ta-tamil99.mim   ← committed copy of upstream
│   │   │   └── __fixtures__/
│   │   ├── segmenter/
│   │   ├── validator/
│   │   └── types.ts
│   ├── persistence/
│   │   ├── db.ts                ← Dexie instance
│   │   ├── schemas/
│   │   └── migrations/
│   ├── analytics/
│   ├── recommendation/
│   ├── ui/
│   │   ├── LessonRunner/
│   │   ├── KeyboardWidget/
│   │   ├── Dashboard/
│   │   └── Report/
│   └── state/                   ← Zustand stores
├── tests/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.ts
```

---

## 14. Implementation order

Build in this order. Each layer is independently testable and unblocks the next.

1. **KeyComposer + keymap + fixtures.** Zero UI. All testable in Node. Includes the m17n → JSON conversion script.
2. **GraphemeSegmenter wrapper** around `Intl.Segmenter`. Trivial; mostly a test for browser compatibility.
3. **Validator + mistake classifier.** Pure functions over composer output and target grapheme arrays.
4. **Persistence layer (Dexie).** Schemas, migrations, type-safe queries. Mock-friendly for tests.
5. **TypingEngine integration** — wires Composer → Segmenter → Validator → persistence, exposes Zustand store.
6. **KeyboardWidget** — visual layout, per-key state highlights, composition flash.
7. **LessonRunner** — drives a drill, renders target text with cursor and per-grapheme states.
8. **Session report screen.**
9. **Dashboard** — aggregations over `Session` and `Mistake` tables.
10. **Recommendation engine** — last because it depends on populated data.
11. **Settings, export/import.**

Lesson content authoring runs in parallel with steps 6+, against the schema locked in §5.

---

## 15. Change log

| Date | Change |
|---|---|
| 2026-05-19 | Initial freeze (v1). |
| 2026-05-19 | **§7 + §8 revised after reading actual `m17n ta-tamil99.mim`.** Composer is rule-based (L21) with 8 rules (R1–R8) not 3. Pulli on `KeyF` (L22) not `BracketRight`. AltGr layer added (L23). `keymap.json` split from `keymap.fixtures.json` (L24). Provenance moved to `SOURCE.md` next to .mim (L25). Multi-codepoint atomic emissions (`T → க்ஷ`, `Y → ஶ்ரீ`) documented. Special-case exceptions table introduced (ZWNJ in `hfW → க்‌ஷ`). |
