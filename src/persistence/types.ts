/**
 * Persistence record types — see docs/design-freeze.md §4.
 * Every record has: id (UUIDv7), schemaVersion, userId, deviceId, createdAt.
 */

import type { MistakeKind } from '../typing-engine/validator/types.ts';

export const CURRENT_SCHEMA_VERSION = 1;
export const DEFAULT_USER_ID = 'local-default';

export interface UserProfile {
  id: string;
  schemaVersion: 1;
  userId: string;
  deviceId: string;
  createdAt: string;
  displayName: string | null;
  lastPracticedAt: string | null;
  syncEnabled: false;
  preferences: {
    theme: 'light' | 'dark' | 'system';
    soundFeedback: boolean;
    realtimeErrorHighlight: boolean;
  };
}

export interface Session {
  id: string;
  schemaVersion: 1;
  userId: string;
  deviceId: string;
  createdAt: string;
  practiceMode: 'character' | 'word' | 'sentence' | 'custom';
  lessonId: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  targetText: string;
  targetGraphemeCount: number;
  typedGraphemeCount: number;
  correctGraphemes: number;
  incorrectGraphemes: number;
  totalKeystrokes: number;
  correctKeystrokes: number;
  graphemesPerMinute: number;
  keystrokesPerMinute: number;
  accuracyGraphemes: number;
  accuracyKeystrokes: number;
}

export interface KeystrokeEvent {
  id: string;
  schemaVersion: 1;
  sessionId: string;
  userId: string;
  sequenceNumber: number;
  ts: number;
  code: string;
  shift: boolean;
  altGr: boolean;
  tamil99Char: string | null;
  composedOp: string;
  composedBefore: string | null;
  composedAfter: string;
  cursorPosCodepoints: number;
  cursorPosGraphemes: number;
  wasCorrect: boolean;
  mistakeKind: MistakeKind | null;
  expectedGrapheme: string | null;
  typedGrapheme: string | null;
}

export interface Mistake {
  id: string;
  schemaVersion: 1;
  sessionId: string;
  userId: string;
  createdAt: string;
  kind: MistakeKind;
  expectedGrapheme: string;
  typedGrapheme: string;
  expectedCode: string;
  typedCode: string;
  cursorPosGraphemes: number;
  keystrokeEventIds: string[];
}

export interface LessonAttempt {
  id: string;
  schemaVersion: 1;
  userId: string;
  lessonId: string;
  sessionId: string;
  createdAt: string;
  status: 'completed' | 'abandoned';
  achievedAccuracyGraphemes: number;
  achievedGPM: number;
  metCompletionCriteria: boolean;
}
