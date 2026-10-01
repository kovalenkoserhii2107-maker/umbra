import type { LibraryItem } from "./library";
import { metaKey, watchedMinutes, type MetaMap } from "./meta";
import { yearOfItem } from "./collection";

/** One row of a breakdown; `items` are the titles behind the number. */
export type Bar = {
  label: string;
  value: number;
  extra?: string;
  items?: LibraryItem[];
};

export type Stats = {
  movies: number;
  shows: number;
  hours: number;
  average: number | null;
  watchlist: number;
  watching: number;
  ratings: Bar[];
  genres: Bar[];
  decades: Bar[];
  best: LibraryItem[];
};

/** "средняя 8,5" for the rated ones, or nothing. */
export function averageLabel(list: Array<{ rating: number | null }>) {
  const rated = list.filter((x) => x.rating !== null);
  if (!rated.length) return undefined;
  const avg = rated.reduce((s, x) => s + x.rating!, 0) / rated.length;
  return `средняя ${avg.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

/** Years in which something was marked as seen, newest first. */
export function statYears(items: LibraryItem[]) {
  const years = new Set(
    items
      .filter((x) => x.status !== "watchlist" && x.updatedAt)
      .map((x) => new Date(x.updatedAt).getFullYear()),
  );
  return [...years].sort((a, b) => b - a);
}

/**
 * Viewing stats for all time or for one year. The library keeps no separate
 * "watched on" date, so a year counts titles by the time they were last marked.
 */
export function computeStats(
  all: LibraryItem[],
  meta: MetaMap,
  year: number | null,
): Stats {
  const inPeriod = (x: LibraryItem) =>
    year === null ||
    (x.updatedAt && new Date(x.updatedAt).getFullYear() === year);
  const seen = all.filter((x) => x.status !== "watchlist" && inPeriod(x));
  const done = seen.filter((x) => x.status === "watched");
  const rated = seen.filter((x) => x.rating !== null);
  const minutes = seen.reduce(
    (sum, x) => sum + watchedMinutes(x, meta[metaKey(x)]),
    0,
  );

  // Highest score first: that is how people read their own ratings.
  const ratings: Bar[] = Array.from({ length: 10 }, (_, i) => {
    const items = rated.filter((x) => x.rating === 10 - i);
    return { label: String(10 - i), value: items.length, items };
  });

  const genreRows = new Map<string, LibraryItem[]>();
  for (const x of seen)
    for (const g of meta[metaKey(x)]?.genres || [])
      genreRows.set(g, [...(genreRows.get(g) || []), x]);
  const genres = [...genreRows.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ru"))
    .slice(0, 8)
    .map(([label, items]) => ({
      label,
      value: items.length,
      extra: averageLabel(items),
      items,
    }));

  const decadeRows = new Map<number, LibraryItem[]>();
  for (const x of seen) {
    const y = yearOfItem(x, meta);
    if (!y) continue;
    const d = Math.floor(y / 10) * 10;
    decadeRows.set(d, [...(decadeRows.get(d) || []), x]);
  }
  const decades = [...decadeRows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([d, items]) => ({ label: `${d}-е`, value: items.length, items }));

  return {
    movies: done.filter((x) => x.type === "movie").length,
    shows: seen.filter((x) => x.type === "tv").length,
    hours: Math.round(minutes / 60),
    average: rated.length
      ? Math.round(
          (rated.reduce((s, x) => s + x.rating!, 0) / rated.length) * 10,
        ) / 10
      : null,
    watchlist: all.filter((x) => x.status === "watchlist").length,
    watching: all.filter((x) => x.status === "watching").length,
    ratings,
    genres,
    decades,
    best: [...rated]
      .sort((a, b) => b.rating! - a.rating! || b.updatedAt - a.updatedAt)
      .slice(0, 6),
  };
}
