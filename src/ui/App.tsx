/**
 * App shell — view router. Bootstraps the user profile on first mount.
 */

import { useEffect, useState } from 'react';
import { LessonSelect } from './LessonSelect.tsx';
import { LessonRunner } from './LessonRunner.tsx';
import { CustomPracticeSetup } from './CustomPracticeSetup.tsx';
import { CustomRunner } from './CustomRunner.tsx';
import { SessionReport } from './SessionReport.tsx';
import { Dashboard } from './Dashboard.tsx';
import { Settings } from './Settings.tsx';
import { ensureUserProfile } from '../persistence/index.ts';
import { useTypingEngine } from '../state/typingEngineStore.ts';
import {
  generateTargetedDrill,
} from '../recommendation/index.ts';
import type { Lesson } from '../content/lessons/index.ts';

type View =
  | { kind: 'select' }
  | { kind: 'run'; lesson: Lesson }
  | { kind: 'custom-setup' }
  | { kind: 'custom-run'; text: string }
  | { kind: 'targeted-run'; text: string; weakGraphemes: string[] }
  | { kind: 'dashboard' }
  | { kind: 'settings' }
  | { kind: 'report' };

export function App() {
  const [view, setView] = useState<View>({ kind: 'select' });
  const [ready, setReady] = useState(false);
  const lastSummary = useTypingEngine(s => s.lastSummary);
  const resetSummary = useTypingEngine(s => s.resetSummary);

  useEffect(() => {
    ensureUserProfile()
      .then(() => setReady(true))
      .catch(err => {
        console.error('Failed to initialize user profile', err);
        setReady(true);
      });
  }, []);

  const startTargetedDrill = (weakGraphemes: string[]) => {
    const drill = generateTargetedDrill({ weakGraphemes });
    if (drill.target === '') return;
    setView({ kind: 'targeted-run', text: drill.target, weakGraphemes: drill.graphemes });
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (view.kind === 'run') {
    return (
      <LessonRunner
        lesson={view.lesson}
        onComplete={() => setView({ kind: 'report' })}
        onExit={() => setView({ kind: 'report' })}
      />
    );
  }

  if (view.kind === 'custom-setup') {
    return (
      <CustomPracticeSetup
        onStart={text => setView({ kind: 'custom-run', text })}
        onCancel={() => setView({ kind: 'select' })}
      />
    );
  }

  if (view.kind === 'custom-run') {
    return (
      <CustomRunner
        text={view.text}
        onComplete={() => setView({ kind: 'report' })}
        onExit={() => setView({ kind: 'report' })}
      />
    );
  }

  if (view.kind === 'targeted-run') {
    return (
      <CustomRunner
        text={view.text}
        title="Targeted drill"
        subtitle={`Focus: ${view.weakGraphemes.join(' ')}`}
        onComplete={() => setView({ kind: 'report' })}
        onExit={() => setView({ kind: 'report' })}
      />
    );
  }

  if (view.kind === 'dashboard') {
    return (
      <Dashboard
        onBack={() => setView({ kind: 'select' })}
        onStartLesson={lesson => setView({ kind: 'run', lesson })}
      />
    );
  }

  if (view.kind === 'settings') {
    return <Settings onBack={() => setView({ kind: 'select' })} />;
  }

  if (view.kind === 'report' && lastSummary) {
    return (
      <SessionReport
        summary={lastSummary}
        onContinue={() => {
          resetSummary();
          setView({ kind: 'select' });
        }}
        onActionLesson={lesson => {
          resetSummary();
          setView({ kind: 'run', lesson });
        }}
        onActionTargetedDrill={graphemes => {
          resetSummary();
          startTargetedDrill(graphemes);
        }}
      />
    );
  }

  return (
    <LessonSelect
      onStart={lesson => setView({ kind: 'run', lesson })}
      onStartCustom={() => setView({ kind: 'custom-setup' })}
      onStartTargetedDrill={startTargetedDrill}
      onOpenDashboard={() => setView({ kind: 'dashboard' })}
      onOpenSettings={() => setView({ kind: 'settings' })}
    />
  );
}
