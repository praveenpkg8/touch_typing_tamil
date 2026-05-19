/**
 * Preferences — typed read/write over UserProfile.preferences in Dexie.
 *
 * The fields exist in the schema (design-freeze §4.1); this module exposes
 * them as a usePreferences() hook + an updatePreferences() async writer.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_USER_ID } from '../persistence/index.ts';

export interface Preferences {
  theme: 'light' | 'dark' | 'system';
  soundFeedback: boolean;
  realtimeErrorHighlight: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  soundFeedback: false,
  realtimeErrorHighlight: true,
};

/**
 * Reactive read. Returns DEFAULT_PREFERENCES until the profile loads.
 * After load, returns the saved preferences.
 */
export function usePreferences(): Preferences {
  const profile = useLiveQuery(
    () => db.userProfiles.where('userId').equals(DEFAULT_USER_ID).first(),
    [],
    undefined,
  );
  return profile?.preferences ?? DEFAULT_PREFERENCES;
}

export async function updatePreferences(patch: Partial<Preferences>): Promise<void> {
  const profile = await db.userProfiles
    .where('userId')
    .equals(DEFAULT_USER_ID)
    .first();
  if (!profile) return;
  profile.preferences = { ...profile.preferences, ...patch };
  await db.userProfiles.put(profile);
}
