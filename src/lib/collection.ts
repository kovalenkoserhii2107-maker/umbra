import type { LibraryItem, Status } from "./library";
import { metaKey, type MetaMap } from "./meta";

export type CollectionFilters = {
  q: string;
  status: "all" | Status;
  type: "all" | "movie" | "tv";
  genre: string;
  rating: "all" | "9" | "7" | "5" | "1" | "none";
  decade: "all" | "2020" | "2010" | "2000" | "1990" | "older";
  sort: "recent" | "rating" | "title" | "newest" | "oldest";
};

export const DEFAULT_FILTERS: CollectionFilters = {
  q: "",
  status: "all",
  type: "all",
  genre: "",
  rating: "all",
  decade: "all",
  sort: "recent",
};

export const RATING_BANDS: Array<{
  id: CollectionFilters["rating"];
  label: string;
  min?: number;
  max?: number;
}> = [
  { id: "all", label: "Любая оценка" },
  { id: "9", label: "9–10", min: 9, max: 10 },
  { id: "7", label: "7–8", min: 7, max: 8 },
  { id: "5", label: "5–6", min: 5, max: 6 },
  { id: "1", label: "1–4", min: 1, max: 4 },
  { id: "none", label: "Без оценки" },
];

export const DECADES: Array<{
  id: CollectionFilters["decade"];
  label: string;
}> = [
  { id: "all", label: "Любые годы" },
  { id: "2020", label: "2020-е" },
  { id: "2010", label: "2010-е" },
  { id: "2000", label: "2000-е" },
  { id: "1990", label: "1990-е" },
  { id: "older", label: "Раньше 1990" },
];

export const SORTS: Array<{ id: CollectionFilters["sort"]; label: string }> = [
  { id: "recent", label: "Недавно изменённые" },
  { id: "rating", label: "По моей оценке" },
  { id: "title", label: "По названию" },
  { id: "newest", label: "Сначала новые" },
  { id: "oldest", label: "Сначала старые" },
];

export function yearOfItem(item: LibraryItem, meta: MetaMap) {
  return Number(meta[metaKey(item)]?.date.slice(0, 4) || item.year) || 0;
}

function inDecade(year: number, decade: CollectionFilters["decade"]) {
  if (decade === "all") return true;
  if (!year) return false;
  if (decade === "older") return year < 1990;
  const start = Number(decade);
  return year >= start && year < start + 10;
}

export function filterCollection(
  items: LibraryItem[],
  f: CollectionFilters,
  meta: MetaMap,
): LibraryItem[] {
  const q = f.q.trim().toLowerCase();
  const band = RATING_BANDS.find((b) => b.id === f.rating);
  const list = items.filter((item) => {
    if (q && !item.title.toLowerCase().includes(q)) return false;
    if (f.status !== "all" && item.status !== f.status) return false;
    if (f.type !== "all" && item.type !== f.type) return false;
    if (f.genre && !meta[metaKey(item)]?.genres.includes(f.genre)) return false;
    if (f.rating === "none" && item.rating !== null) return false;
    if (band?.min !== undefined) {
      if (item.rating === null) return false;
      if (item.rating < band.min || item.rating > band.max!) return false;
    }
    return inDecade(yearOfItem(item, meta), f.decade);
  });
  const year = (item: LibraryItem) => yearOfItem(item, meta);
  return list.sort((a, b) => {
    switch (f.sort) {
      case "rating":
        return (b.rating ?? 0) - (a.rating ?? 0) || b.updatedAt - a.updatedAt;
      case "title":
        return a.title.localeCompare(b.title, "ru");
      case "newest":
        return year(b) - year(a);
      case "oldest":
        return (year(a) || 9999) - (year(b) || 9999);
      default:
        return b.updatedAt - a.updatedAt;
    }
  });
}

/** Genres present in the collection, most frequent first. */
export function genresOf(items: LibraryItem[], meta: MetaMap) {
  const count = new Map<string, number>();
  for (const item of items)
    for (const g of meta[metaKey(item)]?.genres || [])
      count.set(g, (count.get(g) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
}

export function filtersFromParams(params: URLSearchParams): CollectionFilters {
  const pick = <T extends string>(
    key: string,
    allowed: readonly T[],
    fallback: T,
  ) => {
    const v = params.get(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  };
  return {
    q: params.get("q") || "",
    status: pick(
      "status",
      ["all", "watchlist", "watching", "watched", "dropped"],
      "all",
    ),
    type: pick("type", ["all", "movie", "tv"], "all"),
    genre: params.get("genre") || "",
    rating: pick(
      "rating",
      RATING_BANDS.map((b) => b.id),
      "all",
    ),
    decade: pick(
      "decade",
      DECADES.map((d) => d.id),
      "all",
    ),
    sort: pick(
      "sort",
      SORTS.map((s) => s.id),
      "recent",
    ),
  };
}

export function paramsFromFilters(f: CollectionFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(f))
    if (value && value !== DEFAULT_FILTERS[key as keyof CollectionFilters])
      params.set(key, value);
  return params;
}
