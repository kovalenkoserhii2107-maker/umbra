import { readStorage, writeStorage } from "./storage";
import { requestJson } from "./http";
import { tmdb, type MediaType } from "./tmdb";

type Entry = { imdb?: string; tmdb?: number; imdbId?: string; at?: number };
type Cache = Record<string, Entry>;

const CACHE_KEY = "umbra.ratings";
const listeners = new Set<() => void>();
const inflight = new Map<string, Promise<string | null>>();

function readCache(): Cache {
  try {
    return JSON.parse(readStorage(CACHE_KEY) || "{}") as Cache;
  } catch {
    return {};
  }
}

function keyOf(type: MediaType, id: number) {
  return `${type}:${id}`;
}

export function subscribeRatings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function cachedRating(type: MediaType, id: number): Entry {
  return readCache()[keyOf(type, id)] || {};
}

export function rememberRating(type: MediaType, id: number, patch: Entry) {
  const all = readCache();
  all[keyOf(type, id)] = { ...all[keyOf(type, id)], ...patch, at: Date.now() };
  writeStorage(CACHE_KEY, JSON.stringify(all));
  notify();
}

function formatScore(value: number | string) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(1);
}

export async function fetchImdbRating(
  imdbId?: string | null,
): Promise<string | null> {
  if (!imdbId) return null;
  const map = await fetchImdbRatings([imdbId]);
  return map[imdbId] || null;
}

export async function fetchImdbRatings(
  ids: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const out: Record<string, string> = {};
  for (let i = 0; i < unique.length; i += 80) {
    const chunk = unique.slice(i, i + 80);
    const qs = chunk.map((id) => `id=${encodeURIComponent(id)}`).join("&");
    try {
      const data = await requestJson<
        Array<{ imdbId?: string; rating?: number | null }>
      >(`https://api.agregarr.org/api/ratings?${qs}`, 3600_000);
      const rows = Array.isArray(data) ? data : [data];
      rows.forEach((row) => {
        const score = formatScore(row?.rating ?? "");
        if (row?.imdbId && score) out[row.imdbId] = score;
      });
    } catch {
      /* ignore chunk */
    }
  }
  return out;
}

export async function ensureImdbRating(
  type: MediaType,
  id: number,
): Promise<string | null> {
  const existing = cachedRating(type, id);
  if (existing.imdb && Date.now() - (existing.at || 0) < 86400_000)
    return existing.imdb;
  const key = keyOf(type, id);
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    let imdbId = existing.imdbId;
    if (!imdbId) {
      try {
        const ids = await tmdb.externalIds(type, id);
        imdbId = ids.imdb_id || undefined;
        if (imdbId) rememberRating(type, id, { imdbId });
      } catch {
        return null;
      }
    }
    const score = await fetchImdbRating(imdbId);
    if (score) rememberRating(type, id, { imdb: score, imdbId });
    return score;
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}
