/**
 * soundFeedback — lazy-init Web Audio click on each keystroke.
 *
 * Two tones, both ~50ms decay:
 *   correct  → 800 Hz (bright, low-volume positive)
 *   mistake  → 220 Hz (dull thud)
 *
 * Web Audio requires a user gesture before AudioContext.resume() can be
 * called. The first call to playClick() happens inside a keydown handler,
 * which counts as a gesture, so lazy initialization works on every modern
 * browser (Safari included).
 */

let audioCtx: AudioContext | null = null;
let warnedNoSupport = false;

function getCtx(): AudioContext | null {
  if (audioCtx !== null) return audioCtx;
  const W = typeof window !== 'undefined' ? (window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  }) : undefined;
  const Ctor = W?.AudioContext ?? W?.webkitAudioContext;
  if (!Ctor) {
    if (!warnedNoSupport) {
      console.warn('Web Audio not supported — sound feedback disabled');
      warnedNoSupport = true;
    }
    return null;
  }
  try {
    audioCtx = new Ctor();
  } catch {
    return null;
  }
  return audioCtx;
}

export function playClick(correct: boolean): void {
  const ctx = getCtx();
  if (!ctx) return;
  // Suspended contexts can be resumed inside a user gesture stack.
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = correct ? 'sine' : 'sawtooth';
  osc.frequency.value = correct ? 800 : 220;
  // Quick attack + exponential decay to ~silence at ~50ms.
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.07);
}
