#!/usr/bin/env tsx
/**
 * Tests for applyHysteresis — pure function, no localStorage dependency.
 */

import {
  applyHysteresis,
  recommendationsEqual,
  type Recommendation,
} from '../src/recommendation/index.ts';
import type { Session } from '../src/persistence/index.ts';

function mkSession(opts: { accuracy: number; gpm: number; lessonId: string | null }): Session {
  return {
    id: 's',
    schemaVersion: 1,
    userId: 'u',
    deviceId: 'd',
    createdAt: '2026-05-19T11:00:00Z',
    practiceMode: 'character',
    lessonId: opts.lessonId,
    startedAt: '2026-05-19T11:00:00Z',
    endedAt: '2026-05-19T11:01:00Z',
    durationSeconds: 60,
    targetText: '',
    targetGraphemeCount: 10,
    typedGraphemeCount: 10,
    correctGraphemes: 10,
    incorrectGraphemes: 0,
    totalKeystrokes: 10,
    correctKeystrokes: 10,
    graphemesPerMinute: opts.gpm,
    keystrokesPerMinute: opts.gpm,
    accuracyGraphemes: opts.accuracy,
    accuracyKeystrokes: opts.accuracy,
  };
}

const nextLessonL02: Recommendation = {
  kind: 'next-lesson',
  lessonId: 'L02-home-row-uyir',
  reason: 'advance',
};
const nextLessonL03: Recommendation = {
  kind: 'next-lesson',
  lessonId: 'L03-uyirmei-intro',
  reason: 'advance',
};
const retryL02: Recommendation = {
  kind: 'retry-lesson',
  lessonId: 'L02-home-row-uyir',
  reason: 'low accuracy',
};
const retryL03: Recommendation = {
  kind: 'retry-lesson',
  lessonId: 'L03-uyirmei-intro',
  reason: 'low accuracy',
};
const targetedDrill: Recommendation = {
  kind: 'targeted-drill',
  weakGraphemes: ['க', 'ம'],
  reason: 'weak',
};
const refresher: Recommendation = {
  kind: 'refresher',
  lessonId: 'L01-home-row-mei',
  reason: 'stale',
};
const allDone: Recommendation = {
  kind: 'all-done',
  reason: 'done',
};
const startFirst: Recommendation = {
  kind: 'start-first',
  lessonId: 'L01-home-row-mei',
  reason: 'welcome',
};

interface Case {
  name: string;
  prev: Recommendation | null;
  next: Recommendation;
  lastSession: Session | null;
  expect: Recommendation;
}

const CASES: Case[] = [
  // ── recommendationsEqual / no-prev cases ─────────────────────────────
  {
    name: 'no prev → return new',
    prev: null,
    next: nextLessonL02,
    lastSession: null,
    expect: nextLessonL02,
  },
  {
    name: 'identical rec → return new (no flicker)',
    prev: nextLessonL02,
    next: { ...nextLessonL02, reason: 'different reason text' },
    lastSession: null,
    expect: { ...nextLessonL02, reason: 'different reason text' },
  },

  // ── always-honor critical kinds ──────────────────────────────────────
  {
    name: 'targeted-drill always honored over next-lesson',
    prev: nextLessonL02,
    next: targetedDrill,
    lastSession: mkSession({ accuracy: 90, gpm: 20, lessonId: 'L02-home-row-uyir' }),
    expect: targetedDrill,
  },
  {
    name: 'refresher always honored over retry',
    prev: retryL02,
    next: refresher,
    lastSession: mkSession({ accuracy: 50, gpm: 5, lessonId: 'L02-home-row-uyir' }),
    expect: refresher,
  },
  {
    name: 'all-done always honored',
    prev: nextLessonL02,
    next: allDone,
    lastSession: null,
    expect: allDone,
  },
  {
    name: 'start-first always honored',
    prev: retryL02,
    next: startFirst,
    lastSession: null,
    expect: startFirst,
  },

  // ── anti-regression (next-lesson → retry-lesson on SAME lesson) ──────
  {
    name: 'marginal regression (acc 78%) → keep prev (next-lesson)',
    prev: nextLessonL02,
    next: retryL02,
    lastSession: mkSession({ accuracy: 78, gpm: 10, lessonId: 'L02-home-row-uyir' }),
    expect: nextLessonL02,
  },
  {
    name: 'borderline regression (acc 75%) → keep prev',
    prev: nextLessonL02,
    next: retryL02,
    lastSession: mkSession({ accuracy: 75, gpm: 10, lessonId: 'L02-home-row-uyir' }),
    expect: nextLessonL02,
  },
  {
    name: 'deep regression (acc 60%) → honor retry',
    prev: nextLessonL02,
    next: retryL02,
    lastSession: mkSession({ accuracy: 60, gpm: 5, lessonId: 'L02-home-row-uyir' }),
    expect: retryL02,
  },
  {
    name: 'just past margin (acc 74%) → honor retry',
    prev: nextLessonL02,
    next: retryL02,
    lastSession: mkSession({ accuracy: 74, gpm: 8, lessonId: 'L02-home-row-uyir' }),
    expect: retryL02,
  },

  // ── different-lesson transitions are honored ─────────────────────────
  {
    name: 'next-lesson(L02) → next-lesson(L03) [normal advance]: honor',
    prev: nextLessonL02,
    next: nextLessonL03,
    lastSession: mkSession({ accuracy: 97, gpm: 25, lessonId: 'L02-home-row-uyir' }),
    expect: nextLessonL03,
  },
  {
    name: 'retry(L02) → retry(L03) [different lesson]: honor',
    prev: retryL02,
    next: retryL03,
    lastSession: mkSession({ accuracy: 70, gpm: 8, lessonId: 'L03-uyirmei-intro' }),
    expect: retryL03,
  },

  // ── promotion (retry → next) is always honored ───────────────────────
  {
    name: 'retry(L02) → next-lesson(L03) [user advanced]: honor',
    prev: retryL02,
    next: nextLessonL03,
    lastSession: mkSession({ accuracy: 96, gpm: 20, lessonId: 'L02-home-row-uyir' }),
    expect: nextLessonL03,
  },
  {
    name: 'retry(L02) → next-lesson(L03) [just past advance threshold]: honor',
    prev: retryL02,
    next: nextLessonL03,
    lastSession: mkSession({ accuracy: 95, gpm: 14, lessonId: 'L02-home-row-uyir' }),
    expect: nextLessonL03,
  },
];

function describe(r: Recommendation): string {
  switch (r.kind) {
    case 'start-first':
    case 'next-lesson':
    case 'retry-lesson':
    case 'refresher':
      return `${r.kind}:${r.lessonId}`;
    case 'targeted-drill':
      return `${r.kind}:${r.weakGraphemes.join(',')}`;
    case 'all-done':
      return r.kind;
  }
}

function run(): void {
  let pass = 0;
  const failures: string[] = [];

  for (const c of CASES) {
    const result = applyHysteresis(c.prev, c.next, c.lastSession);
    if (!recommendationsEqual(result, c.expect)) {
      failures.push(
        `[${c.name}] got ${describe(result)}, expected ${describe(c.expect)}`,
      );
      continue;
    }
    pass++;
  }

  console.log(`Hysteresis tests: ${pass}/${CASES.length} pass`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f}`);
    process.exit(1);
  }
}

run();
