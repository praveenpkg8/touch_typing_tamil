/**
 * LiveHUD — live metrics shown above the keyboard during a drill.
 */

interface LiveHUDProps {
  graphemesPerMinute: number;
  keystrokesPerMinute: number;
  accuracyKeystrokes: number;
  totalKeystrokes: number;
  cursorGraphemes: number;
  targetGraphemeCount: number;
}

export function LiveHUD({
  graphemesPerMinute,
  keystrokesPerMinute,
  accuracyKeystrokes,
  totalKeystrokes,
  cursorGraphemes,
  targetGraphemeCount,
}: LiveHUDProps) {
  return (
    <div className="grid grid-cols-4 gap-3 text-center">
      <Stat label="GPM" value={Math.round(graphemesPerMinute).toString()} hint="graphemes / min" />
      <Stat label="KPM" value={Math.round(keystrokesPerMinute).toString()} hint="keystrokes / min" />
      <Stat label="Accuracy" value={`${accuracyKeystrokes}%`} hint={`${totalKeystrokes} keystrokes`} />
      <Stat
        label="Progress"
        value={`${cursorGraphemes}/${targetGraphemeCount}`}
        hint="graphemes done"
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg py-2 px-3 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 leading-tight tabular-nums">{value}</div>
      <div className="text-[10px] text-slate-400">{hint}</div>
    </div>
  );
}
