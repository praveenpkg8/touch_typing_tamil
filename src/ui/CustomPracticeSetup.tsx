/**
 * CustomPracticeSetup — paste any Tamil text and start a practice session.
 * Light validation: non-empty, length cap, warn on text containing chars
 * unreachable on the Tamil99 layout.
 */

import { useMemo, useState } from 'react';
import keymap from '../typing-engine/composer/keymap.json' with { type: 'json' };

const MAX_LENGTH = 2000;

const REACHABLE_CHARS: Set<string> = (() => {
  const set = new Set<string>();
  set.add(' ');
  const collect = (layer: Record<string, { output: string }>) => {
    for (const entry of Object.values(layer)) {
      for (const ch of entry.output) set.add(ch);
    }
  };
  collect(keymap.unshifted);
  collect(keymap.shifted);
  collect(keymap.altgr);
  collect(keymap.altgrShift);
  // Also reachable via compositions (vowel signs etc. produced as part of mei+uyir)
  // Composition outputs are emitted character-by-character from the atomic layers
  // so they're already covered.
  return set;
})();

interface CustomPracticeSetupProps {
  onStart: (text: string) => void;
  onCancel: () => void;
}

const SAMPLE_PROMPTS: Array<{ label: string; text: string }> = [
  { label: 'Short greeting', text: 'வணக்கம் உலகம்' },
  { label: 'Pangram-ish', text: 'நாய் வேகமாக ஓடுகிறது' },
  { label: 'Simple sentence', text: 'நான் தமிழ் பேசுகிறேன்' },
];

export function CustomPracticeSetup({ onStart, onCancel }: CustomPracticeSetupProps) {
  const [text, setText] = useState('');

  const trimmed = text.trim();
  const tooLong = text.length > MAX_LENGTH;
  const isEmpty = trimmed.length === 0;

  const unreachable = useMemo(() => {
    if (isEmpty) return [];
    const found = new Set<string>();
    for (const ch of trimmed) {
      // Allow zero-width joiners (ZWJ/ZWNJ) — they appear in valid composed text.
      if (ch === '‌' || ch === '‍' || ch === '\n' || ch === '\r' || ch === '\t') continue;
      if (!REACHABLE_CHARS.has(ch)) found.add(ch);
    }
    return [...found];
  }, [trimmed, isEmpty]);

  const canStart = !isEmpty && !tooLong;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Custom practice</h1>
        <p className="text-slate-600">
          Paste any Tamil text below. Your typing is validated against it using the same Tamil99
          rules as the curated lessons.
        </p>
      </header>

      <div className="space-y-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste or type Tamil text here…"
          className="w-full h-48 px-4 py-3 rounded-lg border border-slate-300 font-tamil text-xl leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white shadow-sm"
        />
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{text.length} / {MAX_LENGTH} chars</span>
          {tooLong && <span className="text-rose-600">Too long — trim to {MAX_LENGTH} chars.</span>}
        </div>
      </div>

      {unreachable.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-sm text-amber-900">
          <div className="font-medium mb-1">Heads up — these characters aren't on the Tamil99 layout:</div>
          <div className="font-tamil text-lg">{unreachable.join(' ')}</div>
          <div className="text-xs mt-1 text-amber-700">
            You can still practice this text, but the keyboard widget won't be able to predict the
            next key when one of these is expected. Consider removing them.
          </div>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Try a sample</div>
        <div className="flex gap-2 flex-wrap">
          {SAMPLE_PROMPTS.map(p => (
            <button
              key={p.label}
              onClick={() => setText(p.text)}
              className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100"
            >
              {p.label} <span className="font-tamil ml-1 text-slate-700">{p.text.slice(0, 18)}{p.text.length > 18 ? '…' : ''}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => onStart(trimmed)}
          disabled={!canStart}
          className="px-5 py-2 rounded-md bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium shadow text-sm"
        >
          Start practice
        </button>
      </div>
    </div>
  );
}
