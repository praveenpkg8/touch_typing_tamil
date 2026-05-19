/**
 * CustomRunner — runs a custom-text practice session.
 * Mirrors LessonRunner but without drill progression (single target).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTypingEngine } from '../state/typingEngineStore.ts';
import { usePreferences } from '../state/preferencesStore.ts';
import { playClick } from '../audio/soundFeedback.ts';
import { TargetText } from './TargetText.tsx';
import { LiveHUD } from './LiveHUD.tsx';
import { KeyboardWidget } from './KeyboardWidget.tsx';

interface CustomRunnerProps {
  text: string;
  title?: string;
  subtitle?: string;
  onComplete: () => void;
  onExit: () => void;
}

export function CustomRunner({
  text,
  title = 'Custom practice',
  subtitle,
  onComplete,
  onExit,
}: CustomRunnerProps) {
  const snapshot = useTypingEngine(s => s.snapshot);
  const startCustomPractice = useTypingEngine(s => s.startCustomPractice);
  const handleKey = useTypingEngine(s => s.handleKey);
  const endSession = useTypingEngine(s => s.endSession);
  const preferences = usePreferences();

  const captureRef = useRef<HTMLDivElement | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [lastPressedCode, setLastPressedCode] = useState<string | null>(null);
  const [pressTick, setPressTick] = useState(0);

  useEffect(() => {
    startCustomPractice(text);
    setHasStarted(true);
    captureRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Tab') return;
      e.preventDefault();

      const isBackspace = e.code === 'Backspace';
      const altGr =
        e.getModifierState?.('AltGraph') === true ||
        (e.altKey && !e.ctrlKey && !e.metaKey);

      handleKey({
        code: e.code,
        shift: e.shiftKey,
        altGr,
        isBackspace,
      });
      if (preferences.soundFeedback && !isBackspace) {
        const fresh = useTypingEngine.getState().snapshot;
        playClick(fresh.lastWasCorrect === true);
      }
      setLastPressedCode(e.code);
      setPressTick(t => t + 1);
    },
    [handleKey, preferences.soundFeedback],
  );

  useEffect(() => {
    if (!snapshot.isDrillComplete) return;
    const t = window.setTimeout(() => {
      void endSession();
      onComplete();
    }, 800);
    return () => window.clearTimeout(t);
  }, [snapshot.isDrillComplete, endSession, onComplete]);

  if (!hasStarted) return null;

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">
            {subtitle ?? `${snapshot.targetGraphemes.length} graphemes`}
          </p>
        </div>
        <button
          onClick={async () => {
            await endSession();
            onExit();
          }}
          className="text-sm px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100"
        >
          End session
        </button>
      </header>

      <LiveHUD
        graphemesPerMinute={snapshot.graphemesPerMinute}
        keystrokesPerMinute={snapshot.keystrokesPerMinute}
        accuracyKeystrokes={snapshot.accuracyKeystrokes}
        totalKeystrokes={snapshot.totalKeystrokes}
        cursorGraphemes={snapshot.cursorGraphemes}
        targetGraphemeCount={snapshot.targetGraphemes.length}
      />

      <div
        ref={captureRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="outline-none focus:ring-2 focus:ring-amber-300 rounded-xl"
      >
        <TargetText
          targetText={snapshot.targetText}
          typedText={snapshot.composerString}
          cursorGraphemes={snapshot.cursorGraphemes}
          hasMistake={preferences.realtimeErrorHighlight && snapshot.lastWasCorrect === false}
        />
        <div className="text-center text-xs text-slate-500 mt-2">
          Typing — press keys, Backspace to undo
        </div>
      </div>

      <KeyboardWidget
        lastPressedCode={lastPressedCode}
        lastWasCorrect={snapshot.lastWasCorrect}
        pressTick={pressTick}
        nextKey={snapshot.nextKey}
      />

      {snapshot.isDrillComplete && (
        <div className="text-center text-emerald-700 font-medium">
          Practice complete — generating report…
        </div>
      )}
    </div>
  );
}
