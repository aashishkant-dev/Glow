/**
 * Saved looks store — AsyncStorage-backed, with a tiny subscription layer so
 * hearts stay in sync across Home / Explore / Saved without prop drilling.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@glow/saved_looks';

let cache: string[] | null = null;
const subs = new Set<() => void>();

function notify() { subs.forEach(fn => fn()); }

async function load(): Promise<string[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export async function toggleSavedLook(id: string): Promise<string[]> {
  const cur = await load();
  cache = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  notify();
  AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => {});
  return cache;
}

/** React hook: live list of saved look ids. */
export function useSavedLooks(): string[] {
  const [ids, setIds] = useState<string[]>(cache ?? []);
  useEffect(() => {
    let alive = true;
    load().then(v => { if (alive) setIds([...v]); });
    const fn = () => setIds(cache ? [...cache] : []);
    subs.add(fn);
    return () => { alive = false; subs.delete(fn); };
  }, []);
  return ids;
}
