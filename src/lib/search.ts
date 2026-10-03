import { kindOf, titleOf, type MediaType, type TmdbItem } from "./tmdb";
import { byCatalogRank, catalogBand } from "./rank";

export const SEARCH_GENRES = [
  { id: 28, label: "Боевик" },
  { id: 12, label: "Приключения" },
  { id: 16, label: "Анимация" },
  { id: 35, label: "Комедия" },
  { id: 80, label: "Криминал" },
  { id: 99, label: "Док" },
  { id: 18, label: "Драма" },
  { id: 10751, label: "Семья" },
  { id: 14, label: "Фэнтези" },
  { id: 27, label: "Ужасы" },
  { id: 9648, label: "Детектив" },
  { id: 10749, label: "Мелодрама" },
  { id: 878, label: "Фантастика" },
  { id: 53, label: "Триллер" },
  { id: 10752, label: "Война" },
] as const;

export type SearchKind = "all" | MediaType;
export type SearchSort = "relevance" | "popular" | "rating" | "year";
export type Era =
  "" | "new" | "2020" | "2010" | "2000" | "1990" | "1980" | "classic";
export type Runtime = "" | "short" | "mid" | "long";
export type Fame = "" | "famous" | "gems";
export type MineFilter = "" | "unseen" | "watchlist" | "seen";

export type SearchFilters = {
  kind: SearchKind;
  sort: SearchSort;
  minScore: number;
  /** Any of these genres. */
  genres: number[];
  /** None of these genres. */
  without: number[];
  era: Era;
  /** An exact year; wins over the era. */
  year: string;
  /** Original language, e.g. "ko". */
  lang: string;
  /** Catalog only: TMDB knows running times there. */
  runtime: Runtime;
  fame: Fame;
  mine: MineFilter;
  /** Catalog only: streaming on my services in my country. */
  services: boolean;
};

export const defaultFilters: SearchFilters = {
  kind: "all",
  sort: "relevance",
  minScore: 0,
  genres: [],
  without: [],
  era: "",
  year: "",
  lang: "",
  runtime: "",
  fame: "",
  mine: "",
  services: false,
};

export const ERAS: Array<[Era, string]> = [
  ["new", "Новинки года"],
  ["2020", "2020-е"],
  ["2010", "2010-е"],
  ["2000", "2000-е"],
  ["1990", "90-е"],
  ["1980", "80-е"],
  ["classic", "Классика до 2000"],
];

export const RUNTIMES: Array<[Runtime, string]> = [
  ["short", "До 1,5 часа"],
  ["mid", "1,5–2 часа"],
  ["long", "Больше 2 часов"],
];

export const FAMES: Array<[Fame, string]> = [
  ["famous", "Известные"],
  ["gems", "Малоизвестные"],
];

export const MINE: Array<[MineFilter, string]> = [
  ["unseen", "Не смотрел"],
  ["watchlist", "Хочу посмотреть"],
  ["seen", "Уже смотрел"],
];

export const LANGUAGES: Array<[string, string]> = [
  ["en", "Английский"],
  ["ru", "Русский"],
  ["uk", "Украинский"],
  ["ko", "Корейский"],
  ["ja", "Японский"],
  ["fr", "Французский"],
  ["es", "Испанский"],
  ["de", "Немецкий"],
  ["it", "Итальянский"],
  ["tr", "Турецкий"],
  ["zh", "Китайский"],
  ["hi", "Индийский"],
];

export const SCORE_STEPS = [6, 7, 7.5, 8];

/** Ready-made combinations, one tap each. */
export const PRESETS: Array<{
  id: string;
  label: string;
  filters: Partial<SearchFilters>;
}> = [
  {
    id: "gems",
    label: "Скрытые жемчужины",
    filters: { fame: "gems", minScore: 7, sort: "rating" },
  },
  {
    id: "classic",
    label: "Классика",
    filters: { era: "classic", minScore: 7.5, fame: "famous", sort: "rating" },
  },
  {
    id: "fresh",
    label: "Свежее и хорошее",
    filters: { era: "new", minScore: 7, sort: "popular" },
  },
  {
    id: "short",
    label: "Короткий вечер",
    filters: { kind: "movie", runtime: "short", minScore: 6.5 },
  },
  {
    id: "family",
    label: "Для семьи",
    filters: { genres: [10751, 16], without: [27, 53, 80] },
  },
  {
    id: "unseen",
    label: "Лучшее, что я не видел",
    filters: { mine: "unseen", minScore: 8, fame: "famous", sort: "rating" },
  },
  {
    id: "mine",
    label: "На моих сервисах",
    filters: { services: true, minScore: 7, sort: "popular" },
  },
];

/** Series use their own ids for a few genres. */
export const TV_GENRE: Record<number, number> = {
  28: 10759,
  12: 10759,
  878: 10765,
  14: 10765,
  10752: 10768,
};

/** Genre ids to ask TMDB for, per media type. */
export function genreIds(ids: number[], type: MediaType) {
  return [
    ...new Set(ids.map((id) => (type === "tv" ? (TV_GENRE[id] ?? id) : id))),
  ];
}

/** [from, to] years of the era, or of the exact year. */
export function yearRange(f: Pick<SearchFilters, "era" | "year">) {
  const now = new Date().getFullYear();
  if (f.year) return [Number(f.year), Number(f.year)] as const;
  switch (f.era) {
    case "new":
      return [now - 1, now] as const;
    case "classic":
      return [1900, 1999] as const;
    case "":
      return null;
    default:
      return [Number(f.era), Number(f.era) + 9] as const;
  }
}

export const RUNTIME_RANGE: Record<Exclude<Runtime, "">, [number, number]> = {
  short: [0, 90],
  mid: [90, 120],
  long: [120, 600],
};

/** How many filters differ from the defaults (the tab is not a filter). */
export function countFilters(f: SearchFilters) {
  return [
    f.sort !== "relevance",
    f.minScore > 0,
    f.genres.length > 0,
    f.without.length > 0,
    Boolean(f.era || f.year),
    Boolean(f.lang),
    Boolean(f.runtime),
    Boolean(f.fame),
    Boolean(f.mine),
    f.services,
  ].filter(Boolean).length;
}

const list = (v: string | null) =>
  (v || "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

const pick = <T extends string>(v: string | null, ok: readonly T[], or: T) =>
  ok.includes(v as T) ? (v as T) : or;

/** Filters live in the address, so "back" from a title keeps them. */
export function filtersFromParams(p: URLSearchParams): SearchFilters {
  const tab = p.get("tab");
  return {
    kind: tab === "movie" || tab === "tv" ? tab : "all",
    sort: pick(
      p.get("sort"),
      ["relevance", "popular", "rating", "year"],
      "relevance",
    ),
    minScore: SCORE_STEPS.includes(Number(p.get("score")))
      ? Number(p.get("score"))
      : 0,
    genres: list(p.get("g")),
    without: list(p.get("x")),
    era: pick(
      p.get("era"),
      ERAS.map(([id]) => id),
      "",
    ),
    year: /^(19|20)\d{2}$/.test(p.get("year") || "") ? p.get("year")! : "",
    lang: LANGUAGES.some(([id]) => id === p.get("lang")) ? p.get("lang")! : "",
    runtime: pick(
      p.get("len"),
      RUNTIMES.map(([id]) => id),
      "",
    ),
    fame: pick(
      p.get("pop"),
      FAMES.map(([id]) => id),
      "",
    ),
    mine: pick(
      p.get("mine"),
      MINE.map(([id]) => id),
      "",
    ),
    services: p.get("svc") === "1",
  };
}

export function filtersToParams(f: SearchFilters, base: URLSearchParams) {
  const p = new URLSearchParams(base);
  const set = (k: string, v: string) => (v ? p.set(k, v) : p.delete(k));
  set("sort", f.sort === "relevance" ? "" : f.sort);
  set("score", f.minScore ? String(f.minScore) : "");
  set("g", f.genres.join(","));
  set("x", f.without.join(","));
  set("era", f.era);
  set("year", f.year);
  set("lang", f.lang);
  set("len", f.runtime);
  set("pop", f.fame);
  set("mine", f.mine);
  set("svc", f.services ? "1" : "");
  return p;
}

function fold(value: string) {
  return value
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function yearOfItem(item: TmdbItem) {
  return (
    Number((item.release_date || item.first_air_date || "").slice(0, 4)) || 0
  );
}

export function relevanceScore(item: TmdbItem, query: string) {
  const q = fold(query);
  const title = fold(titleOf(item));
  const original = fold(item.original_title || item.original_name || "");
  let score = Math.log10((item.popularity || 1) + 1) * 12;
  const votes = item.vote_count || 0;
  const rating = item.vote_average || 0;
  score += rating * Math.min(1, votes / 250) * 6;
  if (item.poster_path) score += 4;
  const year = yearOfItem(item);
  if (year >= new Date().getFullYear() - 2) score += 3;
  const band = catalogBand(item);
  if (band === 3) score -= 24;
  else if (band === 2) score -= 10;

  if (q) {
    if (title === q || original === q) score += 120;
    else if (title.startsWith(q) || original.startsWith(q)) score += 70;
    else if (title.includes(q) || original.includes(q)) score += 40;
    else {
      const parts = q.split(" ").filter(Boolean);
      const hits = parts.filter(
        (part) => title.includes(part) || original.includes(part),
      ).length;
      score += hits * 10;
    }
  }
  return score;
}

/** Filters and orders loaded results; `status` tells what I have marked. */
export function applySearch(
  items: TmdbItem[],
  query: string,
  filters: SearchFilters,
  status: (item: TmdbItem) => string | undefined = () => undefined,
) {
  const range = yearRange(filters);
  const filtered = items.filter((item) => {
    if (item.media_type === "person") return false;
    const kind = kindOf(item);
    if (filters.kind !== "all" && kind !== filters.kind) return false;
    const year = yearOfItem(item);
    if (range && (!year || year < range[0] || year > range[1])) return false;
    const ids = item.genre_ids || [];
    if (
      filters.genres.length &&
      !genreIds(filters.genres, kind).some((id) => ids.includes(id))
    )
      return false;
    if (genreIds(filters.without, kind).some((id) => ids.includes(id)))
      return false;
    if (filters.minScore && (item.vote_average || 0) < filters.minScore)
      return false;
    const votes = item.vote_count || 0;
    if (filters.fame === "famous" && votes < 1000) return false;
    if (filters.fame === "gems" && (votes < 50 || votes > 2000)) return false;
    if (filters.lang && item.original_language !== filters.lang) return false;
    if (filters.mine) {
      const s = status(item);
      if (filters.mine === "unseen" && s && s !== "watchlist") return false;
      if (filters.mine === "watchlist" && s !== "watchlist") return false;
      if (filters.mine === "seen" && s !== "watched" && s !== "dropped")
        return false;
    }
    return true;
  });

  const copy = filtered.slice();
  if (!query && filters.sort !== "rating" && filters.sort !== "year")
    return byCatalogRank(copy);
  if (filters.sort === "popular")
    copy.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  else if (filters.sort === "rating")
    copy.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
  else if (filters.sort === "year")
    copy.sort((a, b) => yearOfItem(b) - yearOfItem(a));
  else copy.sort((a, b) => relevanceScore(b, query) - relevanceScore(a, query));
  return copy;
}

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = "йцукенгшщзхъфывапролджэячсмитьбюё";

/**
 * The same keys on the other keyboard layout: "ltyf" ↔ "дюна"-style typos.
 * Null when the text has letters of both alphabets or none to switch.
 */
export function switchLayout(text: string) {
  const lower = text.toLowerCase();
  const latin = /[a-z]/.test(lower);
  const cyrillic = /[а-яё]/.test(lower);
  if (latin === cyrillic) return null;
  const [from, to] = latin ? [EN, RU] : [RU, EN];
  let out = "";
  for (const ch of lower) {
    const i = from.indexOf(ch);
    out += i >= 0 ? to[i] : ch;
  }
  return out === lower ? null : out;
}

/** "дюна 2021" → the title and the year to keep. */
export function splitYear(query: string) {
  const m = query.trim().match(/^(.*\S)\s+((?:19|20)\d{2})$/);
  return m ? { text: m[1], year: m[2] } : { text: query.trim(), year: "" };
}

const RECENT = "umbra.recentSearches";

export function recentSearches(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT) || "[]");
    return Array.isArray(list)
      ? list.filter((x): x is string => typeof x === "string").slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

export function rememberSearch(query: string) {
  const q = query.trim();
  if (q.length < 2) return recentSearches();
  const next = [
    q,
    ...recentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase()),
  ].slice(0, 8);
  try {
    localStorage.setItem(RECENT, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}

export function forgetSearches() {
  try {
    localStorage.removeItem(RECENT);
  } catch {
    /* storage unavailable */
  }
}
