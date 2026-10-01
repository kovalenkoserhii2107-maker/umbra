import { useEffect, useState } from "react";
import type { LibraryItem } from "./library";
import { readStorage, writeStorage } from "./storage";
import { tmdb } from "./tmdb";

/** Facts the library documents do not store: genres and running time. */
export type TitleMeta = {
  genres: string[];
  /** Movie runtime or typical episode runtime, minutes. */
  runtime: number;
  /** Release or premiere date, YYYY-MM-DD. */
  date: string;
  /** Episodes per regular season, for series. */
  seasons?: Array<[number, number]>;
  at: number;
};
export type MetaMap = Record<string, TitleMeta>;

const KEY = "umbra.meta.v1";
const TTL = 30 * 86400_000;
const DEFAULT_EPISODE = 45;

export const metaKey = (item: Pick<LibraryItem, "type" | "id">) =>
  `${item.type}:${item.id}`;

function readCache(): MetaMap {
  try {
    return JSON.parse(readStorage(KEY) || "{}") as MetaMap;
  } catch {
    return {};
  }
}

async function fetchMeta(item: LibraryItem): Promise<TitleMeta | null> {
  try {
    const d = await tmdb.basic(item.type, item.id);
    const runtime =
      item.type === "movie"
        ? d.runtime || 0
        : d.episode_run_time?.[0] ||
          (d.last_episode_to_air as { runtime?: number } | null | undefined)
            ?.runtime ||
          DEFAULT_EPISODE;
    return {
      genres: (d.genres || []).map((g) => g.name),
      runtime,
      date: (d.release_date || d.first_air_date || "").slice(0, 10),
      seasons:
        item.type === "tv"
          ? (d.seasons || [])
              .filter((s) => s.season_number > 0)
              .map((s) => [s.season_number, s.episode_count])
          : undefined,
      at: Date.now(),
    };
  } catch {
    return null;
  }
}

/** Minutes the person has spent on a title, estimated from its status. */
export function watchedMinutes(item: LibraryItem, meta?: TitleMeta) {
  if (!meta || item.status === "watchlist") return 0;
  if (item.type === "movie")
    return item.status === "watched" ? meta.runtime : 0;
  const seasons = meta.seasons || [];
  const total = seasons.reduce((sum, [, n]) => sum + n, 0);
  let episodes = 0;
  if (item.season && item.episode) {
    episodes =
      seasons
        .filter(([s]) => s < item.season!)
        .reduce((sum, [, n]) => sum + n, 0) + item.episode;
  } else if (item.status === "watched") episodes = total;
  return Math.min(episodes, total || episodes) * meta.runtime;
}

/** Loads metadata for every library title, a few at a time, with a local cache. */
export function useLibraryMeta(items: LibraryItem[]) {
  const [meta, setMeta] = useState<MetaMap>(readCache);
  const [loading, setLoading] = useState(false);
  const wanted = items.map(metaKey).join();
  useEffect(() => {
    let alive = true;
    const cache = readCache();
    const missing = items.filter((item) => {
      const hit = cache[metaKey(item)];
      return !hit || Date.now() - hit.at > TTL;
    });
    if (!missing.length) {
      setMeta(cache);
      return;
    }
    setLoading(true);
    (async () => {
      for (let i = 0; i < missing.length && alive; i += 12) {
        const chunk = missing.slice(i, i + 12);
        const rows = await Promise.all(chunk.map(fetchMeta));
        chunk.forEach((item, n) => {
          if (rows[n]) cache[metaKey(item)] = rows[n]!;
        });
        writeStorage(KEY, JSON.stringify(cache));
        if (alive) setMeta({ ...cache });
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [wanted]);
  return { meta, loading };
}
