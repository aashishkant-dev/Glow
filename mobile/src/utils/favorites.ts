/**
 * Favorite artists store — API-backed, with the same pub/sub layer as
 * savedLooks.ts so hearts stay in sync across Explore / Saved / provider
 * profile without prop drilling.
 */
import { useEffect, useState } from 'react';
import { apiFavoriteProvider, apiUnfavoriteProvider, apiGetFavorites } from '../api/client';

let cache: string[] | null = null;
const subs = new Set<() => void>();

function notify() { subs.forEach(fn => fn()); }

async function load(): Promise<string[]> {
  if (cache) return cache;
  try {
    const { providers } = await apiGetFavorites();
    cache = providers.map(p => p.id);
  } catch {
    cache = [];
  }
  return cache;
}

export async function toggleFavorite(providerId: string): Promise<string[]> {
  const cur = await load();
  const isFavorited = cur.includes(providerId);
  cache = isFavorited ? cur.filter(x => x !== providerId) : [...cur, providerId];
  notify();
  try {
    if (isFavorited) await apiUnfavoriteProvider(providerId);
    else await apiFavoriteProvider(providerId);
  } catch {
    // Revert on failure — the optimistic flip above was wrong.
    cache = cur;
    notify();
  }
  return cache;
}

/** React hook: live list of favorited provider ids. */
export function useFavorites(): string[] {
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
