import { requestJson } from "./http";
import { readStorage, writeStorage } from "./storage";
import { tmdbKey } from "./tmdb";

const BASE = "https://api.themoviedb.org/3";

export type SeasonInfo = {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date?: string | null;
  poster_path?: string | null;
};

export type EpisodeInfo = {
  id: number;
  name: string;
  overview?: string;
  episode_number: number;
  season_number: number;
  air_date?: string | null;
  runtime?: number | null;
  still_path?: string | null;
  imdbId?: string;
  imdb?: string | null;
};

export type EpisodeRef = {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
  air_date?: string | null;
};

const key = tmdbKey;

async function request<T>(path: string) {
  const url = new URL(BASE + path);
  url.searchParams.set("api_key", key());
  url.searchParams.set("language", "ru-RU");
  return requestJson<T>(url.toString());
}

export const tvApi = {
  season: (tvId: number, season: number) =>
    request<{
      episodes: EpisodeInfo[];
      air_date?: string;
      name: string;
      season_number: number;
    }>(`/tv/${tvId}/season/${season}`),
  episodeImdb: (tvId: number, season: number, episode: number) =>
    request<{ imdb_id?: string }>(
      `/tv/${tvId}/season/${season}/episode/${episode}/external_ids`,
    ),
};

/* --------------------------------------------- IMDb ids of episodes */

const IDS = "umbra.episodeImdb";
const MAX_IDS = 4000;
/** At most this many lookups at once: the rest of the page keeps loading. */
const AT_ONCE = 3;

function readIds(): Record<string, string> {
  try {
    const value = JSON.parse(readStorage(IDS) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

/**
 * IMDb ids of a season's episodes. TMDB gives them one episode at a time, so
 * they are asked a few at a time and kept on the device: an id never changes,
 * and a season opened again needs no request. Episodes not out yet are
 * skipped (no rating to show); "" marks an episode IMDb does not know.
 */
export async function episodeImdbIds(
  tvId: number,
  season: number,
  episodes: Array<Pick<EpisodeInfo, "episode_number" | "air_date">>,
  today = new Date().toISOString().slice(0, 10),
): Promise<Map<number, string>> {
  const known = readIds();
  const out = new Map<number, string>();
  const missing: number[] = [];
  for (const ep of episodes) {
    const id = known[`${tvId}/${season}/${ep.episode_number}`];
    if (id !== undefined) out.set(ep.episode_number, id);
    else if (ep.air_date && ep.air_date.slice(0, 10) <= today)
      missing.push(ep.episode_number);
  }
  let next = 0;
  const found: Record<string, string> = {};
  await Promise.all(
    Array.from({ length: Math.min(AT_ONCE, missing.length) }, async () => {
      while (next < missing.length) {
        const n = missing[next++];
        try {
          const ext = await tvApi.episodeImdb(tvId, season, n);
          const id = ext.imdb_id || "";
          out.set(n, id);
          found[`${tvId}/${season}/${n}`] = id;
        } catch {
          // Asked again next time.
        }
      }
    }),
  );
  if (Object.keys(found).length) {
    const all = { ...readIds(), ...found };
    const keys = Object.keys(all);
    // Oldest first out once the list grows too long.
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_IDS)))
      delete all[k];
    writeStorage(IDS, JSON.stringify(all));
  }
  return out;
}
