import { requestJson } from "./http";
import { readStorage, writeStorage } from "./storage";

/**
 * OMDb returns the Tomatometer and Metascore by IMDb ID and allows browser
 * requests. It needs a free key (omdbapi.com/apikey.aspx, 1,000 requests a
 * day): from the build (VITE_OMDB_KEY) or entered in Settings.
 */
const KEY = "umbra.omdbKey";
const CACHE = "umbra.omdb.v1";
const TTL = 24 * 3600_000;

export type OmdbScores = {
  tomatometer: number | null;
  metascore: number | null;
  rottenTomatoesUrl: string | null;
};

export function omdbKey() {
  return (
    readStorage(KEY)?.trim() ||
    (import.meta.env.VITE_OMDB_KEY as string | undefined)?.trim() ||
    ""
  );
}

export function setOmdbKey(value: string) {
  writeStorage(KEY, value.trim() || null);
  writeStorage(CACHE, null);
}

/** The key entered on this device, without the one from the build. */
export function ownOmdbKey() {
  return readStorage(KEY)?.trim() || "";
}

export function hasBuildOmdbKey() {
  return Boolean((import.meta.env.VITE_OMDB_KEY as string | undefined)?.trim());
}

export function parseOmdb(json: unknown): OmdbScores | null {
  const data = json as {
    Response?: string;
    Ratings?: Array<{ Source?: string; Value?: string }>;
    Metascore?: string;
    tomatoURL?: string;
  };
  if (!data || data.Response !== "True") return null;
  const rating = (source: string) =>
    data.Ratings?.find((r) => r.Source === source)?.Value || "";
  const percent = rating("Rotten Tomatoes").match(/^(\d{1,3})%$/);
  const meta =
    rating("Metacritic").match(/^(\d{1,3})\/100$/)?.[1] ||
    (/^\d{1,3}$/.test(data.Metascore || "") ? data.Metascore : null);
  const url = data.tomatoURL || "";
  return {
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
