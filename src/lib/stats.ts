import type { LibraryItem } from "./library";
import { metaKey, watchedMinutes, type MetaMap } from "./meta";
import { yearOfItem } from "./collection";

export type Bar = { label: string; value: number; extra?: string };

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

  const ratings: Bar[] = Array.from({ length: 10 }, (_, i) => ({
    label: String(i + 1),
    value: rated.filter((x) => x.rating === i + 1).length,
  }));

  const genreRows = new Map<
    string,
    { n: number; sum: number; rated: number }
  >();
  for (const x of seen)
    for (const g of meta[metaKey(x)]?.genres || []) {
      const row = genreRows.get(g) || { n: 0, sum: 0, rated: 0 };
      row.n++;
      if (x.rating !== null) {
        row.sum += x.rating;
        row.rated++;
      }
      genreRows.set(g, row);
    }
  const genres = [...genreRows.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], "ru"))
    .slice(0, 6)
    .map(([label, r]) => ({
      label,
      value: r.n,
      extra: r.rated ? `средняя ${(r.sum / r.rated).toFixed(1)}` : undefined,
    }));

  const decadeCount = new Map<number, number>();
  for (const x of seen) {
    const y = yearOfItem(x, meta);
    if (y)
      decadeCount.set(
        Math.floor(y / 10) * 10,
        (decadeCount.get(Math.floor(y / 10) * 10) || 0) + 1,
      );
  }
  const decades = [...decadeCount.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([d, value]) => ({ label: `${d}-е`, value }));

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
