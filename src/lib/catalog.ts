import { requestJson } from "./http";
import { tmdbKey, type MediaType, type TmdbItem, type TmdbPage } from "./tmdb";
import {
  RUNTIME_RANGE,
  genreIds,
  yearRange,
  type SearchFilters,
} from "./search";
import { byCatalogRank } from "./rank";

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

export type PersonHit = {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department?: string;
  popularity?: number;
};

const key = tmdbKey;

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

/** Where to look for "on my services". */
export type Where = { region: string; providers: number[] };

function extras(type: MediaType, filters: SearchFilters, where?: Where) {
  const date = type === "tv" ? "first_air_date" : "primary_release_date";
  const today = new Date().toISOString().slice(0, 10);
  const params: Record<string, string | number | undefined> = {
    sort_by: sortFor(type, filters.sort),
    "vote_count.gte": filters.sort === "rating" || filters.minScore ? 80 : 20,
    [`${date}.lte`]: today,
  };
  if (filters.genres.length)
    params.with_genres = genreIds(filters.genres, type).join("|");
  if (filters.without.length)
    params.without_genres = genreIds(filters.without, type).join(",");
  if (filters.minScore) params["vote_average.gte"] = filters.minScore;
  const range = yearRange(filters);
  if (range) {
    params[`${date}.gte`] = `${range[0]}-01-01`;
    const end = `${range[1]}-12-31`;
    if (end < today) params[`${date}.lte`] = end;
  }
  if (filters.lang) params.with_original_language = filters.lang;
  if (filters.runtime) {
    const [min, max] = RUNTIME_RANGE[filters.runtime];
    if (min) params["with_runtime.gte"] = min;
    if (max < 600) params["with_runtime.lte"] = max;
  }
  if (filters.fame === "famous") params["vote_count.gte"] = 1000;
  if (filters.fame === "gems") {
    params["vote_count.gte"] = 100;
    params["vote_count.lte"] = 2000;
  }
  if (filters.services && where?.providers.length) {
    params.with_watch_providers = where.providers.join("|");
    params.watch_region = where.region;
    params.with_watch_monetization_types = "flatrate|free|ads";
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
      "vote_count.gte": 80,
      ...extra,
    }).then((data) => ({
      ...data,
      results: byCatalogRank(
        data.results.map((item) => ({ ...item, media_type: type })),
      ),
    })),
  browseFiltered: async (
    filters: SearchFilters,
    page = 1,
    where?: Where,
  ): Promise<TmdbPage<TmdbItem>> => {
    const types: MediaType[] =
      filters.kind === "all" ? ["movie", "tv"] : [filters.kind];
    const pages = await Promise.all(
      types.map((type) =>
        request<TmdbPage<TmdbItem>>(`/discover/${type}`, {
          page,
          ...extras(type, filters, where),
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
    const ranked =
      filters.sort === "rating" || filters.sort === "year"
        ? results
        : byCatalogRank(results);
    return {
      page,
      results: ranked,
      total_pages: Math.max(...pages.map((p) => p.total_pages), 1),
      total_results: pages.reduce((sum, p) => sum + p.total_results, 0),
    };
  },
};
