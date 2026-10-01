import { requestJson } from "./http";
import { readStorage, writeStorage } from "./storage";

/**
 * OMDb returns the Tomatometer and Metascore by IMDb ID and allows browser
 * requests. It needs a free key (omdbapi.com/apikey.aspx, 1,000 requests a
 * day), set at build time (VITE_OMDB_KEY).
 */
const CACHE = "umbra.omdb.v2";
const TTL = 24 * 3600_000;

export type OmdbScores = {
  tomatometer: number | null;
  metascore: number | null;
  rottenTomatoesUrl: string | null;
  /** English summary, e.g. "Won 3 Oscars. 120 wins & 200 nominations total". */
  awards: string | null;
  /** US box office, e.g. "$389,813,101". */
  boxOffice: string | null;
  /** US rating, e.g. "PG-13". */
  rated: string | null;
  imdbVotes: number | null;
  /** IMDb score, e.g. "7.6"; a fallback when the main ratings source has none. */
  imdbRating: string | null;
};

export function omdbKey() {
  return (import.meta.env.VITE_OMDB_KEY as string | undefined)?.trim() || "";
}

export function parseOmdb(json: unknown): OmdbScores | null {
  const data = json as {
    Response?: string;
    Ratings?: Array<{ Source?: string; Value?: string }>;
    Metascore?: string;
    tomatoURL?: string;
    Awards?: string;
    BoxOffice?: string;
    Rated?: string;
    imdbVotes?: string;
    imdbRating?: string;
  };
  if (!data || data.Response !== "True") return null;
  const rating = (source: string) =>
    data.Ratings?.find((r) => r.Source === source)?.Value || "";
  const percent = rating("Rotten Tomatoes").match(/^(\d{1,3})%$/);
  const meta =
    rating("Metacritic").match(/^(\d{1,3})\/100$/)?.[1] ||
    (/^\d{1,3}$/.test(data.Metascore || "") ? data.Metascore : null);
  const url = data.tomatoURL || "";
  const text = (v?: string) => (v && v !== "N/A" ? v.trim() : null);
  const votes = Number((data.imdbVotes || "").replace(/,/g, ""));
  return {
    awards: text(data.Awards),
    boxOffice: /^\$[\d,]+$/.test(data.BoxOffice || "") ? data.BoxOffice! : null,
    rated: text(data.Rated),
    imdbVotes: Number.isFinite(votes) && votes > 0 ? votes : null,
    imdbRating: /^\d{1,2}\.\d$/.test(data.imdbRating || "")
      ? data.imdbRating!
      : null,
    tomatometer: percent ? Number(percent[1]) : null,
    metascore: meta ? Number(meta) : null,
    rottenTomatoesUrl: /^https:\/\/www\.rottentomatoes\.com\//.test(url)
      ? url
      : null,
  };
}

function readCache(): Record<string, OmdbScores & { at: number }> {
  try {
    return JSON.parse(readStorage(CACHE) || "{}");
  } catch {
    return {};
  }
}

/** Null without a key or when OMDb fails; results are cached for a day. */
export const fetchOmdbInfo = (imdbId: string) => fetchOmdbScores(imdbId);

export async function fetchOmdbScores(
  imdbId: string,
): Promise<OmdbScores | null> {
  const key = omdbKey();
  if (!key) return null;
  const cache = readCache();
  const hit = cache[imdbId];
  if (hit && Date.now() - hit.at < TTL) return hit;
  try {
    const scores = parseOmdb(
      await requestJson<unknown>(
        `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(key)}&tomatoes=true`,
        TTL,
      ),
    );
    if (!scores) return null;
    const ids = Object.keys(cache);
    // Keep the cache small: drop the oldest entries past 300 titles.
    if (ids.length > 300)
      ids
        .sort((a, b) => cache[a].at - cache[b].at)
        .slice(0, ids.length - 300)
        .forEach((id) => delete cache[id]);
    cache[imdbId] = { ...scores, at: Date.now() };
    writeStorage(CACHE, JSON.stringify(cache));
    return scores;
  } catch {
    return null;
  }
}
