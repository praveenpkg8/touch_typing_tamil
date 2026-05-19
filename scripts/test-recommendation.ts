#!/usr/bin/env tsx
/**
 * Tests for the recommendation engine + targeted drill generator.
 *
 * Mock-data driven. Each test case constructs a synthetic persistence
 * snapshot (lessons, sessions, attempts, mistakes) and asserts the
 * Recommendation kind + key fields produced by computeRecommendation.
 */

import {
  computeRecommendation,
  generateTargetedDrill,
  type Recommendation,
} from '../src/recommendation/index.ts';
import { LESSONS } from '../src/content/lessons/index.ts';
import type {
  LessonAttempt,
  Mistake,
  Session,
} from '../src/persistence/index.ts';

// ─────────────────────────────────────────────────────────────────────────
// Fixture builders
// ─────────────────────────────────────────────────────────────────────────

function mkSession(opts: {
  id: string;
  lessonId: string | null;
  createdAt: string;
  endedAt?: string;
  accuracy: number;
  gpm: number;
}): Session {
  return {
    id: opts.id,
    schemaVersion: 1,
    userId: 'u',
    deviceId: 'd',
    createdAt: opts.createdAt,
    practiceMode: 'character',
    lessonId: opts.lessonId,
    startedAt: opts.createdAt,
    endedAt: opts.endedAt ?? opts.createdAt,
    durationSeconds: 60,
    targetText: '',
    targetGraphemeCount: 10,
    typedGraphemeCount: 10,
    correctGraphemes: 9,
    incorrectGraphemes: 1,
    totalKeystrokes: 10,
    correctKeystrokes: 9,
    graphemesPerMinute: opts.gpm,
    keystrokesPerMinute: opts.gpm,
    accuracyGraphemes: opts.accuracy,
    accuracyKeystrokes: opts.accuracy,
  };
}

function mkAttempt(opts: {
  id: string;
  lessonId: string;
  sessionId: string;
  passed: boolean;
  createdAt: string;
}): LessonAttempt {
  return {
    id: opts.id,
    schemaVersion: 1,
    userId: 'u',
    lessonId: opts.lessonId,
    sessionId: opts.sessionId,
    createdAt: opts.createdAt,
    status: 'completed',
    achievedAccuracyGraphemes: opts.passed ? 95 : 70,
    achievedGPM: opts.passed ? 30 : 10,
    metCompletionCriteria: opts.passed,
  };
}

function mkMistakes(opts: {
  sessionId: string;
  grapheme: string;
  kind: string;
  count: number;
  baseId?: string;
}): Mistake[] {
  return Array.from({ length: opts.count }, (_, i) => ({
    id: `${opts.baseId ?? opts.sessionId}-m-${i}`,
    schemaVersion: 1,
    sessionId: opts.sessionId,
    userId: 'u',
    createdAt: '2026-05-19T10:00:00Z',
    kind: opts.kind as Mistake['kind'],
    expectedGrapheme: opts.grapheme,
    typedGrapheme: 'X',
    expectedCode: '',
    typedCode: '',
    cursorPosGraphemes: 0,
    keystrokeEventIds: [],
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Recommendation tests
// ─────────────────────────────────────────────────────────────────────────

interface RecCase {
  name: string;
  input: Parameters<typeof computeRecommendation>[0];
  expectKind: Recommendation['kind'];
  /** Optional further assertions. */
  validate?: (rec: Recommendation) => string | null;
}

const NOW = new Date('2026-05-19T12:00:00Z');

const REC_CASES: RecCase[] = [
  {
    name: 'no sessions → start-first with L01',
    input: {
      lessons: LESSONS,
      recentSessions: [],
      attempts: [],
      mistakes: [],
      now: NOW,
    },
    expectKind: 'start-first',
    validate: rec =>
      rec.kind === 'start-first' && rec.lessonId === 'L01-home-row-mei'
        ? null
        : `expected L01-home-row-mei, got ${'lessonId' in rec ? rec.lessonId : 'n/a'}`,
  },
  {
    name: 'last session 70% accuracy → retry same lesson (R1)',
    input: {
      lessons: LESSONS,
      recentSessions: [
        mkSession({
          id: 's1',
          lessonId: 'L01-home-row-mei',
          createdAt: '2026-05-19T11:00:00Z',
          accuracy: 70,
          gpm: 12,
        }),
      ],
      attempts: [],
      mistakes: [],
      now: NOW,
    },
    expectKind: 'retry-lesson',
    validate: rec =>
      rec.kind === 'retry-lesson' && rec.lessonId === 'L01-home-row-mei'
        ? null
        : 'expected retry on L01',
  },
  {
    name: 'last session 96% accuracy + good gpm → next-lesson (R2)',
    input: {
      lessons: LESSONS,
      recentSessions: [
        mkSession({
          id: 's1',
          lessonId: 'L01-home-row-mei',
          createdAt: '2026-05-19T11:00:00Z',
          accuracy: 96,
          gpm: 30,
        }),
      ],
      attempts: [
        mkAttempt({
          id: 'a1',
          lessonId: 'L01-home-row-mei',
          sessionId: 's1',
          passed: true,
          createdAt: '2026-05-19T11:01:00Z',
        }),
      ],
      mistakes: [],
      now: NOW,
    },
    expectKind: 'next-lesson',
    validate: rec =>
      rec.kind === 'next-lesson' && rec.lessonId === 'L02-home-row-uyir'
        ? null
        : `expected next L02-home-row-uyir, got ${'lessonId' in rec ? rec.lessonId : 'n/a'}`,
  },
  {
    name: '5+ mistakes on same (grapheme, kind) → targeted-drill (R3)',
    input: {
      lessons: LESSONS,
      recentSessions: [
        mkSession({
          id: 's1',
          lessonId: 'L01-home-row-mei',
          createdAt: '2026-05-19T11:00:00Z',
          accuracy: 85,
          gpm: 20,
        }),
      ],
      attempts: [],
      mistakes: mkMistakes({
        sessionId: 's1',
        grapheme: 'க',
        kind: 'wrong-mei',
        count: 6,
      }),
      now: NOW,
    },
    expectKind: 'targeted-drill',
    validate: rec =>
      rec.kind === 'targeted-drill' && rec.weakGraphemes.includes('க')
        ? null
        : 'expected targeted drill including க',
  },
  {
    name: 'last session 4 days ago → refresher (R4)',
    input: {
      lessons: LESSONS,
      recentSessions: [
        mkSession({
          id: 's1',
          lessonId: 'L01-home-row-mei',
          createdAt: '2026-05-15T11:00:00Z',
          endedAt: '2026-05-15T11:00:00Z',
          accuracy: 95,
          gpm: 25,
        }),
      ],
      attempts: [
        mkAttempt({
          id: 'a1',
          lessonId: 'L01-home-row-mei',
          sessionId: 's1',
          passed: true,
          createdAt: '2026-05-15T11:01:00Z',
        }),
      ],
      mistakes: [],
      now: NOW,
    },
    expectKind: 'refresher',
    validate: rec =>
      rec.kind === 'refresher' && rec.lessonId === 'L01-home-row-mei'
        ? null
        : 'expected refresher on L01',
  },
  {
    name: 'precedence: stale (R4) wins over low-accuracy (R1)',
    input: {
      lessons: LESSONS,
      recentSessions: [
        mkSession({
          id: 's1',
          lessonId: 'L01-home-row-mei',
          createdAt: '2026-05-15T11:00:00Z',
          endedAt: '2026-05-15T11:00:00Z',
          accuracy: 50,
          gpm: 5,
        }),
      ],
      attempts: [
        mkAttempt({
          id: 'a1',
          lessonId: 'L01-home-row-mei',
          sessionId: 'older-s',
          passed: true,
          createdAt: '2026-05-01T11:01:00Z',
        }),
      ],
      mistakes: [],
      now: NOW,
    },
    expectKind: 'refresher',
  },
  {
    name: 'low-accuracy on already-passed lesson → next-lesson, not retry',
    input: {
      lessons: LESSONS,
      recentSessions: [
        mkSession({
          id: 's2',
          lessonId: 'L01-home-row-mei',
          createdAt: '2026-05-19T12:00:00Z',
          accuracy: 70,
          gpm: 8,
        }),
        mkSession({
          id: 's1',
          lessonId: 'L01-home-row-mei',
          createdAt: '2026-05-18T11:00:00Z',
          accuracy: 95,
          gpm: 25,
        }),
      ],
      attempts: [
        mkAttempt({
          id: 'a1',
          lessonId: 'L01-home-row-mei',
          sessionId: 's1',
          passed: true,
          createdAt: '2026-05-18T11:01:00Z',
        }),
      ],
      mistakes: [],
      now: NOW,
    },
    expectKind: 'next-lesson',
    validate: rec =>
      rec.kind === 'next-lesson' && rec.lessonId === 'L02-home-row-uyir'
        ? null
        : 'expected next-lesson on L02 even though latest L01 attempt was bad (L01 already passed)',
  },
  {
    name: 'all lessons passed → all-done',
    input: {
      lessons: LESSONS,
      recentSessions: [
        mkSession({
          id: 's3',
          lessonId: 'L03-uyirmei-intro',
          createdAt: '2026-05-19T11:00:00Z',
          accuracy: 98,
          gpm: 30,
        }),
      ],
      attempts: LESSONS.map((l, i) =>
        mkAttempt({
          id: `a${i}`,
          lessonId: l.id,
          sessionId: `s${i}`,
          passed: true,
          createdAt: '2026-05-19T11:01:00Z',
        }),
      ),
      mistakes: [],
      now: NOW,
    },
    expectKind: 'all-done',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Drill generator tests
// ─────────────────────────────────────────────────────────────────────────

interface DrillCase {
  name: string;
  weak: string[];
  expectGraphemes: string[];
  /** All graphemes in target must be in this set (after split by space). */
  expectTargetGraphemesSubset?: string[];
  expectMinLen?: number;
}

const DRILL_CASES: DrillCase[] = [
  {
    name: 'single grapheme',
    weak: ['க'],
    expectGraphemes: ['க'],
    expectMinLen: 1,
  },
  {
    name: 'three graphemes — block then mixed',
    weak: ['க', 'ம', 'த'],
    expectGraphemes: ['க', 'ம', 'த'],
    expectTargetGraphemesSubset: ['க', 'ம', 'த'],
  },
  {
    name: 'dedupe + cap at 5',
    weak: ['க', 'க', 'ம', 'த', 'ந', 'ப', 'ய'],
    expectGraphemes: ['க', 'ம', 'த', 'ந', 'ப'],
  },
  {
    name: 'empty input → empty target',
    weak: [],
    expectGraphemes: [],
  },
  {
    name: 'deterministic: same input twice → same output',
    weak: ['க', 'ம'],
    expectGraphemes: ['க', 'ம'],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────

function main(): void {
  let pass = 0;
  const failures: string[] = [];

  for (const c of REC_CASES) {
    const rec = computeRecommendation(c.input);
    if (rec.kind !== c.expectKind) {
      failures.push(
        `[REC ${c.name}] kind ${rec.kind} ≠ expected ${c.expectKind} (reason: ${rec.reason})`,
      );
      continue;
    }
    const validation = c.validate?.(rec);
    if (validation) {
      failures.push(`[REC ${c.name}] ${validation}`);
      continue;
    }
    pass++;
  }

  for (const c of DRILL_CASES) {
    const drill = generateTargetedDrill({ weakGraphemes: c.weak });
    if (drill.graphemes.length !== c.expectGraphemes.length) {
      failures.push(
        `[DRILL ${c.name}] graphemes length ${drill.graphemes.length} ≠ expected ${c.expectGraphemes.length}`,
      );
      continue;
    }
    for (let i = 0; i < c.expectGraphemes.length; i++) {
      if (drill.graphemes[i] !== c.expectGraphemes[i]) {
        failures.push(
          `[DRILL ${c.name}] graphemes[${i}] = ${drill.graphemes[i]} ≠ ${c.expectGraphemes[i]}`,
        );
        continue;
      }
    }
    if (c.expectMinLen !== undefined && drill.target.length < c.expectMinLen) {
      failures.push(`[DRILL ${c.name}] target too short: "${drill.target}"`);
      continue;
    }
    pass++;
  }

  // Determinism check
  const d1 = generateTargetedDrill({ weakGraphemes: ['க', 'ம'] });
  const d2 = generateTargetedDrill({ weakGraphemes: ['க', 'ம'] });
  if (d1.target !== d2.target) {
    failures.push(
      `[DRILL determinism] same input produced different output:\n  ${d1.target}\n  ${d2.target}`,
    );
  } else {
    pass++;
  }

  const total = REC_CASES.length + DRILL_CASES.length + 1;
  console.log(`Recommendation + drill tests: ${pass}/${total} pass`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f}`);
    process.exit(1);
  }
}

main();
