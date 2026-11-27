import { tmdb, type MediaType, type TmdbItem, type TmdbPage } from "./tmdb";

/**
 * Shelves on the home screen: genres (фантастика, комедії, серіали…) and
 * themes that are less obvious (hidden gems, under 90 minutes, time travel,
 * Korean cinema…). Each is a TMDB discover query; "Усі" opens it as a feed.
 */
type Shelf = {
  id: string;
  title: string;
  type: MediaType;
  /** Genres rows are ordered by taste; themes take turns between them. */
  kind: "genre" | "theme";
  /** TMDB genre ids the shelf is about: used to order by taste. */
  genres?: readonly number[];
  params: Readonly<Record<string, string | number>>;
};

const POPULAR_GOOD = {
  sort_by: "popularity.desc",
  "vote_count.gte": 300,
  "vote_average.gte": 6.8,
} as const;

const TV_GOOD = {
  sort_by: "popularity.desc",
  "vote_count.gte": 150,
  "vote_average.gte": 7.2,
} as const;

export const SHELVES = [
  // Genres: films.
  {
    id: "g-scifi",
    title: "Фантастика",
    type: "movie",
    kind: "genre",
    genres: [878],
    params: { ...POPULAR_GOOD, with_genres: "878" },
  },
  {
    id: "g-comedy",
    title: "Комедії",
    type: "movie",
    kind: "genre",
    genres: [35],
    params: { ...POPULAR_GOOD, with_genres: "35" },
  },
  {
    id: "g-thriller",
    title: "Трилери й детективи",
    type: "movie",
    kind: "genre",
    genres: [53, 80, 9648],
    params: { ...POPULAR_GOOD, with_genres: "53|80|9648" },
  },
  {
    id: "g-action",
    title: "Бойовики й пригоди",
    type: "movie",
    kind: "genre",
    genres: [28, 12],
    params: { ...POPULAR_GOOD, with_genres: "28|12" },
  },
  {
    id: "g-horror",
    title: "Жахи",
    type: "movie",
    kind: "genre",
    genres: [27],
    params: { ...POPULAR_GOOD, "vote_average.gte": 6.4, with_genres: "27" },
  },
  {
    id: "g-drama",
    title: "Драми, що чіпляють",
    type: "movie",
    kind: "genre",
    genres: [18],
    params: { ...POPULAR_GOOD, "vote_average.gte": 7.4, with_genres: "18" },
  },
  {
    id: "g-animation",
    title: "Анімація",
    type: "movie",
    kind: "genre",
    genres: [16],
    params: { ...POPULAR_GOOD, with_genres: "16" },
  },
  {
    id: "g-docs",
    title: "Документальні",
    type: "movie",
    kind: "genre",
    genres: [99],
    params: {
      sort_by: "popularity.desc",
      "vote_count.gte": 80,
      "vote_average.gte": 7.2,
      with_genres: "99",
    },
  },
  // Genres: series.
  {
    id: "tv-scifi",
    title: "Фантастичні серіали",
    type: "tv",
    kind: "genre",
    genres: [10765],
    params: { ...TV_GOOD, with_genres: "10765" },
  },
  {
    id: "tv-comedy",
    title: "Комедійні серіали",
    type: "tv",
    kind: "genre",
    genres: [35],
    params: { ...TV_GOOD, with_genres: "35" },
  },
  {
    id: "tv-crime",
    title: "Кримінальні серіали",
    type: "tv",
    kind: "genre",
    genres: [80, 9648],
    params: { ...TV_GOOD, with_genres: "80|9648" },
  },
  {
    id: "tv-drama",
    title: "Драматичні серіали",
    type: "tv",
    kind: "genre",
    genres: [18],
    params: { ...TV_GOOD, "vote_average.gte": 7.8, with_genres: "18" },
  },
  // Themes: the less obvious ones.
  {
    id: "t-gems",
    title: "Приховані перлини",
    type: "movie",
    kind: "theme",
    params: {
      sort_by: "vote_average.desc",
      "vote_average.gte": 7.6,
      "vote_count.gte": 200,
      "vote_count.lte": 1500,
      "primary_release_date.gte": "1990-01-01",
    },
  },
  {
    id: "t-short",
    title: "Коротко й влучно: до 90 хвилин",
    type: "movie",
    kind: "theme",
    params: {
      sort_by: "popularity.desc",
      "with_runtime.gte": 60,
      "with_runtime.lte": 90,
      "vote_average.gte": 7,
      "vote_count.gte": 500,
    },
  },
  {
    id: "t-mini",
    title: "Мінісеріали на вихідні",
    type: "tv",
    kind: "theme",
    params: {
      sort_by: "popularity.desc",
      with_type: 2,
      "vote_average.gte": 7.4,
      "vote_count.gte": 100,
    },
  },
  {
    id: "t-time",
    title: "Подорожі в часі",
    type: "movie",
    kind: "theme",
    params: {
      sort_by: "popularity.desc",
      with_keywords: 4379,
      "vote_count.gte": 300,
      "vote_average.gte": 6.5,
    },
  },
  {
    id: "t-true",
    title: "На реальних подіях",
    type: "movie",
    kind: "theme",
    params: {
      sort_by: "popularity.desc",
      with_keywords: 9672,
      "vote_count.gte": 500,
      "vote_average.gte": 7,
    },
  },
  {
    id: "t-dystopia",
    title: "Антиутопії",
    type: "movie",
    kind: "theme",
    params: {
      sort_by: "popularity.desc",
      with_keywords: 4565,
      "vote_count.gte": 300,
      "vote_average.gte": 6.5,
    },
  },
  {
    id: "t-epic",
    title: "Довгі й епічні: понад 2,5 години",
    type: "movie",
    kind: "theme",
    params: {
      sort_by: "popularity.desc",
      "with_runtime.gte": 150,
      "vote_average.gte": 7.5,
      "vote_count.gte": 1000,
    },
  },
  {
    id: "t-cult",
    title: "Культове кіно 80-х і 90-х",
    type: "movie",
    kind: "theme",
    params: {
      sort_by: "vote_average.desc",
      "primary_release_date.gte": "1980-01-01",
      "primary_release_date.lte": "1999-12-31",
      "vote_count.gte": 3000,
    },
  },
  {
    id: "t-korea",
    title: "Корейська хвиля",
    type: "movie",
    kind: "theme",
    params: {
      sort_by: "popularity.desc",
      with_original_language: "ko",
      "vote_average.gte": 7,
      "vote_count.gte": 200,
    },
  },
  {
    id: "t-anime",
    title: "Аніме-серіали",
    type: "tv",
    kind: "theme",
    params: {
      sort_by: "popularity.desc",
      with_genres: "16",
      with_original_language: "ja",
      "vote_average.gte": 7.5,
      "vote_count.gte": 200,
    },
  },
  {
    id: "t-nordic",
    title: "Скандинавський нуар",
    type: "tv",
    kind: "theme",
    params: {
      sort_by: "popularity.desc",
      with_genres: "80|9648",
      with_original_language: "sv|da|no|is|fi",
      "vote_count.gte": 30,
    },
  },
  {
    id: "t-ukraine",
    title: "Українське кіно",
    type: "movie",
    kind: "theme",
    params: {
      sort_by: "popularity.desc",
      with_origin_country: "UA",
      "vote_count.gte": 20,
    },
  },
] as const satisfies readonly Shelf[];

export type ShelfId = (typeof SHELVES)[number]["id"];
export type ShelfMeta = (typeof SHELVES)[number];

export function shelfById(id: string): Shelf | undefined {
  return SHELVES.find((s) => s.id === id);
}

export async function loadShelf(
  id: ShelfId,
  page = 1,
): Promise<TmdbPage<TmdbItem>> {
  const shelf = shelfById(id)!;
  const data = await tmdb.discoverRaw(
    shelf.type,
    { ...shelf.params, page },
    page === 1 ? "low" : "normal",
  );
  return {
    ...data,
    results: data.results.filter((x) => x.poster_path),
  };
}

export type GenreWeights = Record<MediaType, Record<number, number>>;

/**
 * Genres the user likes first (by weights from their recommendations); a
 * theme after every two genres, a different theme leading each day.
 */
export function shelfOrder(
  weights: GenreWeights | null | undefined,
  day = Math.floor(Date.now() / 86400_000),
): ShelfMeta[] {
  const score = (s: ShelfMeta) =>
    ((s as Shelf).genres ?? []).reduce(
      (sum, g) => sum + (weights?.[s.type][g] ?? 0),
      0,
    );
  const genres = SHELVES.filter((s) => s.kind === "genre")
    .map((s, i) => ({ s, i, score: score(s) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.s);
  const all: ShelfMeta[] = SHELVES.filter((s) => s.kind === "theme");
  const start = ((day % all.length) + all.length) % all.length;
  const themes = [...all.slice(start), ...all.slice(0, start)];
  const out: ShelfMeta[] = [];
  while (genres.length || themes.length) {
    out.push(...genres.splice(0, 2));
    if (themes.length) out.push(themes.shift()!);
  }
  return out;
}
