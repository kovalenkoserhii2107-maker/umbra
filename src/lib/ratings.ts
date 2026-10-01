import { readStorage, writeStorage } from "./storage";
import { requestJson } from "./http";
import { tmdb, type MediaType } from "./tmdb";
import { fetchOmdbScores } from "./omdb";

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

// Rotten Tomatoes and Metacritic have no public browser APIs; Wikidata keeps
// their published scores keyed by IMDb ID and answers cross-origin requests.
const WIKIDATA = "http://www.wikidata.org/entity/";
const ROTTEN_TOMATOES = "Q105584";
const TOMATOMETER = "Q108403393";
const METACRITIC = "Q150248";

export type CriticScores = {
  /** Tomatometer, percent of positive critic reviews. */
  tomatometer: number | null;
  /** Rotten Tomatoes path such as "m/the_shawshank_redemption". */
  rottenTomatoesId: string | null;
  /** Metascore 0–100, the critic score IMDb shows on its critic reviews. */
  metascore: number | null;
};

type SparqlValue = { value: string };
type SparqlRow = Partial<
  Record<"rt" | "by" | "score" | "method" | "date", SparqlValue>
>;

function latest<T>(rows: Array<{ value: T; date: string }>): T | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => b.date.localeCompare(a.date))[0].value;
}

export function parseCriticScores(json: unknown): CriticScores {
  const rows =
    (json as { results?: { bindings?: SparqlRow[] } })?.results?.bindings ?? [];
  const tomatometer: Array<{ value: number; date: string }> = [];
  const metascore: Array<{ value: number; date: string }> = [];
  let rottenTomatoesId: string | null = null;
  for (const row of rows) {
    const rt = row.rt?.value;
    if (rt && /^(m|tv)\/[\w-]+(\/[\w-]+)*$/.test(rt)) rottenTomatoesId = rt;
    const by = row.by?.value.replace(WIKIDATA, "");
    const raw = row.score?.value.trim() ?? "";
    const method = row.method?.value.replace(WIKIDATA, "");
    const date = row.date?.value ?? "";
    if (by === ROTTEN_TOMATOES) {
      // Other determination methods are audience scores or average ratings.
      const match = raw.match(/^(\d{1,3})\s*%$/);
      if (match && (!method || method === TOMATOMETER)) {
        const value = Number(match[1]);
        if (value <= 100) tomatometer.push({ value, date });
      }
    } else if (by === METACRITIC) {
      // Metascores are published out of 100; "/10" values are user scores.
      const match = raw.match(/^(\d{1,3})(?:\s*\/\s*100)?$/);
      if (match) {
        const value = Number(match[1]);
        if (value <= 100) metascore.push({ value, date });
      }
    }
  }
  return {
    tomatometer: latest(tomatometer),
    rottenTomatoesId,
    metascore: latest(metascore),
  };
}

/** OMDb first (fresh, needs a key), Wikidata for whatever OMDb lacks. */
export async function fetchCriticScores(
  imdbId?: string | null,
): Promise<CriticScores> {
  if (!imdbId || !/^tt\d+$/.test(imdbId))
    return { tomatometer: null, rottenTomatoesId: null, metascore: null };
  const [omdb, wiki] = await Promise.all([
    fetchOmdbScores(imdbId),
    fetchWikidataScores(imdbId),
  ]);
  const fromUrl = omdb?.rottenTomatoesUrl?.replace(
    /^https:\/\/www\.rottentomatoes\.com\//,
    "",
  );
  return {
    tomatometer: omdb?.tomatometer ?? wiki.tomatometer,
    metascore: omdb?.metascore ?? wiki.metascore,
    rottenTomatoesId: wiki.rottenTomatoesId || fromUrl || null,
  };
}

async function fetchWikidataScores(
  imdbId?: string | null,
): Promise<CriticScores> {
  const empty = { tomatometer: null, rottenTomatoesId: null, metascore: null };
  if (!imdbId || !/^tt\d+$/.test(imdbId)) return empty;
  const query = `SELECT ?rt ?by ?score ?method ?date WHERE {
  ?item wdt:P345 "${imdbId}" .
  OPTIONAL { ?item wdt:P1258 ?rt }
  OPTIONAL {
    ?item p:P444 ?st .
    ?st ps:P444 ?score ; pq:P447 ?by .
    FILTER(?by IN (wd:${ROTTEN_TOMATOES}, wd:${METACRITIC}))
    FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
    OPTIONAL { ?st pq:P459 ?method }
    OPTIONAL { ?st pq:P585 ?date }
  }
}`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  try {
    return parseCriticScores(await requestJson<unknown>(url, 6 * 3600_000));
  } catch {
    return empty;
  }
}
