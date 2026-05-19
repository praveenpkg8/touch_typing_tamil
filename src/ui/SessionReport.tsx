/**
 * SessionReport — shown after a session ends (manual or automatic).
 * Renders the SessionSummary from the engine store: metrics, mistake
 * breakdown, lesson completion status, and a real Recommendation card.
 */

import type { SessionSummary } from '../state/typingEngineStore.ts';
import { useRecommendation } from '../recommendation/index.ts';
import { RecommendationCard } from './RecommendationCard.tsx';
import type { Lesson } from '../content/lessons/index.ts';

interface SessionReportProps {
  summary: SessionSummary;
  onContinue: () => void;
  onActionLesson: (lesson: Lesson) => void;
  onActionTargetedDrill: (weakGraphemes: string[]) => void;
}

export function SessionReport({
  summary,
  onContinue,
  onActionLesson,
  onActionTargetedDrill,
}: SessionReportProps) {
  const recommendation = useRecommendation();

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <header className="text-center space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Session report</h1>
        <p className="text-sm text-slate-500">
          {summary.metCompletionCriteria ? (
            <span className="text-emerald-600 font-medium">Lesson criteria met</span>
          ) : (
            <span>Practice session recorded</span>
          )}
          {' · '}
          {summary.durationSeconds.toFixed(1)}s effective time
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Accuracy (graphemes)" value={`${summary.accuracyGraphemes}%`} />
        <Metric label="Accuracy (keystrokes)" value={`${summary.accuracyKeystrokes}%`} />
        <Metric label="Speed" value={`${summary.graphemesPerMinute} gpm`} hint={`${summary.keystrokesPerMinute} kpm`} />
        <Metric label="Target" value={`${summary.correctGraphemes}/${summary.targetGraphemeCount}`} hint="correct / total" />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Mistake breakdown
        </h2>
        {summary.mistakeBreakdown.length === 0 ? (
          <p className="text-sm text-slate-600">No mistakes — clean run.</p>
        ) : (
          <ul className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg overflow-hidden">
            {summary.mistakeBreakdown.slice(0, 8).map((m, idx) => (
              <li key={idx} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="flex items-baseline gap-3">
                  <span className="font-tamil text-xl text-slate-800">{m.expected}</span>
                  <span className="text-xs text-slate-500">{prettyKind(m.kind)}</span>
                </div>
                <span className="tabular-nums text-slate-600">×{m.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recommendation && (
        <RecommendationCard
          recommendation={recommendation}
          onActionLesson={onActionLesson}
          onActionTargetedDrill={onActionTargetedDrill}
          variant="highlight"
        />
      )}

      <div className="text-center">
        <button
          onClick={onContinue}
          className="px-5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium"
        >
          Back to lessons
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg py-3 px-4 text-center shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-3xl font-semibold text-slate-900 leading-tight tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}

function prettyKind(kind: string): string {
  return kind.replace(/-/g, ' ');
}
