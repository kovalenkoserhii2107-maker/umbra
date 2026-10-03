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

export type SearchFilters = {
  kind: SearchKind;
  year: string;
  genre: number | null;
  minScore: number;
  sort: SearchSort;
};

export const defaultFilters: SearchFilters = {
  kind: "all",
  year: "",
  genre: null,
  minScore: 0,
  sort: "relevance",
};

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

export function applySearch(
  items: TmdbItem[],
  query: string,
  filters: SearchFilters,
) {
  const year = Number(filters.year) || 0;
  const filtered = items.filter((item) => {
    if (item.media_type === "person") return false;
    const kind = kindOf(item);
    if (filters.kind !== "all" && kind !== filters.kind) return false;
    if (year && yearOfItem(item) !== year) return false;
    if (filters.genre && !(item.genre_ids || []).includes(filters.genre))
      return false;
    if (filters.minScore && (item.vote_average || 0) < filters.minScore)
      return false;
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
