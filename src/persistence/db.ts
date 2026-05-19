/**
 * Dexie database — versioned schema for v1.
 * See docs/design-freeze.md §4 + §11 (UUIDv7, deviceId, schema versioning).
 */

import Dexie, { type Table } from 'dexie';
import { uuidv7 } from 'uuidv7';
import type {
  KeystrokeEvent,
  LessonAttempt,
  Mistake,
  Session,
  UserProfile,
} from './types.ts';
import { CURRENT_SCHEMA_VERSION, DEFAULT_USER_ID } from './types.ts';

const DEVICE_ID_KEY = 'tamil99.deviceId';

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = uuidv7();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export class Tamil99DB extends Dexie {
  userProfiles!: Table<UserProfile, string>;
  sessions!: Table<Session, string>;
  keystrokeEvents!: Table<KeystrokeEvent, string>;
  mistakes!: Table<Mistake, string>;
  lessonAttempts!: Table<LessonAttempt, string>;

  constructor() {
    super('tamil99');

    // v1 — initial schema.
    // Index format: 'primaryKey,index1,index2,[compound1+compound2]'
    this.version(1).stores({
      userProfiles: 'id, userId, lastPracticedAt',
      sessions: 'id, userId, createdAt, lessonId, [userId+createdAt]',
      keystrokeEvents:
        'id, sessionId, userId, [sessionId+sequenceNumber], wasCorrect, mistakeKind',
      mistakes: 'id, sessionId, userId, kind, expectedGrapheme, [userId+kind]',
      lessonAttempts:
        'id, userId, lessonId, sessionId, [userId+lessonId], [lessonId+createdAt]',
    });

    // Future migrations go here:
    // this.version(2).stores({...}).upgrade(tx => {...});
  }
}

export const db = new Tamil99DB();

// ─────────────────────────────────────────────────────────────────────────
// Profile bootstrap
// ─────────────────────────────────────────────────────────────────────────

/**
 * Get the local user's profile, creating it on first run.
 * MVP is single-profile per device; the schema is multi-profile-ready.
 */
export async function ensureUserProfile(): Promise<UserProfile> {
  const deviceId = getOrCreateDeviceId();
  const existing = await db.userProfiles.where('userId').equals(DEFAULT_USER_ID).first();
  if (existing) return existing;

  const now = new Date().toISOString();
  const profile: UserProfile = {
    id: uuidv7(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    userId: DEFAULT_USER_ID,
    deviceId,
    createdAt: now,
    displayName: null,
    lastPracticedAt: null,
    syncEnabled: false,
    preferences: {
      theme: 'system',
      soundFeedback: false,
      realtimeErrorHighlight: true,
    },
  };
  await db.userProfiles.put(profile);
  return profile;
}

// ─────────────────────────────────────────────────────────────────────────
// Write paths
// ─────────────────────────────────────────────────────────────────────────

export async function persistSession(args: {
  session: Session;
  keystrokeEvents: KeystrokeEvent[];
  mistakes: Mistake[];
  lessonAttempt: LessonAttempt | null;
}): Promise<void> {
  await db.transaction(
    'rw',
    [db.sessions, db.keystrokeEvents, db.mistakes, db.lessonAttempts, db.userProfiles],
    async () => {
      await db.sessions.put(args.session);
      if (args.keystrokeEvents.length > 0) {
        await db.keystrokeEvents.bulkPut(args.keystrokeEvents);
      }
      if (args.mistakes.length > 0) {
        await db.mistakes.bulkPut(args.mistakes);
      }
      if (args.lessonAttempt) {
        await db.lessonAttempts.put(args.lessonAttempt);
      }
      // Update profile lastPracticedAt
      const profile = await db.userProfiles
        .where('userId')
        .equals(args.session.userId)
        .first();
      if (profile) {
        profile.lastPracticedAt = args.session.endedAt;
        await db.userProfiles.put(profile);
      }
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Read paths
// ─────────────────────────────────────────────────────────────────────────

export async function listRecentSessions(
  userId: string,
  limit: number = 20,
): Promise<Session[]> {
  return db.sessions
    .where('userId')
    .equals(userId)
    .reverse()
    .sortBy('createdAt')
    .then(s => s.slice(0, limit));
}

export async function listLessonAttempts(
  userId: string,
  lessonId: string,
): Promise<LessonAttempt[]> {
  return db.lessonAttempts.where('[userId+lessonId]').equals([userId, lessonId]).toArray();
}

// ─────────────────────────────────────────────────────────────────────────
// Reset / Export / Import
// ─────────────────────────────────────────────────────────────────────────

/**
 * Delete all sessions / keystrokes / mistakes / attempts for the given user.
 * Preserves UserProfile (and its preferences).
 */
export async function resetAllProgress(userId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.sessions, db.keystrokeEvents, db.mistakes, db.lessonAttempts],
    async () => {
      await db.sessions.where('userId').equals(userId).delete();
      await db.keystrokeEvents.where('userId').equals(userId).delete();
      await db.mistakes.where('userId').equals(userId).delete();
      await db.lessonAttempts.where('userId').equals(userId).delete();
    },
  );
}

export interface ExportPayload {
  schemaVersion: 1;
  format: 'tamil99-typing-tutor';
  exportedAt: string;
  userId: string;
  profile: UserProfile | null;
  sessions: Session[];
  keystrokeEvents: KeystrokeEvent[];
  mistakes: Mistake[];
  lessonAttempts: LessonAttempt[];
}

export async function exportAllData(userId: string): Promise<ExportPayload> {
  const profile = (await db.userProfiles.where('userId').equals(userId).first()) ?? null;
  const sessions = await db.sessions.where('userId').equals(userId).toArray();
  const keystrokeEvents = await db.keystrokeEvents.where('userId').equals(userId).toArray();
  const mistakes = await db.mistakes.where('userId').equals(userId).toArray();
  const lessonAttempts = await db.lessonAttempts.where('userId').equals(userId).toArray();
  return {
    schemaVersion: 1,
    format: 'tamil99-typing-tutor',
    exportedAt: new Date().toISOString(),
    userId,
    profile,
    sessions,
    keystrokeEvents,
    mistakes,
    lessonAttempts,
  };
}

export interface ImportResult {
  ok: true;
  imported: {
    sessions: number;
    keystrokeEvents: number;
    mistakes: number;
    lessonAttempts: number;
  };
}

export interface ImportError {
  ok: false;
  reason: string;
}

/**
 * Replace the local data with the payload. Existing data for the same userId
 * is wiped first (with confirmation handled by the UI). Profile preferences
 * from the import overwrite local ones.
 */
export async function importAllData(
  payload: unknown,
): Promise<ImportResult | ImportError> {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, reason: 'Import file is not a valid JSON object.' };
  }
  const p = payload as Record<string, unknown>;
  if (p.format !== 'tamil99-typing-tutor') {
    return { ok: false, reason: 'File is not a Tamil99 typing tutor export.' };
  }
  if (p.schemaVersion !== 1) {
    return {
      ok: false,
      reason: `Unsupported schemaVersion ${String(p.schemaVersion)}. Expected 1.`,
    };
  }
  if (typeof p.userId !== 'string') {
    return { ok: false, reason: 'userId missing or not a string.' };
  }
  const userId = p.userId;
  const sessions = Array.isArray(p.sessions) ? (p.sessions as Session[]) : [];
  const keystrokeEvents = Array.isArray(p.keystrokeEvents)
    ? (p.keystrokeEvents as KeystrokeEvent[])
    : [];
  const mistakes = Array.isArray(p.mistakes) ? (p.mistakes as Mistake[]) : [];
  const lessonAttempts = Array.isArray(p.lessonAttempts)
    ? (p.lessonAttempts as LessonAttempt[])
    : [];
  const profile = (p.profile as UserProfile | null) ?? null;

  await db.transaction(
    'rw',
    [
      db.userProfiles,
      db.sessions,
      db.keystrokeEvents,
      db.mistakes,
      db.lessonAttempts,
    ],
    async () => {
      // Wipe existing data for this userId, then bulk-import.
      await db.sessions.where('userId').equals(userId).delete();
      await db.keystrokeEvents.where('userId').equals(userId).delete();
      await db.mistakes.where('userId').equals(userId).delete();
      await db.lessonAttempts.where('userId').equals(userId).delete();

      if (profile) {
        await db.userProfiles.put({ ...profile, userId });
      }
      if (sessions.length > 0) await db.sessions.bulkPut(sessions);
      if (keystrokeEvents.length > 0) await db.keystrokeEvents.bulkPut(keystrokeEvents);
      if (mistakes.length > 0) await db.mistakes.bulkPut(mistakes);
      if (lessonAttempts.length > 0) await db.lessonAttempts.bulkPut(lessonAttempts);
    },
  );

  return {
    ok: true,
    imported: {
      sessions: sessions.length,
      keystrokeEvents: keystrokeEvents.length,
      mistakes: mistakes.length,
      lessonAttempts: lessonAttempts.length,
    },
  };
}

export async function getMistakeAggregates(
  userId: string,
  sinceIso?: string,
): Promise<Array<{ kind: string; expectedGrapheme: string; count: number }>> {
  const all = sinceIso
    ? await db.mistakes
        .where('userId')
        .equals(userId)
        .filter(m => m.createdAt >= sinceIso)
        .toArray()
    : await db.mistakes.where('userId').equals(userId).toArray();

  const buckets = new Map<string, { kind: string; expectedGrapheme: string; count: number }>();
  for (const m of all) {
    const key = `${m.kind}::${m.expectedGrapheme}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.count++;
    else buckets.set(key, { kind: m.kind, expectedGrapheme: m.expectedGrapheme, count: 1 });
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count);
}
