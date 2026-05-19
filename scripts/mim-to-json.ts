#!/usr/bin/env tsx
/**
 * Convert m17n Tamil99 .mim file to keymap.json + keymap.fixtures.json.
 * See docs/design-freeze.md §7 and §8 for the contract these files satisfy.
 *
 * Usage:
 *   pnpm mim:build           # regenerate both JSON files
 *   pnpm mim:check           # CI parity: exit non-zero if outputs would change
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const MIM_PATH = resolve(REPO_ROOT, 'src/typing-engine/composer/ta-tamil99.mim');
const KEYMAP_PATH = resolve(REPO_ROOT, 'src/typing-engine/composer/keymap.json');
const FIXTURES_PATH = resolve(REPO_ROOT, 'src/typing-engine/composer/keymap.fixtures.json');

// ─────────────────────────────────────────────────────────────────────────
// US-QWERTY bridge: .mim key character → event.code + shift
// ─────────────────────────────────────────────────────────────────────────

interface CodeShift { code: string; shift: boolean; }

const KEY_TO_CODE: Record<string, CodeShift> = (() => {
  const map: Record<string, CodeShift> = {};
  for (const c of 'abcdefghijklmnopqrstuvwxyz') {
    map[c] = { code: `Key${c.toUpperCase()}`, shift: false };
    const upper = c.toUpperCase();
    map[upper] = { code: `Key${upper}`, shift: true };
  }
  const digits: Array<[string, string]> = [
    ['1', '!'], ['2', '@'], ['3', '#'], ['4', '$'], ['5', '%'],
    ['6', '^'], ['7', '&'], ['8', '*'], ['9', '('], ['0', ')'],
  ];
  for (const [d, shifted] of digits) {
    map[d] = { code: `Digit${d}`, shift: false };
    map[shifted] = { code: `Digit${d}`, shift: true };
  }
  const punct: Array<[string, string | null, string]> = [
    [';', ':', 'Semicolon'],
    ["'", '"', 'Quote'],
    [',', '<', 'Comma'],
    ['.', '>', 'Period'],
    ['/', '?', 'Slash'],
    ['[', '{', 'BracketLeft'],
    [']', '}', 'BracketRight'],
    ['\\', '|', 'Backslash'],
    ['-', '_', 'Minus'],
    ['=', '+', 'Equal'],
    ['`', '~', 'Backquote'],
    [' ', null, 'Space'],
  ];
  for (const [unshifted, shifted, code] of punct) {
    map[unshifted] = { code, shift: false };
    if (shifted) map[shifted] = { code, shift: true };
  }
  return map;
})();

const ZWJ = '‍';
const ZWNJ = '‌';
const PULLI = '்';

// R7 soft-hard mei pairs, from the .mim's documentation comment (rule 7).
const SOFT_HARD_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['ங', 'க'], ['ஞ', 'ச'], ['ந', 'த'], ['ண', 'ட'], ['ம', 'ப'], ['ன', 'ற'],
];

// ─────────────────────────────────────────────────────────────────────────
// Tokenizer
// ─────────────────────────────────────────────────────────────────────────

type Token =
  | { kind: 'lparen'; line: number }
  | { kind: 'rparen'; line: number }
  | { kind: 'string'; value: string; line: number }
  | { kind: 'charlit'; value: string; line: number }
  | { kind: 'symbol'; value: string; line: number };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === ';') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '(') { tokens.push({ kind: 'lparen', line }); i++; continue; }
    if (c === ')') { tokens.push({ kind: 'rparen', line }); i++; continue; }
    if (c === '"') {
      const startLine = line;
      i++;
      let value = '';
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') {
          i++;
          if (i >= src.length) throw new Error(`Unterminated string escape at line ${line}`);
          const esc = src[i]!;
          if (esc === 'n') value += '\n';
          else if (esc === 't') value += '\t';
          else if (esc === 'r') value += '\r';
          else value += esc;
          i++;
        } else {
          if (src[i] === '\n') line++;
          value += src[i];
          i++;
        }
      }
      if (i >= src.length) throw new Error(`Unterminated string starting at line ${startLine}`);
      i++;
      tokens.push({ kind: 'string', value, line: startLine });
      continue;
    }
    if (c === '?') {
      const startLine = line;
      i++;
      if (i >= src.length) throw new Error(`Trailing ? at line ${line}`);
      let value: string;
      if (src[i] === '\\') {
        i++;
        if (i >= src.length) throw new Error(`Trailing ?\\ at line ${line}`);
        const esc = src[i]!;
        if (esc === 'n') value = '\n';
        else if (esc === 't') value = '\t';
        else value = esc;
        i++;
      } else {
        const cp = src.codePointAt(i)!;
        value = String.fromCodePoint(cp);
        i += cp > 0xFFFF ? 2 : 1;
      }
      tokens.push({ kind: 'charlit', value, line: startLine });
      continue;
    }
    let sym = '';
    const startLine = line;
    while (i < src.length && !/[\s();"]/.test(src[i]!)) {
      sym += src[i];
      i++;
    }
    if (sym) tokens.push({ kind: 'symbol', value: sym, line: startLine });
  }
  return tokens;
}

// ─────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────

type Node =
  | { kind: 'list'; children: Node[]; line: number }
  | { kind: 'string'; value: string; line: number }
  | { kind: 'charlit'; value: string; line: number }
  | { kind: 'symbol'; value: string; line: number };

function parse(tokens: Token[]): Node[] {
  let i = 0;
  function readExpr(): Node {
    const tok = tokens[i];
    if (!tok) throw new Error('Unexpected EOF while parsing');
    if (tok.kind === 'rparen') throw new Error(`Unexpected ) at line ${tok.line}`);
    if (tok.kind === 'lparen') {
      i++;
      const children: Node[] = [];
      while (i < tokens.length && tokens[i]!.kind !== 'rparen') {
        children.push(readExpr());
      }
      if (i >= tokens.length) throw new Error(`Unterminated list starting at line ${tok.line}`);
      i++;
      return { kind: 'list', children, line: tok.line };
    }
    i++;
    return { kind: tok.kind, value: tok.value, line: tok.line };
  }
  const out: Node[] = [];
  while (i < tokens.length) out.push(readExpr());
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// AST extraction
// ─────────────────────────────────────────────────────────────────────────

interface MimEntry { keyNode: Node; output: string; line: number; }

function findMapTransBlock(ast: Node[]): Node[] {
  for (const node of ast) {
    if (node.kind !== 'list') continue;
    const head = node.children[0];
    if (head?.kind !== 'symbol' || head.value !== 'map') continue;
    for (const child of node.children.slice(1)) {
      if (child.kind !== 'list') continue;
      const subHead = child.children[0];
      if (subHead?.kind === 'symbol' && subHead.value === 'trans') {
        return child.children.slice(1);
      }
    }
  }
  throw new Error('Could not locate (map (trans ...)) block in .mim AST');
}

function extractEntries(transChildren: Node[]): MimEntry[] {
  const entries: MimEntry[] = [];
  for (const child of transChildren) {
    if (child.kind !== 'list') {
      throw new Error(`Expected list in (trans ...), got ${child.kind} at line ${child.line}`);
    }
    if (child.children.length !== 2) {
      throw new Error(`Expected (key output) pair, got ${child.children.length} children at line ${child.line}`);
    }
    const [keyNode, outputNode] = child.children as [Node, Node];
    let output: string;
    if (outputNode.kind === 'string') output = outputNode.value;
    else if (outputNode.kind === 'charlit') output = outputNode.value;
    else throw new Error(`Expected string/charlit output at line ${outputNode.line}, got ${outputNode.kind}`);
    entries.push({ keyNode, output, line: child.line });
  }
  return entries;
}

// ─────────────────────────────────────────────────────────────────────────
// Key node → event sequence
// ─────────────────────────────────────────────────────────────────────────

interface KeyEvent { code: string; shift: boolean; altGr: boolean; }

function charToEvent(ch: string, line: number): KeyEvent {
  const entry = KEY_TO_CODE[ch];
  if (!entry) {
    const cp = ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
    throw new Error(`No event.code mapping for character ${JSON.stringify(ch)} (U+${cp}) at line ${line}`);
  }
  return { code: entry.code, shift: entry.shift, altGr: false };
}

function keyNodeToEvents(key: Node): KeyEvent[] {
  if (key.kind === 'string') {
    return [...key.value].map(c => charToEvent(c, key.line));
  }
  if (key.kind === 'list') {
    if (key.children.length !== 1) {
      throw new Error(`Expected 1-element list key at line ${key.line}, got ${key.children.length}`);
    }
    const sym = key.children[0]!;
    if (sym.kind !== 'symbol') {
      throw new Error(`Expected symbol inside list-form key at line ${key.line}, got ${sym.kind}`);
    }
    if (!sym.value.startsWith('G-')) {
      throw new Error(`Unknown modifier form ${JSON.stringify(sym.value)} at line ${key.line}`);
    }
    const rest = sym.value.slice(2);
    if ([...rest].length !== 1) {
      throw new Error(`Expected single char after G- in ${JSON.stringify(sym.value)} at line ${key.line}`);
    }
    const base = charToEvent(rest, key.line);
    return [{ ...base, altGr: true }];
  }
  throw new Error(`Unexpected key node kind ${key.kind} at line ${key.line}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Classification (kind of an emission, by last codepoint)
// ─────────────────────────────────────────────────────────────────────────

type AtomicKind = 'mei' | 'uyir' | 'vowel-sign' | 'mei+pulli' | 'other';

function classifyCodepoint(cp: number): AtomicKind {
  if (cp === 0x0BCD) return 'mei+pulli';
  if (cp >= 0x0B85 && cp <= 0x0B94) return 'uyir';
  if (cp >= 0x0B95 && cp <= 0x0BB9) return 'mei';
  if (cp >= 0x0BBE && cp <= 0x0BCC) return 'vowel-sign';
  return 'other';
}

function classifyEmission(output: string): AtomicKind {
  if (!output) return 'other';
  const cps = [...output].map(c => c.codePointAt(0)!);
  const last = cps[cps.length - 1]!;
  return classifyCodepoint(last);
}

// ─────────────────────────────────────────────────────────────────────────
// R3 substitution table (Tamil Unicode arithmetic, not from .mim)
// ─────────────────────────────────────────────────────────────────────────

function buildUyirToSign(): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  const uyirCps = [0x0B85, 0x0B86, 0x0B87, 0x0B88, 0x0B89, 0x0B8A,
                   0x0B8E, 0x0B8F, 0x0B90, 0x0B92, 0x0B93, 0x0B94];
  for (const cp of uyirCps) {
    const ch = String.fromCodePoint(cp);
    if (cp === 0x0B85) result[ch] = null;            // அ has no vowel sign (inherent)
    else result[ch] = String.fromCodePoint(cp + 0x38);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// Build outputs
// ─────────────────────────────────────────────────────────────────────────

interface AtomicEntry { output: string; kind: AtomicKind; }
interface CompositionFixture {
  name: string;
  sourceLine: number;
  inputs: KeyEvent[];
  expectedString: string;
}
interface ExceptionEntry {
  keys: string[];
  inputs: KeyEvent[];
  output: string;
  reason: string;
  sourceLine: number;
}
interface Keymap {
  schemaVersion: 1;
  source: 'm17n/ta-tamil99.mim';
  sourceSha256: string;
  unshifted: Record<string, AtomicEntry>;
  shifted: Record<string, AtomicEntry>;
  altgr: Record<string, AtomicEntry>;
  altgrShift: Record<string, AtomicEntry>;
  uyirToSign: Record<string, string | null>;
  softHardPairs: Array<[string, string]>;
  pulliCode: string;
  pulliCodepoint: string;
}
interface KeymapFixtures {
  schemaVersion: 1;
  source: 'm17n/ta-tamil99.mim';
  sourceSha256: string;
  compositions: CompositionFixture[];
  exceptions: ExceptionEntry[];
}

function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(obj).sort()) out[key] = obj[key]!;
  return out;
}

function describeEvents(events: KeyEvent[]): string {
  return events
    .map(e => `${e.code}${e.shift ? '+S' : ''}${e.altGr ? '+G' : ''}`)
    .join('-');
}

function buildOutputs(entries: MimEntry[], sourceSha256: string): { keymap: Keymap; fixtures: KeymapFixtures } {
  const unshifted: Record<string, AtomicEntry> = {};
  const shifted: Record<string, AtomicEntry> = {};
  const altgr: Record<string, AtomicEntry> = {};
  const altgrShift: Record<string, AtomicEntry> = {};
  const compositions: CompositionFixture[] = [];
  const exceptions: ExceptionEntry[] = [];

  function pickBucket(ev: KeyEvent): { bucket: Record<string, AtomicEntry>; name: string } {
    if (ev.altGr && ev.shift) return { bucket: altgrShift, name: 'altgrShift' };
    if (ev.altGr)             return { bucket: altgr,      name: 'altgr' };
    if (ev.shift)             return { bucket: shifted,    name: 'shifted' };
    return                          { bucket: unshifted,  name: 'unshifted' };
  }

  for (const entry of entries) {
    if (entry.output === '') continue;                 // explicitly-suppressed keys
    const events = keyNodeToEvents(entry.keyNode);
    if (events.length === 0) {
      throw new Error(`Entry at line ${entry.line} produced 0 events`);
    }

    if (events.length === 1) {
      const ev = events[0]!;
      const atomic: AtomicEntry = { output: entry.output, kind: classifyEmission(entry.output) };
      const { bucket, name: layerName } = pickBucket(ev);
      if (ev.code in bucket) {
        throw new Error(
          `Duplicate atomic entry for ${ev.code} in ${layerName} layer ` +
          `(line ${entry.line}, conflicts with existing output ${JSON.stringify(bucket[ev.code]!.output)})`
        );
      }
      bucket[ev.code] = atomic;
      continue;
    }

    const reason = entry.output.includes(ZWNJ)
      ? 'contains ZWNJ (U+200C)'
      : entry.output.includes(ZWJ)
        ? 'contains ZWJ (U+200D)'
        : null;

    if (reason !== null) {
      exceptions.push({
        keys: entry.keyNode.kind === 'string' ? [...entry.keyNode.value] : [],
        inputs: events,
        output: entry.output,
        reason,
        sourceLine: entry.line,
      });
    } else {
      compositions.push({
        name: `mim-${describeEvents(events)}`,
        sourceLine: entry.line,
        inputs: events,
        expectedString: entry.output,
      });
    }
  }

  compositions.sort((a, b) => a.sourceLine - b.sourceLine || a.name.localeCompare(b.name));
  exceptions.sort((a, b) => a.sourceLine - b.sourceLine);

  const pulliMatches = Object.entries(unshifted).filter(([, v]) => v.output === PULLI);
  if (pulliMatches.length !== 1) {
    throw new Error(`Expected exactly 1 pulli (U+0BCD) entry in unshifted layer, found ${pulliMatches.length}`);
  }
  const pulliCode = pulliMatches[0]![0];

  const keymap: Keymap = {
    schemaVersion: 1,
    source: 'm17n/ta-tamil99.mim',
    sourceSha256,
    unshifted: sortKeys(unshifted),
    shifted: sortKeys(shifted),
    altgr: sortKeys(altgr),
    altgrShift: sortKeys(altgrShift),
    uyirToSign: buildUyirToSign(),
    softHardPairs: SOFT_HARD_PAIRS.map(([a, b]) => [a, b]),
    pulliCode,
    pulliCodepoint: PULLI,
  };

  const fixtures: KeymapFixtures = {
    schemaVersion: 1,
    source: 'm17n/ta-tamil99.mim',
    sourceSha256,
    compositions,
    exceptions,
  };

  return { keymap, fixtures };
}

// ─────────────────────────────────────────────────────────────────────────
// I/O
// ─────────────────────────────────────────────────────────────────────────

function serialize(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + '\n';
}

function main(): void {
  const checkMode = process.argv.slice(2).includes('--check');

  const mimRaw = readFileSync(MIM_PATH);
  const sourceSha256 = createHash('sha256').update(mimRaw).digest('hex');
  const mimText = mimRaw.toString('utf8');

  const tokens = tokenize(mimText);
  const ast = parse(tokens);
  const transChildren = findMapTransBlock(ast);
  const entries = extractEntries(transChildren);

  const { keymap, fixtures } = buildOutputs(entries, sourceSha256);
  const keymapJson = serialize(keymap);
  const fixturesJson = serialize(fixtures);

  if (checkMode) {
    let ok = true;
    const existingKeymap = readFileSync(KEYMAP_PATH, 'utf8');
    const existingFixtures = readFileSync(FIXTURES_PATH, 'utf8');
    if (existingKeymap !== keymapJson) {
      console.error(`keymap.json drifted from ta-tamil99.mim`);
      ok = false;
    }
    if (existingFixtures !== fixturesJson) {
      console.error(`keymap.fixtures.json drifted from ta-tamil99.mim`);
      ok = false;
    }
    if (!ok) {
      console.error(`Re-run \`pnpm mim:build\` and commit the regenerated files`);
      process.exit(1);
    }
    console.log('OK: keymap.json and keymap.fixtures.json are in sync with ta-tamil99.mim');
    return;
  }

  writeFileSync(KEYMAP_PATH, keymapJson);
  writeFileSync(FIXTURES_PATH, fixturesJson);

  console.log(`Wrote ${KEYMAP_PATH}`);
  console.log(`Wrote ${FIXTURES_PATH}`);
  console.log(`Summary:`);
  console.log(`  Atomic unshifted: ${Object.keys(keymap.unshifted).length}`);
  console.log(`  Atomic shifted:   ${Object.keys(keymap.shifted).length}`);
  console.log(`  AltGr:            ${Object.keys(keymap.altgr).length}`);
  console.log(`  AltGr+Shift:      ${Object.keys(keymap.altgrShift).length}`);
  console.log(`  Compositions:     ${fixtures.compositions.length}`);
  console.log(`  Exceptions:       ${fixtures.exceptions.length}`);
  console.log(`  Pulli code:       ${keymap.pulliCode}`);
  console.log(`  Source SHA-256:   ${sourceSha256}`);
}

main();
