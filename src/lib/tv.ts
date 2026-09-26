import { readStorage } from "./storage";
import { requestJson } from "./http";
import { DEFAULT_TMDB_KEY } from "./tmdb";

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

function key() {
  return readStorage("umbra.tmdbKey")?.trim() || DEFAULT_TMDB_KEY;
}

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
