export {
  db,
  Tamil99DB,
  ensureUserProfile,
  getOrCreateDeviceId,
  persistSession,
  listRecentSessions,
  listLessonAttempts,
  getMistakeAggregates,
  resetAllProgress,
  exportAllData,
  importAllData,
} from './db.ts';
export type { ExportPayload, ImportResult, ImportError } from './db.ts';
export {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_USER_ID,
} from './types.ts';
export type {
  UserProfile,
  Session,
  KeystrokeEvent,
  Mistake,
  LessonAttempt,
} from './types.ts';
