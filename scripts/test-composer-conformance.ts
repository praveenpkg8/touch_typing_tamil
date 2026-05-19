#!/usr/bin/env tsx
/**
 * Composer conformance test runner.
 *
 * Feeds every (composition + exception) fixture extracted from the m17n .mim
 * through the KeyComposer rule engine. Reports pass/fail per fixture.
 *
 * Goal: prove rule-based equivalence to m17n for every sequence in the .mim.
 */

import fixtures from '../src/typing-engine/composer/keymap.fixtures.json' with { type: 'json' };
import { KeyComposer } from '../src/typing-engine/composer/index.ts';
import type { ComposerInput } from '../src/typing-engine/composer/index.ts';

interface Failure {
  category: 'composition' | 'exception';
  name: string;
  sourceLine: number;
  inputs: Array<{ code: string; shift: boolean; altGr: boolean }>;
  expected: string;
  actual: string;
}

/**
 * Known typos in the upstream m17n .mim — see ta-tamil99.SOURCE.md.
 * These are not composer bugs; the .mim is inconsistent with its own
 * sibling entries. We report them separately so they don't drown out
 * real failures.
 */
const KNOWN_MIM_TYPOS: Record<number, { reason: string }> = {
  540: { reason: 'TTq missing trailing ா — sibling TT<vowel> entries include the vowel sign' },
  632: { reason: 'RRd produces ி (sign of இ) but every other XXd produces ு (sign of உ)' },
};

function runFixture(
  inputs: Array<{ code: string; shift: boolean; altGr: boolean }>,
  expected: string,
  exceptions: typeof fixtures.exceptions,
): { ok: boolean; actual: string } {
  const composer = new KeyComposer(exceptions);
  for (const i of inputs) {
    const input: ComposerInput = {
      code: i.code,
      shift: i.shift,
      altGr: i.altGr,
      isBackspace: false,
      ts: 0,
    };
    composer.step(input);
  }
  const actual = composer.currentString;
  return { ok: actual === expected, actual };
}

function describeInputs(inputs: Array<{ code: string; shift: boolean; altGr: boolean }>): string {
  return inputs.map(i => `${i.code}${i.shift ? '+S' : ''}${i.altGr ? '+G' : ''}`).join(' → ');
}

function main(): void {
  let compositionsPass = 0;
  let exceptionsPass = 0;
  const failures: Failure[] = [];
  const knownTypos: Failure[] = [];

  function record(category: 'composition' | 'exception', name: string, sourceLine: number,
                  inputs: Array<{ code: string; shift: boolean; altGr: boolean }>,
                  expected: string, actual: string): void {
    const failure: Failure = { category, name, sourceLine, inputs, expected, actual };
    if (sourceLine in KNOWN_MIM_TYPOS) knownTypos.push(failure);
    else failures.push(failure);
  }

  for (const c of fixtures.compositions) {
    const { ok, actual } = runFixture(c.inputs, c.expectedString, fixtures.exceptions);
    if (ok) compositionsPass++;
    else record('composition', c.name, c.sourceLine, c.inputs, c.expectedString, actual);
  }

  for (const ex of fixtures.exceptions) {
    const { ok, actual } = runFixture(ex.inputs, ex.output, fixtures.exceptions);
    if (ok) exceptionsPass++;
    else record('exception', `mim-line-${ex.sourceLine}`, ex.sourceLine, ex.inputs, ex.output, actual);
  }

  const totalFixtures = fixtures.compositions.length + fixtures.exceptions.length;
  const totalPass = compositionsPass + exceptionsPass;
  const realFails = failures.length;
  const typoFails = knownTypos.length;

  console.log(`Compositions:        ${compositionsPass}/${fixtures.compositions.length} pass`);
  console.log(`Exceptions:          ${exceptionsPass}/${fixtures.exceptions.length} pass`);
  console.log(`Known upstream typos: ${typoFails} (expected divergences, see SOURCE.md)`);
  console.log(`Real failures:        ${realFails}`);
  console.log(`Overall:              ${totalPass + typoFails}/${totalFixtures} accounted for (${(((totalPass + typoFails) / totalFixtures) * 100).toFixed(2)}%)`);
  console.log('');

  if (typoFails > 0) {
    console.log(`Known upstream .mim typos (accepted, not counted as failures):`);
    for (const t of knownTypos) {
      const reason = KNOWN_MIM_TYPOS[t.sourceLine]?.reason ?? '';
      console.log(`  line ${t.sourceLine}: ${describeInputs(t.inputs)}`);
      console.log(`    .mim says: ${JSON.stringify(t.expected)}`);
      console.log(`    we produce: ${JSON.stringify(t.actual)}`);
      console.log(`    reason: ${reason}`);
      console.log('');
    }
  }

  if (realFails === 0) {
    console.log('All fixtures pass (modulo the documented upstream typos).');
    console.log('KeyComposer is provably equivalent to m17n for every well-formed sequence');
    console.log('in ta-tamil99.mim.');
    process.exit(0);
  }

  const maxShown = 30;
  console.log(`Real failures (first ${Math.min(maxShown, failures.length)} of ${failures.length}):`);
  console.log('');
  for (const f of failures.slice(0, maxShown)) {
    console.log(`  [${f.category}] line ${f.sourceLine}: ${describeInputs(f.inputs)}`);
    console.log(`    expected: ${JSON.stringify(f.expected)}  (${[...f.expected].map(c => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ')})`);
    console.log(`    actual:   ${JSON.stringify(f.actual)}  (${[...f.actual].map(c => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ')})`);
    console.log('');
  }
  if (failures.length > maxShown) {
    console.log(`... ${failures.length - maxShown} more failures suppressed`);
  }
  process.exit(1);
}

main();
