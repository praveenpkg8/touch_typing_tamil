/**
 * RecommendationCard — renders a single Recommendation with an action button.
 * Used by SessionReport and LessonSelect.
 */

import { getLessonById, type Lesson } from '../content/lessons/index.ts';
import type { Recommendation } from '../recommendation/index.ts';

interface RecommendationCardProps {
  recommendation: Recommendation;
  onActionLesson: (lesson: Lesson) => void;
  onActionTargetedDrill: (weakGraphemes: string[]) => void;
  variant?: 'highlight' | 'inline';
}

interface CardCopy {
  badge: string;
  badgeClass: string;
  title: string;
  cta: string | null;
}

function copyFor(rec: Recommendation): CardCopy {
  switch (rec.kind) {
    case 'start-first':
      return {
        badge: 'Start here',
        badgeClass: 'bg-emerald-200 text-emerald-800',
        title: 'Begin with the home-row consonants',
        cta: 'Start lesson',
      };
    case 'next-lesson':
      return {
        badge: 'Advance',
        badgeClass: 'bg-amber-200 text-amber-800',
        title: 'Ready for the next lesson',
        cta: 'Start lesson',
      };
    case 'retry-lesson':
      return {
        badge: 'Repeat',
        badgeClass: 'bg-sky-200 text-sky-800',
        title: 'One more pass on this lesson',
        cta: 'Repeat lesson',
      };
    case 'targeted-drill':
      return {
        badge: 'Targeted',
        badgeClass: 'bg-rose-200 text-rose-800',
        title: 'Drill your weak graphemes',
        cta: 'Start drill',
      };
    case 'refresher':
      return {
        badge: 'Refresher',
        badgeClass: 'bg-indigo-200 text-indigo-800',
        title: 'Warm up with a familiar lesson',
        cta: 'Refresh',
      };
    case 'all-done':
      return {
        badge: 'Complete',
        badgeClass: 'bg-slate-200 text-slate-700',
        title: 'Curriculum complete',
        cta: null,
      };
  }
}

export function RecommendationCard({
  recommendation,
  onActionLesson,
  onActionTargetedDrill,
  variant = 'inline',
}: RecommendationCardProps) {
  const copy = copyFor(recommendation);

  const onClick = () => {
    switch (recommendation.kind) {
      case 'start-first':
      case 'next-lesson':
      case 'retry-lesson':
      case 'refresher': {
        const lesson = getLessonById(recommendation.lessonId);
        if (lesson) onActionLesson(lesson);
        break;
      }
      case 'targeted-drill': {
        onActionTargetedDrill(recommendation.weakGraphemes);
        break;
      }
      case 'all-done':
        break;
    }
  };

  const containerCls =
    variant === 'highlight'
      ? 'bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-300 rounded-xl px-5 py-4 shadow-sm'
      : 'bg-amber-50 border border-amber-200 rounded-lg px-4 py-3';

  const lessonTitle =
    recommendation.kind !== 'targeted-drill' && recommendation.kind !== 'all-done'
      ? getLessonById(recommendation.lessonId)
      : null;

  return (
    <div className={containerCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${copy.badgeClass}`}
            >
              {copy.badge}
            </span>
            <span className="text-xs uppercase tracking-wide text-amber-700">
              Suggested next
            </span>
          </div>
          <div className="text-sm font-medium text-slate-900">{copy.title}</div>
          {lessonTitle && (
            <div className="flex items-baseline gap-2">
              <span className="font-tamil text-lg text-slate-900">
                {lessonTitle.title.ta}
              </span>
              <span className="text-sm text-slate-500">{lessonTitle.title.en}</span>
            </div>
          )}
          {recommendation.kind === 'targeted-drill' && (
            <div className="font-tamil text-2xl text-slate-900">
              {recommendation.weakGraphemes.join(' ')}
            </div>
          )}
          <div className="text-xs text-slate-600">{recommendation.reason}</div>
        </div>
        {copy.cta && (
          <button
            onClick={onClick}
            className="shrink-0 px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm shadow"
          >
            {copy.cta}
          </button>
        )}
      </div>
    </div>
  );
}
