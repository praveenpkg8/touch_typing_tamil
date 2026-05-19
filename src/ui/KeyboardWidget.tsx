/**
 * KeyboardWidget — renders the Tamil99 physical layout reading from keymap.json.
 * Highlights the last pressed key briefly (300ms) and tints by finger zone.
 *
 * Next-key prediction is intentionally deferred — it requires a "grapheme →
 * key sequence" lookup that walks the compositions table. Future iteration.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import keymap from '../typing-engine/composer/keymap.json' with { type: 'json' };

const ROWS: string[][] = [
  // Numbers row
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
  // Top alpha row
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
  // Home row
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
  // Bottom alpha row
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
];

const QWERTY_LABEL: Record<string, string> = {
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
  Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
  Minus: '-', Equal: '=',
  KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R', KeyT: 'T',
  KeyY: 'Y', KeyU: 'U', KeyI: 'I', KeyO: 'O', KeyP: 'P',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyF: 'F', KeyG: 'G',
  KeyH: 'H', KeyJ: 'J', KeyK: 'K', KeyL: 'L',
  Semicolon: ';', Quote: "'",
  KeyZ: 'Z', KeyX: 'X', KeyC: 'C', KeyV: 'V', KeyB: 'B',
  KeyN: 'N', KeyM: 'M', Comma: ',', Period: '.', Slash: '/',
};

const FINGER_ZONE: Record<string, string> = {
  Backquote: 'l-pinky', Digit1: 'l-pinky', KeyQ: 'l-pinky', KeyA: 'l-pinky', KeyZ: 'l-pinky',
  Digit2: 'l-ring', KeyW: 'l-ring', KeyS: 'l-ring', KeyX: 'l-ring',
  Digit3: 'l-mid', KeyE: 'l-mid', KeyD: 'l-mid', KeyC: 'l-mid',
  Digit4: 'l-index', Digit5: 'l-index', KeyR: 'l-index', KeyT: 'l-index',
  KeyF: 'l-index', KeyG: 'l-index', KeyV: 'l-index', KeyB: 'l-index',
  Digit6: 'r-index', Digit7: 'r-index', KeyY: 'r-index', KeyU: 'r-index',
  KeyH: 'r-index', KeyJ: 'r-index', KeyN: 'r-index', KeyM: 'r-index',
  Digit8: 'r-mid', KeyI: 'r-mid', KeyK: 'r-mid', Comma: 'r-mid',
  Digit9: 'r-ring', KeyO: 'r-ring', KeyL: 'r-ring', Period: 'r-ring',
  Digit0: 'r-pinky', KeyP: 'r-pinky', BracketLeft: 'r-pinky', BracketRight: 'r-pinky',
  Backslash: 'r-pinky', Semicolon: 'r-pinky', Quote: 'r-pinky', Slash: 'r-pinky',
  Minus: 'r-pinky', Equal: 'r-pinky',
};

interface KeymapLayer {
  [code: string]: { output: string; kind: string };
}

interface KeyboardWidgetProps {
  lastPressedCode: string | null;
  lastWasCorrect: boolean | null;
  /** Bump this number to retrigger the flash even on repeated presses of the same key. */
  pressTick: number;
  /** The key the user should press next. Highlighted with a persistent amber ring. */
  nextKey: { code: string; shift: boolean; altGr: boolean } | null;
}

function getUnshifted(code: string): string | null {
  const entry = (keymap.unshifted as KeymapLayer)[code];
  return entry?.output ?? null;
}

function getShifted(code: string): string | null {
  const entry = (keymap.shifted as KeymapLayer)[code];
  return entry?.output ?? null;
}

function getAltGr(code: string): string | null {
  const entry = (keymap.altgr as KeymapLayer)[code];
  return entry?.output ?? null;
}

export function KeyboardWidget({ lastPressedCode, lastWasCorrect, pressTick, nextKey }: KeyboardWidgetProps) {
  const [flashCode, setFlashCode] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    if (lastPressedCode === null) return;
    setFlashCode(lastPressedCode);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashCode(null), 300);
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, [lastPressedCode, pressTick]);

  const rows = useMemo(() => ROWS, []);
  const nextCode = nextKey?.code ?? null;
  const nextShift = nextKey?.shift ?? false;
  const nextAltGr = nextKey?.altGr ?? false;

  return (
    <div className="flex flex-col items-center gap-1.5 p-4 rounded-xl bg-slate-100 shadow-inner">
      {rows.map((row, rowIdx) => (
        <div
          key={rowIdx}
          className="flex gap-1.5"
          style={{ marginLeft: `${rowIdx * 0.5}rem` }}
        >
          {row.map(code => (
            <KeyCap
              key={code}
              code={code}
              isFlashing={flashCode === code}
              flashCorrect={flashCode === code ? lastWasCorrect : null}
              isNextKey={code === nextCode}
              nextKeyShift={code === nextCode ? nextShift : false}
              nextKeyAltGr={code === nextCode ? nextAltGr : false}
            />
          ))}
        </div>
      ))}
      {/* Spacebar row */}
      <div className="flex gap-1.5 mt-1">
        <div
          className={[
            'key-base',
            'key-finger-l-index',
            'transition-all',
            flashCode === 'Space'
              ? lastWasCorrect === false
                ? 'ring-2 ring-rose-400 bg-rose-100'
                : 'ring-2 ring-emerald-400 bg-emerald-100'
              : nextCode === 'Space'
                ? 'ring-2 ring-amber-400 bg-amber-50 animate-pulse'
                : '',
          ].join(' ')}
          style={{ width: '20rem' }}
        >
          <span className="text-[10px] text-slate-500">Space</span>
        </div>
      </div>
    </div>
  );
}

function KeyCap({
  code,
  isFlashing,
  flashCorrect,
  isNextKey,
  nextKeyShift,
  nextKeyAltGr,
}: {
  code: string;
  isFlashing: boolean;
  flashCorrect: boolean | null;
  isNextKey: boolean;
  nextKeyShift: boolean;
  nextKeyAltGr: boolean;
}) {
  const tamilUnshifted = getUnshifted(code);
  const tamilShifted = getShifted(code);
  const tamilAltGr = getAltGr(code);
  const label = QWERTY_LABEL[code] ?? '';
  const zone = FINGER_ZONE[code] ?? 'r-pinky';

  // Flash (post-press feedback) wins over next-key hint visually.
  const flashClasses = isFlashing
    ? flashCorrect === false
      ? 'ring-2 ring-rose-400 bg-rose-100'
      : 'ring-2 ring-emerald-400 bg-emerald-100'
    : isNextKey
      ? 'ring-2 ring-amber-400 bg-amber-50 animate-pulse'
      : '';

  return (
    <div
      className={`key-base key-finger-${zone} transition-all ${flashClasses}`}
      data-code={code}
    >
      <span className="absolute top-0.5 left-1 text-[9px] text-slate-400">{label}</span>
      {tamilShifted && (
        <span className="absolute top-0.5 right-1 text-[10px] text-slate-500 font-tamil leading-none">
          {tamilShifted.length <= 1 ? tamilShifted : tamilShifted[0]}
        </span>
      )}
      <span className="key-tamil text-slate-800 mt-2">
        {tamilUnshifted ?? <span className="text-slate-300">·</span>}
      </span>
      {tamilAltGr && (
        <span className="absolute bottom-0.5 right-1 text-[8px] text-amber-600 font-tamil leading-none">
          {tamilAltGr}
        </span>
      )}
      {isNextKey && (nextKeyShift || nextKeyAltGr) && (
        <span className="absolute -top-2 -right-2 text-[8px] text-amber-800 bg-amber-200 rounded-full px-1.5 py-0.5 font-semibold shadow-sm">
          {nextKeyShift && nextKeyAltGr ? '⇧+AltGr' : nextKeyShift ? '⇧' : 'AltGr'}
        </span>
      )}
    </div>
  );
}
