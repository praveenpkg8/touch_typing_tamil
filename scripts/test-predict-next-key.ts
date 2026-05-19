#!/usr/bin/env tsx
/**
 * Tests for predictNextKey.
 *
 * Critical invariant verified: predictNextKey must NOT mutate composer state.
 * Each test compares composer.currentString before/after the prediction call
 * and asserts equality.
 */

import keymapFixtures from '../src/typing-engine/composer/keymap.fixtures.json' with { type: 'json' };
import {
  KeyComposer,
  predictNextKey,
  type ComposerInput,
  type PredictedKey,
} from '../src/typing-engine/composer/index.ts';

interface Case {
  name: string;
  /** Keys to type first, to put composer in a non-initial state. */
  setup: Array<Pick<ComposerInput, 'code' | 'shift' | 'altGr'>>;
  target: string;
  expect: PredictedKey | null;
}

const CASES: Case[] = [
  {
    name: 'empty + target "க" → predict KeyH',
    setup: [],
    target: 'க',
    expect: { code: 'KeyH', shift: false, altGr: false },
  },
  {
    name: 'after typing "க" toward target "கி" → predict KeyS',
    setup: [{ code: 'KeyH', shift: false, altGr: false }],
    target: 'கி',
    expect: { code: 'KeyS', shift: false, altGr: false },
  },
  {
    name: 'after typing "க" toward target "க" → null (done)',
    setup: [{ code: 'KeyH', shift: false, altGr: false }],
    target: 'க',
    expect: null,
  },
  {
    name: 'after diverging from "க" (typed ங) → null',
    setup: [{ code: 'KeyB', shift: false, altGr: false }],
    target: 'க',
    expect: null,
  },
  {
    name: 'empty + target "க்க" → predict KeyH (then R4 fires on second H)',
    setup: [],
    target: 'க்க',
    expect: { code: 'KeyH', shift: false, altGr: false },
  },
  {
    name: 'after typing "க" toward "க்க" → predict KeyH (R4)',
    setup: [{ code: 'KeyH', shift: false, altGr: false }],
    target: 'க்க',
    expect: { code: 'KeyH', shift: false, altGr: false },
  },
  {
    name: 'empty + target with space "க ம" → predict KeyH',
    setup: [],
    target: 'க ம',
    expect: { code: 'KeyH', shift: false, altGr: false },
  },
  {
    name: 'after typing "க" toward "க ம" → predict Space',
    setup: [{ code: 'KeyH', shift: false, altGr: false }],
    target: 'க ம',
    expect: { code: 'Space', shift: false, altGr: false },
  },
  {
    name: 'empty + target "ஸ" (grantha) → predict shifted KeyQ',
    setup: [],
    target: 'ஸ',
    expect: { code: 'KeyQ', shift: true, altGr: false },
  },
  {
    name: 'empty + target "ா" (standalone vowel sign) → predict AltGr+KeyQ',
    setup: [],
    target: 'ா',
    expect: { code: 'KeyQ', shift: false, altGr: true },
  },
];

function eqPrediction(a: PredictedKey | null, b: PredictedKey | null): boolean {
  if (a === null || b === null) return a === b;
  return a.code === b.code && a.shift === b.shift && a.altGr === b.altGr;
}

function describe(p: PredictedKey | null): string {
  if (p === null) return 'null';
  return `${p.code}${p.shift ? '+S' : ''}${p.altGr ? '+G' : ''}`;
}

function run(): void {
  let pass = 0;
  const failures: string[] = [];

  for (const c of CASES) {
    const composer = new KeyComposer(keymapFixtures.exceptions);
    for (const k of c.setup) {
      composer.step({ ...k, isBackspace: false, ts: 0 });
    }
    const beforeState = composer.currentString;

    const prediction = predictNextKey(composer, c.target);

    const afterState = composer.currentString;

    // Invariant: prediction must not mutate composer state.
    if (beforeState !== afterState) {
      failures.push(
        `[${c.name}] composer state mutated: "${beforeState}" → "${afterState}"`,
      );
      continue;
    }

    if (!eqPrediction(prediction, c.expect)) {
      failures.push(
        `[${c.name}] predicted ${describe(prediction)}, expected ${describe(c.expect)}`,
      );
      continue;
    }

    // If non-null prediction, verify that pressing it actually advances toward target.
    if (prediction !== null) {
      composer.step({
        code: prediction.code,
        shift: prediction.shift,
        altGr: prediction.altGr,
        isBackspace: false,
        ts: 0,
      });
      const advanced = composer.currentString;
      if (!c.target.startsWith(advanced) || advanced.length <= beforeState.length) {
        failures.push(
          `[${c.name}] prediction ${describe(prediction)} did not advance: "${beforeState}" → "${advanced}"`,
        );
      }
    }

    pass++;
  }

  console.log(`predictNextKey tests: ${pass}/${CASES.length} pass`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f}`);
    process.exit(1);
  }
}

run();
