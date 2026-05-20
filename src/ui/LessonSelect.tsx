/**
 * LessonSelect — landing screen listing available lessons with completion state.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { LESSONS, type Lesson } from '../content/lessons/index.ts';
import { db, DEFAULT_USER_ID } from '../persistence/index.ts';
import { useRecommendation } from '../recommendation/index.ts';
import { RecommendationCard } from './RecommendationCard.tsx';
import { MobileNotice } from './MobileNotice.tsx';

interface LessonSelectProps {
  onStart: (lesson: Lesson) => void;
  onStartCustom: () => void;
  onStartTargetedDrill: (weakGraphemes: string[]) => void;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
}

export function LessonSelect({
  onStart,
  onStartCustom,
  onStartTargetedDrill,
  onOpenDashboard,
  onOpenSettings,
}: LessonSelectProps) {
  const attempts = useLiveQuery(
    () => db.lessonAttempts.where('userId').equals(DEFAULT_USER_ID).toArray(),
    [],
    [],
  );

  const lastSession = useLiveQuery(
    () => db.sessions.where('userId').equals(DEFAULT_USER_ID).reverse().sortBy('createdAt').then(s => s[0]),
    [],
    undefined,
  );
  const recommendation = useRecommendation();

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <MobileNotice />
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-slate-900">
            <span className="font-tamil">தமிழ்99</span> Typing Tutor
          </h1>
          <p className="text-slate-600">
            Practice Tamil typing on the Tamil99 layout. All progress is stored on this device — no
            sign-in required.
          </p>
        </div>
        <div className="shrink-0 flex gap-2">
          <button
            onClick={onOpenDashboard}
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100"
          >
            Dashboard
          </button>
          <button
            onClick={onOpenSettings}
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100"
          >
            Settings
          </button>
        </div>
      </header>

      {recommendation && (
        <RecommendationCard
          recommendation={recommendation}
          onActionLesson={onStart}
          onActionTargetedDrill={onStartTargetedDrill}
          variant="highlight"
        />
      )}

      <section>
        <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-2">Lessons</h2>
        <ul className="space-y-2">
          {LESSONS.map(lesson => {
            const lessonAttempts = (attempts ?? []).filter(a => a.lessonId === lesson.id);
            const bestAccuracy = lessonAttempts.length > 0
              ? Math.max(...lessonAttempts.map(a => a.achievedAccuracyGraphemes))
              : null;
            const passed = lessonAttempts.some(a => a.metCompletionCriteria);

            return (
              <li
                key={lesson.id}
                className="bg-white border border-slate-200 rounded-lg p-4 flex items-center justify-between shadow-sm hover:shadow"
              >
                <div className="space-y-1">
                  <div className="flex items-baseline gap-3">
                    <span className="text-xs uppercase text-slate-400 tabular-nums">
                      L{lesson.level}
                    </span>
                    <span className="font-tamil text-lg text-slate-900">{lesson.title.ta}</span>
                    <span className="text-sm text-slate-500">{lesson.title.en}</span>
                  </div>
                  <div className="text-xs text-slate-500 space-x-3">
                    <span>
                      {lesson.drills.length} drill{lesson.drills.length === 1 ? '' : 's'}
                    </span>
                    <span>
                      target accuracy {lesson.completion.minAccuracyGraphemes}% / {lesson.completion.minGPM} gpm
                    </span>
                    {bestAccuracy !== null && (
                      <span className={passed ? 'text-emerald-600' : 'text-amber-600'}>
                        best {bestAccuracy}%
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onStart(lesson)}
                  className="px-4 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium shadow"
                >
                  {passed ? 'Practice again' : 'Start'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="border-t border-slate-200 pt-6">
        <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-2">Or practice your own text</h2>
        <button
          onClick={onStartCustom}
          className="w-full text-left bg-white border border-slate-200 rounded-lg p-4 hover:shadow"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-medium text-slate-900">Custom practice</div>
              <div className="text-xs text-slate-500">
                Paste any Tamil text — words, sentences, an article. Validated with Tamil99 rules.
              </div>
            </div>
            <span className="text-amber-500 text-2xl">→</span>
          </div>
        </button>
      </section>

      {lastSession && (
        <section className="text-sm text-slate-500">
          Last session: {new Date(lastSession.createdAt).toLocaleString()} — {lastSession.accuracyGraphemes}% accuracy,
          {' '}
          {lastSession.graphemesPerMinute} gpm
        </section>
      )}
    </div>
  );
}
