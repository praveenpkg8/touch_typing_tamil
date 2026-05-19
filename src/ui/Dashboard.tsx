/**
 * Dashboard — top-level analytics view.
 *
 * Sections:
 *   1. Top-line stats: total sessions, total practice time, best speed,
 *      mean accuracy
 *   2. Last 14 sessions list with inline accuracy + GPM trend sparklines
 *   3. Top 10 weak graphemes across all time
 *   4. Lesson completion grid: each lesson with passed / in-progress / not-started
 *
 * All data is reactive via useLiveQuery — flips immediately when a new
 * session is persisted.
 */

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_USER_ID } from '../persistence/index.ts';
import { LESSONS, type Lesson } from '../content/lessons/index.ts';
import type {
  LessonAttempt,
  Mistake,
  Session,
} from '../persistence/index.ts';

interface DashboardProps {
  onBack: () => void;
  onStartLesson: (lesson: Lesson) => void;
}

export function Dashboard({ onBack, onStartLesson }: DashboardProps) {
  const sessions = useLiveQuery(
    () =>
      db.sessions
        .where('userId')
        .equals(DEFAULT_USER_ID)
        .reverse()
        .sortBy('createdAt'),
    [],
    [] as Session[],
  );
  const attempts = useLiveQuery(
    () => db.lessonAttempts.where('userId').equals(DEFAULT_USER_ID).toArray(),
    [],
    [] as LessonAttempt[],
  );
  const mistakes = useLiveQuery(
    () => db.mistakes.where('userId').equals(DEFAULT_USER_ID).toArray(),
    [],
    [] as Mistake[],
  );

  const totals = useMemo(() => {
    const totalSessions = sessions.length;
    const totalSeconds = sessions.reduce((a, s) => a + s.durationSeconds, 0);
    const bestGpm = sessions.reduce((a, s) => Math.max(a, s.graphemesPerMinute), 0);
    const meanAccuracy =
      sessions.length > 0
        ? Math.round(
            sessions.reduce((a, s) => a + s.accuracyGraphemes, 0) / sessions.length,
          )
        : 0;
    return { totalSessions, totalSeconds, bestGpm, meanAccuracy };
  }, [sessions]);

  const recent = sessions.slice(0, 14);

  const weakAggregates = useMemo(() => {
    const buckets = new Map<string, { grapheme: string; count: number }>();
    for (const m of mistakes) {
      const b = buckets.get(m.expectedGrapheme);
      if (b) b.count++;
      else buckets.set(m.expectedGrapheme, { grapheme: m.expectedGrapheme, count: 1 });
    }
    return [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [mistakes]);

  const passedLessonIds = useMemo(
    () => new Set(attempts.filter(a => a.metCompletionCriteria).map(a => a.lessonId)),
    [attempts],
  );
  const attemptedLessonIds = useMemo(
    () => new Set(attempts.map(a => a.lessonId)),
    [attempts],
  );

  const bestPerLesson = useMemo(() => {
    const best = new Map<string, { accuracy: number; gpm: number }>();
    for (const a of attempts) {
      const existing = best.get(a.lessonId);
      if (!existing || a.achievedAccuracyGraphemes > existing.accuracy) {
        best.set(a.lessonId, {
          accuracy: a.achievedAccuracyGraphemes,
          gpm: a.achievedGPM,
        });
      }
    }
    return best;
  }, [attempts]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <header className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">All data is stored on this device.</p>
        </div>
        <button
          onClick={onBack}
          className="text-sm px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100"
        >
          ← Back
        </button>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Sessions" value={totals.totalSessions.toString()} />
        <Stat label="Practice time" value={formatDuration(totals.totalSeconds)} />
        <Stat
          label="Best speed"
          value={`${Math.round(totals.bestGpm)}`}
          hint="graphemes / min"
        />
        <Stat label="Avg accuracy" value={`${totals.meanAccuracy}%`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Trends
        </h2>
        <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          <TrendBlock
            label="Accuracy (graphemes %)"
            values={[...recent].reverse().map(s => s.accuracyGraphemes)}
            max={100}
            strokeColor="#10b981"
          />
          <TrendBlock
            label="Speed (graphemes / min)"
            values={[...recent].reverse().map(s => s.graphemesPerMinute)}
            max={Math.max(60, ...recent.map(s => s.graphemesPerMinute))}
            strokeColor="#f59e0b"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent sessions
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-600">No sessions yet — finish a lesson to populate.</p>
        ) : (
          <ul className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg overflow-hidden">
            {recent.map(s => (
              <li
                key={s.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="text-slate-500 text-xs">
                    {new Date(s.createdAt).toLocaleString()}
                  </div>
                  <div className="text-slate-800 truncate">
                    {s.practiceMode === 'custom'
                      ? 'Custom practice'
                      : LESSONS.find(l => l.id === s.lessonId)?.title.en ??
                        s.lessonId ??
                        'Practice'}
                  </div>
                </div>
                <div className="flex items-baseline gap-4 tabular-nums">
                  <span
                    className={
                      s.accuracyGraphemes >= 95
                        ? 'text-emerald-600'
                        : s.accuracyGraphemes >= 80
                          ? 'text-slate-700'
                          : 'text-rose-600'
                    }
                  >
                    {s.accuracyGraphemes}%
                  </span>
                  <span className="text-slate-700">{s.graphemesPerMinute} gpm</span>
                  <span className="text-slate-400 text-xs">
                    {formatDuration(s.durationSeconds)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Weak graphemes
        </h2>
        {weakAggregates.length === 0 ? (
          <p className="text-sm text-slate-600">No mistakes yet.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex flex-wrap gap-2">
              {weakAggregates.map(w => (
                <div
                  key={w.grapheme}
                  className="flex items-baseline gap-2 bg-rose-50 border border-rose-200 rounded-full px-3 py-1.5"
                  title={`${w.count} mistakes`}
                >
                  <span className="font-tamil text-xl text-slate-900">{w.grapheme}</span>
                  <span className="text-xs text-rose-700 tabular-nums">×{w.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Lessons
        </h2>
        <ul className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg overflow-hidden">
          {LESSONS.map(lesson => {
            const passed = passedLessonIds.has(lesson.id);
            const attempted = attemptedLessonIds.has(lesson.id);
            const best = bestPerLesson.get(lesson.id);
            const status = passed
              ? { label: 'Passed', cls: 'bg-emerald-100 text-emerald-800' }
              : attempted
                ? { label: 'In progress', cls: 'bg-amber-100 text-amber-800' }
                : { label: 'Not started', cls: 'bg-slate-100 text-slate-600' };
            return (
              <li
                key={lesson.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <div className="space-y-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="font-tamil text-base text-slate-900">
                      {lesson.title.ta}
                    </span>
                    <span className="text-slate-500 text-xs">{lesson.title.en}</span>
                  </div>
                  {best && (
                    <div className="text-xs text-slate-500 tabular-nums">
                      best {best.accuracy}% · {Math.round(best.gpm)} gpm
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${status.cls}`}
                  >
                    {status.label}
                  </span>
                  <button
                    onClick={() => onStartLesson(lesson)}
                    className="text-xs px-3 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    Practice
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg py-3 px-4 text-center shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 leading-tight tabular-nums">
        {value}
      </div>
      {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}

function TrendBlock({
  label,
  values,
  max,
  strokeColor,
}: {
  label: string;
  values: number[];
  max: number;
  strokeColor: string;
}) {
  if (values.length === 0) {
    return (
      <div className="text-sm text-slate-400">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</div>
        <div className="text-slate-400 italic">no data yet</div>
      </div>
    );
  }

  const width = 260;
  const height = 60;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const safeMax = max <= 0 ? 1 : max;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - (Math.min(v, safeMax) / safeMax) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = values[values.length - 1]!;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-sm font-semibold text-slate-700 tabular-nums">
          {Math.round(last)}
        </div>
      </div>
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          points={points}
        />
        {values.map((v, i) => {
          const x = i * stepX;
          const y = height - (Math.min(v, safeMax) / safeMax) * height;
          return <circle key={i} cx={x} cy={y} r="2" fill={strokeColor} />;
        })}
      </svg>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds - minutes * 60);
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes - hours * 60;
  return `${hours}h ${remMin}m`;
}
