#!/usr/bin/env tsx
/**
 * End-to-end integration test for Composer + Validator.
 * Simulates a user typing through a lesson drill and asserts the validator's
 * per-keystroke verdicts match what we'd expect.
 */

import keymapFixtures from '../src/typing-engine/composer/keymap.fixtures.json' with { type: 'json' };
import { KeyComposer } from '../src/typing-engine/composer/index.ts';
import { Validator } from '../src/typing-engine/validator/index.ts';

interface Step {
  code: string;
  shift?: boolean;
  altGr?: boolean;
  isBackspace?: boolean;
  expectComposerString: string;
  expectCorrect: boolean;
  expectCursor: number;
  expectComplete?: boolean;
  expectMistakeKind?: string;
}

interface Case {
  name: string;
  target: string;
  steps: Step[];
}

const CASES: Case[] = [
  {
    name: 'single mei correctly typed',
    target: 'க',
    steps: [
      { code: 'KeyH', expectComposerString: 'க', expectCorrect: true, expectCursor: 1, expectComplete: true },
    ],
  },
  {
    name: 'uyirmei: க + i → கி',
    target: 'கி',
    steps: [
      { code: 'KeyH', expectComposerString: 'க', expectCorrect: true, expectCursor: 0 }, // in-progress
      { code: 'KeyS', expectComposerString: 'கி', expectCorrect: true, expectCursor: 1, expectComplete: true },
    ],
  },
  {
    name: 'wrong mei caught',
    target: 'க',
    steps: [
      { code: 'KeyB', expectComposerString: 'ங', expectCorrect: false, expectCursor: 0, expectMistakeKind: 'wrong-mei' },
    ],
  },
  {
    name: 'wrong vowel sign caught',
    target: 'கி',
    steps: [
      { code: 'KeyH', expectComposerString: 'க', expectCorrect: true, expectCursor: 0 },
      { code: 'KeyD', expectComposerString: 'கு', expectCorrect: false, expectCursor: 0, expectMistakeKind: 'wrong-vowel-sign' },
    ],
  },
  {
    name: 'space between graphemes',
    target: 'க ம',
    steps: [
      { code: 'KeyH', expectComposerString: 'க', expectCorrect: true, expectCursor: 1 },
      { code: 'Space', expectComposerString: 'க ', expectCorrect: true, expectCursor: 2 },
      { code: 'KeyK', expectComposerString: 'க ம', expectCorrect: true, expectCursor: 3, expectComplete: true },
    ],
  },
  {
    name: 'backspace recovers from mistake',
    target: 'க',
    steps: [
      { code: 'KeyB', expectComposerString: 'ங', expectCorrect: false, expectCursor: 0, expectMistakeKind: 'wrong-mei' },
      { code: 'Backspace', isBackspace: true, expectComposerString: '', expectCorrect: true, expectCursor: 0 },
      { code: 'KeyH', expectComposerString: 'க', expectCorrect: true, expectCursor: 1, expectComplete: true },
    ],
  },
  {
    name: 'multiple consecutive backspaces each remove one keystroke',
    target: 'கம',
    steps: [
      { code: 'KeyH', expectComposerString: 'க', expectCorrect: true, expectCursor: 1 },
      { code: 'KeyK', expectComposerString: 'கம', expectCorrect: true, expectCursor: 2, expectComplete: true },
      { code: 'Backspace', isBackspace: true, expectComposerString: 'க', expectCorrect: true, expectCursor: 1 },
      { code: 'Backspace', isBackspace: true, expectComposerString: '', expectCorrect: true, expectCursor: 0 },
      { code: 'Backspace', isBackspace: true, expectComposerString: '', expectCorrect: true, expectCursor: 0 },
      { code: 'KeyH', expectComposerString: 'க', expectCorrect: true, expectCursor: 1 },
      { code: 'KeyK', expectComposerString: 'கம', expectCorrect: true, expectCursor: 2, expectComplete: true },
    ],
  },
  {
    name: 'backspace rolls back R3 substitution cleanly',
    target: 'கி',
    steps: [
      { code: 'KeyH', expectComposerString: 'க', expectCorrect: true, expectCursor: 0 },
      { code: 'KeyS', expectComposerString: 'கி', expectCorrect: true, expectCursor: 1, expectComplete: true },
      { code: 'Backspace', isBackspace: true, expectComposerString: 'க', expectCorrect: true, expectCursor: 0 },
      { code: 'Backspace', isBackspace: true, expectComposerString: '', expectCorrect: true, expectCursor: 0 },
    ],
  },
  {
    name: 'backspace rolls back R4 gemination cleanly',
    target: 'க்க',
    steps: [
      { code: 'KeyH', expectComposerString: 'க', expectCorrect: true, expectCursor: 0 },
      { code: 'KeyH', expectComposerString: 'க்க', expectCorrect: true, expectCursor: 2, expectComplete: true },
      { code: 'Backspace', isBackspace: true, expectComposerString: 'க', expectCorrect: true, expectCursor: 0 },
    ],
  },
];

function run() {
  let pass = 0;
  let fail = 0;
  const failures: string[] = [];

  for (const c of CASES) {
    const composer = new KeyComposer(keymapFixtures.exceptions);
    const validator = new Validator(c.target);

    let stepFailed = false;
    for (let i = 0; i < c.steps.length; i++) {
      const step = c.steps[i]!;
      composer.step({
        code: step.code,
        shift: step.shift ?? false,
        altGr: step.altGr ?? false,
        isBackspace: step.isBackspace ?? false,
        ts: i * 100,
      });
      const cs = composer.currentString;
      const v = validator.validate(cs);

      const checks: string[] = [];
      if (cs !== step.expectComposerString) {
        checks.push(`composer "${cs}" != expected "${step.expectComposerString}"`);
      }
      if (v.wasCorrect !== step.expectCorrect) {
        checks.push(`wasCorrect ${v.wasCorrect} != expected ${step.expectCorrect}`);
      }
      if (v.cursorPosGraphemes !== step.expectCursor) {
        checks.push(`cursor ${v.cursorPosGraphemes} != expected ${step.expectCursor}`);
      }
      if (step.expectComplete !== undefined && v.isComplete !== step.expectComplete) {
        checks.push(`complete ${v.isComplete} != expected ${step.expectComplete}`);
      }
      if (step.expectMistakeKind !== undefined && v.mistakeKind !== step.expectMistakeKind) {
        checks.push(`mistakeKind ${v.mistakeKind} != expected ${step.expectMistakeKind}`);
      }
      if (checks.length > 0) {
        failures.push(`[${c.name}] step ${i + 1} (${step.code}): ${checks.join('; ')}`);
        stepFailed = true;
        break;
      }
    }

    if (stepFailed) fail++;
    else pass++;
  }

  console.log(`Integration tests: ${pass}/${CASES.length} pass`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f}`);
    process.exit(1);
  }
}

run();
