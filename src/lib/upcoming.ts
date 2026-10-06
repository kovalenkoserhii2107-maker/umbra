import { dayMonthLabel } from "./format";
import { localIso } from "./releases";
import { tmdb, type TmdbItem, type TmdbPage } from "./tmdb";

/**
 * "Coming soon": the most popular unreleased films and series first. TMDB
 * popularity grows with anticipation, so it ranks premieres that have no
 * votes yet. Every item carries the date to show under its poster.
 */

const DAY = 86400_000;
const ahead = (days: number, from = new Date()) =>
  localIso(new Date(from.getTime() + days * DAY));

/** Without a poster an item is usually a placeholder entry. */
const real = (x: TmdbItem) => Boolean(x.poster_path);

const byPopularity = (a: TmdbItem, b: TmdbItem) =>
  (b.popularity ?? 0) - (a.popularity ?? 0);

/** Films premiering from today to a year ahead, most anticipated first. */
export async function upcomingMovies(
  page = 1,
  today = new Date(),
): Promise<TmdbPage<TmdbItem>> {
  const data = await tmdb.discoverRaw("movie", {
    page,
    sort_by: "popularity.desc",
    "primary_release_date.gte": ahead(0, today),
    "primary_release_date.lte": ahead(365, today),
  });
  return {
    ...data,
    results: data.results
      .filter((x) => real(x) && x.release_date)
      .map((x) => ({ ...x, upcoming_date: x.release_date }))
      .sort(byPopularity),
  };
}

/**
 * Series coming soon: brand-new shows, and new seasons of shows already on
 * the air whose first episode has a date (the details say which season).
 */
export async function upcomingShows(
  page = 1,
  today = new Date(),
): Promise<TmdbPage<TmdbItem>> {
  const from = ahead(0, today);
  const [fresh, returning] = await Promise.all([
    tmdb.discoverRaw("tv", {
      page,
      sort_by: "popularity.desc",
      "first_air_date.gte": from,
      "first_air_date.lte": ahead(365, today),
    }),
    tmdb.discoverRaw("tv", {
      page,
      sort_by: "popularity.desc",
      "first_air_date.lte": ahead(-1, today),
      "air_date.gte": from,
      "air_date.lte": ahead(180, today),
    }),
  ]);

  const newShows = fresh.results
    .filter((x) => real(x) && x.first_air_date)
    .map((x) => ({ ...x, upcoming_date: x.first_air_date }));

  // Shows with any episode ahead: keep those where it opens a new season.
  const seasons = await Promise.all(
    returning.results.filter(real).map(async (x) => {
      const show = await tmdb.showAirDates(x.id).catch(() => null);
      const next = show?.next_episode_to_air;
      if (!next?.air_date || next.episode_number !== 1 || next.air_date < from)
        return null;
      return {
        ...x,
        upcoming_date: next.air_date,
        upcoming_season: next.season_number,
      };
    }),
  );

  const seen = new Set<number>();
  const results = [
    ...newShows,
    ...seasons.filter((x): x is NonNullable<typeof x> => x !== null),
  ]
    .filter((x) => !seen.has(x.id) && seen.add(x.id))
    .sort(byPopularity);
  return {
    page,
    results,
    total_pages: Math.max(fresh.total_pages, returning.total_pages),
    total_results: fresh.total_results + returning.total_results,
  };
}

/** "сегодня", "завтра", "14 ноября", or "3 марта 2027" in another year. */
export function premiereLabel(date: string, today = new Date()) {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const now = localIso(today);
  if (date.slice(0, 10) === now) return "сегодня";
  if (date.slice(0, 10) === ahead(1, today)) return "завтра";
  const day = dayMonthLabel(date);
  return m[1] === now.slice(0, 4) ? day : `${day} ${m[1]}`;
}
