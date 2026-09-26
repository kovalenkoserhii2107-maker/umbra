import { readStorage } from "./storage";
import { requestJson } from "./http";
import {
  DEFAULT_TMDB_KEY,
  type MediaType,
  type TmdbItem,
  type TmdbPage,
} from "./tmdb";
import type { SearchFilters } from "./search";

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

export type PersonHit = {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department?: string;
  popularity?: number;
};

function key() {
  return readStorage("umbra.tmdbKey")?.trim() || DEFAULT_TMDB_KEY;
}

async function request<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
) {
  const url = new URL(BASE + path);
  url.searchParams.set("api_key", key());
  url.searchParams.set("language", "ru-RU");
  url.searchParams.set("include_adult", "false");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  return requestJson<T>(url.toString());
}

export function profileUrl(path?: string | null, size = "w185") {
  if (!path) return "";
  return `${IMG}/${size}${path}`;
}

function sortFor(type: MediaType, sort: SearchFilters["sort"]) {
  if (sort === "rating") return "vote_average.desc";
  if (sort === "year")
    return type === "tv" ? "first_air_date.desc" : "primary_release_date.desc";
  return "popularity.desc";
}

function extras(type: MediaType, filters: SearchFilters) {
  const params: Record<string, string | number | undefined> = {
    sort_by: sortFor(type, filters.sort),
    "vote_count.gte": filters.sort === "rating" || filters.minScore ? 80 : 20,
  };
  if (filters.genre) params.with_genres = filters.genre;
  if (filters.minScore) params["vote_average.gte"] = filters.minScore;
  if (filters.year) {
    if (type === "tv") params.first_air_date_year = filters.year;
    else params.primary_release_year = filters.year;
  }
  return params;
}

export const catalog = {
  people: (query: string, page = 1) =>
    request<TmdbPage<PersonHit>>("/search/person", { query, page }),
  browse: (
    type: MediaType,
    page = 1,
    extra: Record<string, string | number | undefined> = {},
  ) =>
    request<TmdbPage<TmdbItem>>(`/discover/${type}`, {
      page,
      sort_by: "popularity.desc",
      "vote_count.gte": 40,
      ...extra,
    }),
  browseFiltered: async (
    filters: SearchFilters,
    page = 1,
  ): Promise<TmdbPage<TmdbItem>> => {
    const types: MediaType[] =
      filters.kind === "all" ? ["movie", "tv"] : [filters.kind];
    const pages = await Promise.all(
      types.map((type) =>
        request<TmdbPage<TmdbItem>>(`/discover/${type}`, {
          page,
          ...extras(type, filters),
        }),
      ),
    );
    const results: TmdbItem[] = [];
    pages.forEach((pack, index) => {
      const type = types[index];
      pack.results.forEach((item) =>
        results.push({ ...item, media_type: type }),
      );
    });
    return {
      page,
      results,
      total_pages: Math.max(...pages.map((p) => p.total_pages), 1),
      total_results: pages.reduce((sum, p) => sum + p.total_results, 0),
    };
  },
};
