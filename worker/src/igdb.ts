import type { Deps } from "./env";
import { ApiError } from "./http";
import { twitchFetch } from "./twitch";

/** IGDB endpoints the app may query, with how long answers stay cached (s). */
export const IGDB_ENDPOINTS: Record<string, number> = {
  games: 86400,
  search: 21600,
  multiquery: 21600,
  platforms: 604800,
  platform_families: 604800,
  genres: 604800,
  themes: 604800,
  game_modes: 604800,
  player_perspectives: 604800,
  companies: 86400,
  involved_companies: 86400,
  franchises: 86400,
  collections: 86400,
  release_dates: 21600,
  covers: 604800,
  artworks: 604800,
  screenshots: 604800,
  game_videos: 86400,
  websites: 86400,
  external_games: 86400,
  age_ratings: 604800,
  language_supports: 86400,
  languages: 604800,
  multiplayer_modes: 86400,
  game_time_to_beats: 86400,
  popularity_primitives: 3600,
  popularity_types: 604800,
  events: 21600,
};

export const MAX_QUERY_BYTES = 4096;

export async function igdbQuery(deps: Deps, endpoint: string, query: string) {
  if (!(endpoint in IGDB_ENDPOINTS))
    throw new ApiError(
      404,
      "unknown_endpoint",
      `IGDB endpoint ${endpoint} is not allowed`,
    );
  if (!query.trim()) throw new ApiError(400, "empty_query", "Query is empty");
  if (new TextEncoder().encode(query).length > MAX_QUERY_BYTES)
    throw new ApiError(413, "query_too_large", "Query is too large");
  const response = await twitchFetch(
    deps,
    `https://api.igdb.com/v4/${endpoint}`,
    {
      method: "POST",
      headers: { "Content-Type": "text/plain", Accept: "application/json" },
      body: query,
    },
  );
  if (response.status === 400) {
    // IGDB explains syntax errors in the body; pass that on to the developer.
    throw new ApiError(400, "bad_query", (await response.text()).slice(0, 500));
  }
  if (!response.ok)
    throw new ApiError(502, "igdb_failed", `IGDB answered ${response.status}`);
  return response.text();
}
