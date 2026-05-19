/**
 * Settings — preferences toggles plus destructive actions (reset / export / import).
 * All changes persist via Dexie. Confirms before reset / import (both are destructive).
 */

import { useRef, useState } from 'react';
import {
  DEFAULT_USER_ID,
  exportAllData,
  importAllData,
  resetAllProgress,
} from '../persistence/index.ts';
import {
  usePreferences,
  updatePreferences,
  type Preferences,
} from '../state/preferencesStore.ts';
import { playClick } from '../audio/soundFeedback.ts';

interface SettingsProps {
  onBack: () => void;
}

type Banner =
  | { kind: 'ok'; text: string }
  | { kind: 'err'; text: string }
  | null;

export function Settings({ onBack }: SettingsProps) {
  const preferences = usePreferences();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const onToggle = async (key: keyof Preferences, value: Preferences[keyof Preferences]) => {
    await updatePreferences({ [key]: value });
    // If toggling soundFeedback on, play a sample so the user hears it.
    if (key === 'soundFeedback' && value === true) {
      // Defer so the AudioContext init runs inside the click gesture.
      setTimeout(() => playClick(true), 0);
    }
  };

  const onExport = async () => {
    try {
      const payload = await exportAllData(DEFAULT_USER_ID);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tamil99-typing-tutor-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBanner({
        kind: 'ok',
        text: `Exported ${payload.sessions.length} sessions and ${payload.mistakes.length} mistakes.`,
      });
    } catch (err) {
      setBanner({ kind: 'err', text: `Export failed: ${String(err)}` });
    }
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = await importAllData(parsed);
      if (result.ok) {
        setBanner({
          kind: 'ok',
          text: `Imported ${result.imported.sessions} sessions, ${result.imported.mistakes} mistakes, ${result.imported.lessonAttempts} attempts.`,
        });
      } else {
        setBanner({ kind: 'err', text: result.reason });
      }
    } catch (err) {
      setBanner({ kind: 'err', text: `Import failed: ${String(err)}` });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onReset = async () => {
    try {
      await resetAllProgress(DEFAULT_USER_ID);
      setConfirmingReset(false);
      setBanner({ kind: 'ok', text: 'All progress cleared.' });
    } catch (err) {
      setBanner({ kind: 'err', text: `Reset failed: ${String(err)}` });
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
      <header className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500">Local-only — no data leaves your device.</p>
        </div>
        <button
          onClick={onBack}
          className="text-sm px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100"
        >
          ← Back
        </button>
      </header>

      {banner && (
        <div
          className={`text-sm px-4 py-2 rounded-md border ${
            banner.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {banner.text}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Preferences
        </h2>
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
          <ToggleRow
            label="Sound feedback"
            description="Brief click on each keystroke (different tone for mistakes)."
            checked={preferences.soundFeedback}
            onChange={v => onToggle('soundFeedback', v)}
          />
          <ToggleRow
            label="Real-time error highlight"
            description="Show a red highlight on incorrect keystrokes as you type."
            checked={preferences.realtimeErrorHighlight}
            onChange={v => onToggle('realtimeErrorHighlight', v)}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Data
        </h2>
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
          <ActionRow
            label="Export progress"
            description="Download your sessions, mistakes, and lesson attempts as JSON."
            actionLabel="Export"
            onClick={onExport}
          />
          <ActionRow
            label="Import progress"
            description="Restore from a previous export. Replaces current local data for this user."
            actionLabel="Choose file…"
            onClick={() => fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
            }}
          />
          {confirmingReset ? (
            <div className="px-4 py-3 space-y-2">
              <div className="text-sm text-rose-700">
                This deletes every session, mistake, and lesson attempt on this device.
                Your preferences are kept. This cannot be undone.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onReset}
                  className="text-sm px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-medium"
                >
                  Yes, delete everything
                </button>
                <button
                  onClick={() => setConfirmingReset(false)}
                  className="text-sm px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <ActionRow
              label="Reset progress"
              description="Delete all sessions, mistakes, and lesson attempts."
              actionLabel="Reset…"
              destructive
              onClick={() => setConfirmingReset(true)}
            />
          )}
        </div>
      </section>

      <section className="text-xs text-slate-500 leading-relaxed">
        <p>
          The application stores all data in your browser&apos;s IndexedDB. Clearing site data in
          your browser settings or browsing in private mode will wipe your progress. Use Export
          regularly if you want a backup.
        </p>
      </section>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <div className="space-y-0.5 min-w-0">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${
          checked ? 'bg-amber-500' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function ActionRow({
  label,
  description,
  actionLabel,
  onClick,
  destructive,
}: {
  label: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <div className="space-y-0.5 min-w-0">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      <button
        onClick={onClick}
        className={`shrink-0 text-sm px-3 py-1.5 rounded-md border font-medium ${
          destructive
            ? 'border-rose-300 bg-white hover:bg-rose-50 text-rose-700'
            : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
        }`}
      >
        {actionLabel}
      </button>
    </div>
  );
}
