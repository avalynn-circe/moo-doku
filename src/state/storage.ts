import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Named } from '../game/game';

/** Saved progress. AsyncStorage is native, so adding it needed a dev client. */
const KEY = 'moodoku.v1';

export interface Progress {
  level: number;
  sound: boolean;
  seen: boolean;
  boards: Record<number, number[]>;             // level index -> cell states
  named: Record<number, Named>;                 // level index -> square -> animal
  done: number[];
}

export const emptyProgress = (): Progress => ({
  level: 0, sound: false, seen: false, boards: {}, named: {}, done: [],
});

export async function load(): Promise<Progress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return emptyProgress();
    return { ...emptyProgress(), ...(JSON.parse(raw) as Partial<Progress>) };
  } catch {
    return emptyProgress();
  }
}

export async function save(p: Progress): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}
