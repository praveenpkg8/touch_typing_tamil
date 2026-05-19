/**
 * TargetText — renders the lesson drill target with per-grapheme status:
 *   - typed correctly (green)
 *   - current target (underlined cursor)
 *   - upcoming (gray)
 *   - mistake at current position (red highlight)
 */

import { useMemo } from 'react';
import { segmentGraphemes } from '../typing-engine/segmenter/index.ts';

interface TargetTextProps {
  targetText: string;
  typedText: string;
  cursorGraphemes: number;
  hasMistake: boolean;
}

export function TargetText({ targetText, typedText, cursorGraphemes, hasMistake }: TargetTextProps) {
  const targetGraphemes = useMemo(() => segmentGraphemes(targetText), [targetText]);
  const typedGraphemes = useMemo(() => segmentGraphemes(typedText), [typedText]);

  return (
    <div className="font-tamil text-3xl leading-relaxed tracking-wide px-6 py-5 bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex flex-wrap gap-y-2">
        {targetGraphemes.map((g, i) => {
          const isTyped = i < cursorGraphemes;
          const isCurrent = i === cursorGraphemes;
          const isInProgress = isCurrent && typedGraphemes.length > cursorGraphemes;
          const inProgressGrapheme = isInProgress ? typedGraphemes[cursorGraphemes] : null;
          const showSpace = g === ' ';

          let cls = 'text-slate-300';
          if (isTyped) cls = 'text-emerald-600';
          else if (isCurrent) {
            if (hasMistake) cls = 'text-rose-600 bg-rose-100 rounded';
            else cls = 'text-slate-900 border-b-2 border-amber-500';
          }

          return (
            <span key={i} className={`inline-block ${cls} px-0.5`}>
              {showSpace ? '·' : (isInProgress ? inProgressGrapheme : g)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
