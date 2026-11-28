import type { LibraryItem } from "../library";
import { readStorage, writeStorage } from "../storage";
import { tmdb, type MediaType, type TmdbItem } from "../tmdb";

/**
 * What a library title tells about taste beyond its genres: keywords, the
 * director, the leading cast, its language, how popular it is, and what
 * TMDB recommends after it. Kept on the device for a month: a title's
 * signals hardly change, and the next evening starts at once.
 */
export type TitleSignals = {
  genres: number[];
  keywords: number[];
  directors: Array<{ id: number; name: string }>;
  cast: number[];
  language: string;
  runtime: number;
  year: number;
  vote: number;
  votes: number;
  collection?: number;
  recs: TmdbItem[];
  at: number;
};

export type SignalMap = Record<string, TitleSignals>;

const KEY = "umbra.signals.v1";
const TTL = 30 * 86400_000;
const MAX_KEPT = 80;

export const signalKey = (type: MediaType, id: number) => `${type}:${id}`;

function readCache(): SignalMap {
  try {
    const parsed = JSON.parse(readStorage(KEY) || "{}") as SignalMap;
    const now = Date.now();
    for (const k of Object.keys(parsed))
      if (!parsed[k] || now - parsed[k].at > TTL) delete parsed[k];
    return parsed;
  } catch {
    return {};
  }
}

function writeCache(map: SignalMap) {
  const entries = Object.entries(map)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_KEPT);
  writeStorage(KEY, JSON.stringify(Object.fromEntries(entries)));
}

/** A recommendation as small as the picker needs it. */
export function slimItem(item: TmdbItem, type: MediaType): TmdbItem {
  return {
    id: item.id,
    title: item.title,
    name: item.name,
    poster_path: item.poster_path,
    release_date: item.release_date,
    first_air_date: item.first_air_date,
    vote_average: item.vote_average,
    vote_count: item.vote_count,
    popularity: item.popularity,
    genre_ids: item.genre_ids,
    original_language: item.original_language,
    media_type: (item.media_type as MediaType) || type,
  };
}

async function fetchSignals(
  type: MediaType,
  id: number,
): Promise<TitleSignals | null> {
  try {
    const d = await tmdb.signals(type, id);
    const directors =
      type === "movie"
        ? (d.credits?.crew ?? []).filter((p) => p.job === "Director")
        : (d.created_by ?? []);
    return {
      genres: (d.genres ?? []).map((g) => g.id),
      keywords: (d.keywords?.keywords ?? d.keywords?.results ?? [])
        .slice(0, 20)
        .map((k) => k.id),
      directors: directors.slice(0, 2).map((p) => ({ id: p.id, name: p.name })),
      cast: (d.credits?.cast ?? []).slice(0, 5).map((p) => p.id),
      language: d.original_language ?? "",
      runtime: (type === "movie" ? d.runtime : d.episode_run_time?.[0]) ?? 0,
      year: Number((d.release_date || d.first_air_date || "").slice(0, 4)) || 0,
      vote: d.vote_average ?? 0,
      votes: d.vote_count ?? 0,
      collection: d.belongs_to_collection?.id,
      recs: (d.recommendations?.results ?? [])
        .slice(0, 14)
        .map((r) => slimItem(r, type)),
      at: Date.now(),
    };
  } catch {
    return null;
  }
}

/** Signals for these titles: cached ones at once, the rest from TMDB. */
export async function loadSignals(
  titles: Array<Pick<LibraryItem, "type" | "id">>,
): Promise<SignalMap> {
  const cache = readCache();
  const missing = titles.filter((t) => !cache[signalKey(t.type, t.id)]);
  if (missing.length) {
    const rows = await Promise.all(
      missing.map((t) => fetchSignals(t.type, t.id)),
    );
    missing.forEach((t, i) => {
      if (rows[i]) cache[signalKey(t.type, t.id)] = rows[i]!;
    });
    writeCache(cache);
  }
  const out: SignalMap = {};
  for (const t of titles) {
    const hit = cache[signalKey(t.type, t.id)];
    if (hit) out[signalKey(t.type, t.id)] = hit;
  }
  return out;
}
