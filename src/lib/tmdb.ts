import { readStorage, writeStorage } from "./storage";
import { requestJson } from "./http";
import { byCatalogRank } from "./rank";
const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

export const DEFAULT_TMDB_KEY = "efe08a32a1ab86042a1bc8f93ad63cc8";

export type MediaType = "movie" | "tv";

export type TmdbItem = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  media_type?: MediaType | "person";
  genre_ids?: number[];
  popularity?: number;
  original_language?: string;
};

export type TmdbPage<T> = {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
};

export type WatchProvider = {
  provider_id: number;
  provider_name: string;
  logo_path: string;
};

export type WatchGroup = {
  link?: string;
  flatrate?: WatchProvider[];
  rent?: WatchProvider[];
  buy?: WatchProvider[];
  ads?: WatchProvider[];
  free?: WatchProvider[];
};

export type PersonRef = {
  id: number;
  name: string;
  character?: string;
  job?: string;
  profile_path: string | null;
};

export type Credits = {
  cast: PersonRef[];
  crew: PersonRef[];
};

export type Video = {
  key: string;
  site: string;
  type: string;
  name: string;
  official: boolean;
  iso_639_1?: string;
  published_at?: string;
};

export type ImageRef = {
  file_path: string;
  iso_639_1?: string | null;
  width?: number;
  height?: number;
  vote_average?: number;
};

export type Named = { id: number; name: string; logo_path?: string | null };

export type Review = {
  id: string;
  author: string;
  author_details?: { rating?: number | null; avatar_path?: string | null };
  content: string;
  created_at?: string;
  url?: string;
};

export type CollectionDetails = {
  id: number;
  name: string;
  overview?: string;
  parts: TmdbItem[];
};

export type CreditWork = TmdbItem & {
  character?: string;
  job?: string;
  department?: string;
  role?: string;
  media_type?: MediaType | "person";
};

export type PersonDetails = {
  id: number;
  name: string;
  biography?: string;
  birthday?: string;
  deathday?: string;
  place_of_birth?: string;
  profile_path?: string | null;
  known_for_department?: string;
  combined_credits?: {
    cast: CreditWork[];
    crew: CreditWork[];
  };
};

export type TitleDetails = TmdbItem & {
  tagline?: string;
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  genres?: Array<{ id: number; name: string }>;
  videos?: { results: Video[] };
  credits?: Credits;
  created_by?: PersonRef[];
  "watch/providers"?: { results: Record<string, WatchGroup> };
  external_ids?: {
    imdb_id?: string | null;
    wikidata_id?: string | null;
    facebook_id?: string | null;
    instagram_id?: string | null;
    twitter_id?: string | null;
  };
  similar?: TmdbPage<TmdbItem>;
  recommendations?: TmdbPage<TmdbItem>;
  images?: { backdrops?: ImageRef[]; posters?: ImageRef[] };
  budget?: number;
  revenue?: number;
  homepage?: string | null;
  original_language?: string;
  origin_country?: string[];
  spoken_languages?: Array<{ iso_639_1: string; name?: string }>;
  production_companies?: Named[];
  production_countries?: Array<{ iso_3166_1: string; name: string }>;
  networks?: Named[];
  type?: string;
  in_production?: boolean;
  belongs_to_collection?: {
    id: number;
    name: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
  } | null;
  release_dates?: {
    results: Array<{
      iso_3166_1: string;
      release_dates: Array<{
        release_date: string;
        type: number;
        certification?: string;
        note?: string;
      }>;
    }>;
  };
  content_ratings?: {
    results: Array<{ iso_3166_1: string; rating: string }>;
  };
};

export type MovieReleases = TmdbItem & {
  release_dates?: {
    results: Array<{
      iso_3166_1: string;
      release_dates: Array<{ release_date: string; type: number }>;
    }>;
  };
};

export type AirDate = {
  air_date?: string | null;
  season_number: number;
  episode_number: number;
};

export type ShowAirDates = TmdbItem & {
  next_episode_to_air?: AirDate | null;
  last_episode_to_air?: AirDate | null;
  seasons?: Array<{ season_number: number; episode_count: number }>;
  status?: string;
};

function keyFromStore() {
  return readStorage("umbra.tmdbKey")?.trim() || DEFAULT_TMDB_KEY;
}

export function hasApiKey() {
  return Boolean(keyFromStore());
}

// TMDB currently labels this Bulgarian Digger teaser as Russian.
// Match the image itself so existing saved cards receive the correction too.
export function correctPosterUrl(url: string) {
  return url.replace(
    /^(https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)\/)dnM8OyhnLc1YdRyUtps6d4rAUgM\.jpg$/,
    "$1biovC0fjDUUSGJiR4joGaGERUS3.jpg",
  );
}

export function posterUrl(path?: string | null, size = "w342") {
  if (!path) return "";
  return correctPosterUrl(`${IMG}/${size}${path}`);
}

export function backdropUrl(path?: string | null, size = "w1280") {
  if (!path) return "";
  return `${IMG}/${size}${path}`;
}

export function titleOf(item: Pick<TmdbItem, "title" | "name">) {
  return item.title || item.name || "Без названия";
}

export function kindOf(item: TmdbItem): MediaType {
  if (item.media_type === "tv" || (!item.title && item.name)) return "tv";
  return "movie";
}

export function mediaOf(item: TmdbItem, fallback?: MediaType): MediaType {
  if (item.media_type === "movie" || item.media_type === "tv")
    return item.media_type;
  return fallback || kindOf(item);
}

async function request<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  ttl?: number,
): Promise<T> {
  const key = keyFromStore();
  if (!key) throw new Error("NO_KEY");
  const url = new URL(BASE + path);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", "ru-RU");
  url.searchParams.set("include_adult", "false");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  return requestJson<T>(url.toString(), ttl);
}

const CHART_CACHE = "umbra.imdbCharts";

async function chartIds(kind: MediaType): Promise<string[]> {
  try {
    const raw = readStorage(CHART_CACHE);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        at: number;
        movie: string[];
        tv: string[];
      };
      if (Date.now() - parsed.at < 1000 * 60 * 60 * 12 && parsed[kind]?.length)
        return parsed[kind];
    }
  } catch {
    /* ignore */
  }
  const url =
    kind === "movie"
      ? "https://imdb-top250.mmdju.workers.dev/top250"
      : "https://imdb-top250.mmdju.workers.dev/toptv";
  const json = await requestJson<
    { data?: Array<{ id: string }> } | Array<{ id: string }>
  >(url, 3600_000);
  const list = Array.isArray(json)
    ? json.map((x) => x.id)
    : (json.data || []).map((x) => x.id);
  const ids = list.filter(Boolean);
  try {
    const prev = JSON.parse(readStorage(CHART_CACHE) || "{}") as {
      movie?: string[];
      tv?: string[];
    };
    writeStorage(
      CHART_CACHE,
      JSON.stringify({
        at: Date.now(),
        movie: kind === "movie" ? ids : prev.movie || [],
        tv: kind === "tv" ? ids : prev.tv || [],
      }),
    );
  } catch {
    /* ignore */
  }
  return ids;
}

function dateOf(item: TmdbItem) {
  return item.release_date || item.first_air_date || "";
}

function asPage(page: TmdbPage<TmdbItem>, type?: MediaType): TmdbPage<TmdbItem> {
  return {
    ...page,
    results: byCatalogRank(
      page.results.map((item) =>
        type ? { ...item, media_type: type } : item,
      ),
    ),
  };
}

function dayOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export const tmdb = {
  trending: (window: "day" | "week" = "week", page = 1) =>
    request<TmdbPage<TmdbItem>>(`/trending/all/${window}`, { page }).then(
      (data) => asPage(data),
    ),
  nowPlaying: (page = 1, region = "UA") =>
    request<TmdbPage<TmdbItem>>("/movie/now_playing", { page, region }).then(
      (data) => asPage(data, "movie"),
    ),
  fresh: async (page = 1): Promise<TmdbPage<TmdbItem>> => {
    const from = dayOffset(-75);
    const to = dayOffset(0);
    const [movies, shows] = await Promise.all([
      request<TmdbPage<TmdbItem>>("/discover/movie", {
        page,
        sort_by: "popularity.desc",
        "vote_count.gte": 80,
        "primary_release_date.gte": from,
        "primary_release_date.lte": to,
      }),
      request<TmdbPage<TmdbItem>>("/discover/tv", {
        page,
        sort_by: "popularity.desc",
        "vote_count.gte": 80,
        "first_air_date.gte": from,
        "first_air_date.lte": to,
      }),
    ]);
    const results = byCatalogRank([
      ...movies.results.map((item) => ({
        ...item,
        media_type: "movie" as const,
      })),
      ...shows.results.map((item) => ({ ...item, media_type: "tv" as const })),
    ]).slice(0, 20);
    return {
      page,
      results,
      total_pages: Math.max(movies.total_pages, shows.total_pages),
      total_results: movies.total_results + shows.total_results,
    };
  },
  onAir: async (page = 1): Promise<TmdbPage<TmdbItem>> => {
    const base = {
      page,
      sort_by: "popularity.desc",
      "air_date.gte": dayOffset(-7),
      "air_date.lte": dayOffset(0),
      "vote_count.gte": 40,
    };
    const [broad, english, russian, ukrainian] = await Promise.all([
      request<TmdbPage<TmdbItem>>("/discover/tv", base),
      request<TmdbPage<TmdbItem>>("/discover/tv", {
        ...base,
        with_original_language: "en",
      }),
      request<TmdbPage<TmdbItem>>("/discover/tv", {
        ...base,
        with_original_language: "ru",
      }),
      request<TmdbPage<TmdbItem>>("/discover/tv", {
        ...base,
        with_original_language: "uk",
      }),
    ]);
    const seen = new Set<number>();
    const merged: TmdbItem[] = [];
    for (const item of [
      ...english.results,
      ...russian.results,
      ...ukrainian.results,
      ...broad.results,
    ]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push({ ...item, media_type: "tv" });
    }
    return {
      page,
      results: byCatalogRank(merged).slice(0, 20),
      total_pages: broad.total_pages,
      total_results: broad.total_results,
    };
  },
  upcoming: (page = 1) =>
    request<TmdbPage<TmdbItem>>("/movie/upcoming", { page }).then((data) =>
      asPage(data, "movie"),
    ),
  upcomingWindow: (page: number, from: string, to: string) =>
    request<TmdbPage<TmdbItem>>("/discover/movie", {
      page,
      sort_by: "popularity.desc",
      "vote_count.gte": 40,
      "primary_release_date.gte": from,
      "primary_release_date.lte": to,
    }).then((data) => asPage(data, "movie")),
  airingToday: (page = 1) =>
    request<TmdbPage<TmdbItem>>("/tv/airing_today", { page }),
  popularTv: (page = 1) => request<TmdbPage<TmdbItem>>("/tv/popular", { page }),
  topRated: (type: MediaType, page = 1) =>
    request<TmdbPage<TmdbItem>>(`/${type}/top_rated`, { page }).then((data) =>
      asPage(data, type),
    ),
  recommendations: (type: MediaType, id: number, page = 1) =>
    request<TmdbPage<TmdbItem>>(`/${type}/${id}/recommendations`, {
      page,
    }).then((data) => asPage(data, type)),
  search: (query: string, page = 1) =>
    request<TmdbPage<TmdbItem>>("/search/multi", { query, page }),
  searchCatalog: async (
    query: string,
    page = 1,
  ): Promise<TmdbPage<TmdbItem>> => {
    const [movies, shows] = await Promise.all([
      request<TmdbPage<TmdbItem>>("/search/movie", { query, page }),
      request<TmdbPage<TmdbItem>>("/search/tv", { query, page }),
    ]);
    const seen = new Set<string>();
    const results: TmdbItem[] = [];
    for (const item of movies.results) {
      const key = `movie:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ ...item, media_type: "movie" });
    }
    for (const item of shows.results) {
      const key = `tv:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ ...item, media_type: "tv" });
    }
    return {
      page,
      results,
      total_pages: Math.max(movies.total_pages, shows.total_pages),
      total_results: movies.total_results + shows.total_results,
    };
  },
  details: (type: MediaType, id: number) =>
    request<TitleDetails>(`/${type}/${id}`, {
      append_to_response: `videos,credits,watch/providers,external_ids,similar,recommendations,images,${type === "movie" ? "release_dates" : "content_ratings"}`,
      // Russian first, but keep English trailers and language-free stills.
      include_video_language: "ru,en",
      include_image_language: "null,ru,en",
    }),
  collection: (id: number) =>
    request<CollectionDetails>(`/collection/${id}`, {}, 6 * 3600_000),
  /** TMDB viewer reviews are almost all English, so ask for them in English. */
  reviews: (type: MediaType, id: number) =>
    request<TmdbPage<Review>>(
      `/${type}/${id}/reviews`,
      { language: "en-US" },
      3600_000,
    ),
  movieReleases: (id: number) =>
    request<MovieReleases>(
      `/movie/${id}`,
      { append_to_response: "release_dates" },
      6 * 3600_000,
    ),
  /** Plain details without appends, cached for hours. */
  basic: (type: MediaType, id: number) =>
    request<TitleDetails & ShowAirDates>(`/${type}/${id}`, {}, 6 * 3600_000),
  showAirDates: (id: number) =>
    request<ShowAirDates>(`/tv/${id}`, {}, 6 * 3600_000),
  externalIds: (type: MediaType, id: number) =>
    request<{ imdb_id?: string }>(`/${type}/${id}/external_ids`),
  person: (id: number) =>
    request<PersonDetails>(`/person/${id}`, {
      append_to_response: "combined_credits",
    }),
  find: (imdbId: string) =>
    request<{ movie_results: TmdbItem[]; tv_results: TmdbItem[] }>(
      `/find/${imdbId}`,
      {
        external_source: "imdb_id",
      },
    ),
  discover: (type: MediaType, providerId: number, region: string, page = 1) =>
    request<TmdbPage<TmdbItem>>(`/discover/${type}`, {
      with_watch_providers: providerId,
      watch_region: region,
      with_watch_monetization_types: "flatrate|free|ads",
      sort_by: "popularity.desc",
      "vote_count.gte": 40,
      page,
    }).then((data) => asPage(data, type)),
  discoverNewest: (
    type: MediaType,
    providerId: number,
    region: string,
    page = 1,
  ) =>
    request<TmdbPage<TmdbItem>>(`/discover/${type}`, {
      with_watch_providers: providerId,
      watch_region: region,
      with_watch_monetization_types: "flatrate|free|ads",
      sort_by:
        type === "tv" ? "first_air_date.desc" : "primary_release_date.desc",
      page,
    }),
  discoverOriginals: (
    type: MediaType,
    companies?: number[],
    networks?: number[],
    page = 1,
  ) => {
    const params: Record<string, string | number | undefined> = {
      page,
      sort_by:
        type === "tv" ? "first_air_date.desc" : "primary_release_date.desc",
    };
    if (type === "movie" && companies?.length)
      params.with_companies = companies.join("|");
    if (type === "tv" && networks?.length)
      params.with_networks = networks.join("|");
    else if (type === "tv" && companies?.length)
      params.with_companies = companies.join("|");
    return request<TmdbPage<TmdbItem>>(`/discover/${type}`, params);
  },
  platformPopular: async (
    providerId: number,
    region: string,
  ): Promise<TmdbItem[]> => {
    const params = {
      with_watch_providers: providerId,
      watch_region: region,
      with_watch_monetization_types: "flatrate|free|ads",
      sort_by: "popularity.desc",
      "vote_count.gte": 100,
      page: 1,
    };
    const [movies, shows] = await Promise.all([
      request<TmdbPage<TmdbItem>>("/discover/movie", params),
      request<TmdbPage<TmdbItem>>("/discover/tv", params),
    ]);
    const merged = [
      ...movies.results.map((item) => ({ ...item, media_type: "movie" as const })),
      ...shows.results.map((item) => ({ ...item, media_type: "tv" as const })),
    ];
    const seen = new Set<string>();
    return merged
      .filter((item) => {
        const key = `${item.media_type}:${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 20);
  },
  platformMovies: (
    providerId: number,
    region: string,
    companies?: number[],
  ) =>
    request<TmdbPage<TmdbItem>>("/discover/movie", {
      with_watch_providers: providerId,
      watch_region: region,
      with_watch_monetization_types: "flatrate|free|ads",
      without_companies: companies?.length ? companies.join(",") : undefined,
      sort_by: "popularity.desc",
      "vote_count.gte": 40,
      page: 1,
    }).then((data) => asPage(data, "movie")),
  platformNewest: async (
    providerId: number,
    region: string,
    companies?: number[],
    networks?: number[],
  ): Promise<TmdbItem[]> => {
    const originals = companies?.length || networks?.length;
    const [om, ot, nm, nt] = await Promise.all([
      originals
        ? tmdb.discoverOriginals("movie", companies, networks, 1)
        : Promise.resolve({ results: [] as TmdbItem[] }),
      originals
        ? tmdb.discoverOriginals("tv", companies, networks, 1)
        : Promise.resolve({ results: [] as TmdbItem[] }),
      tmdb.discoverNewest("movie", providerId, region, 1),
      tmdb.discoverNewest("tv", providerId, region, 1),
    ]);
    const seen = new Set<string>();
    const merged: TmdbItem[] = [];
    const push = (item: TmdbItem, type: MediaType) => {
      const key = `${type}:${item.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({ ...item, media_type: type });
    };
    om.results.forEach((item) => push(item, "movie"));
    ot.results.forEach((item) => push(item, "tv"));
    merged.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
    const extras: TmdbItem[] = [];
    [
      ...nm.results.map((item) => ({ ...item, media_type: "movie" as const })),
      ...nt.results.map((item) => ({ ...item, media_type: "tv" as const })),
    ].forEach((item) => {
      const key = `${kindOf(item)}:${item.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      extras.push(item);
    });
    extras.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
    return byCatalogRank([...merged, ...extras]).slice(0, 20);
  },
  imdbChart: async (kind: MediaType, page = 1): Promise<TmdbPage<TmdbItem>> => {
    try {
      const ids = await chartIds(kind);
      const size = 20;
      const slice = ids.slice((page - 1) * size, page * size);
      const found = await Promise.all(
        slice.map(async (imdbId) => {
          const hit = await tmdb.find(imdbId);
          const row = kind === "tv" ? hit.tv_results[0] : hit.movie_results[0];
          if (!row) return null;
          const item: TmdbItem = { ...row, media_type: kind };
          return item;
        }),
      );
      const results = found.filter((item): item is TmdbItem => item !== null);
      return {
        page,
        results,
        total_pages: Math.max(1, Math.ceil(ids.length / size)),
        total_results: ids.length,
      };
    } catch {
      throw new Error("IMDb-подборка временно недоступна");
    }
  },
};
