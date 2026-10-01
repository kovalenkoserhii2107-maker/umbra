import type { LibraryItem } from "./library";
import { plural } from "./format";
import {
  tmdb,
  type MovieReleases,
  type ShowAirDates,
  type TmdbItem,
} from "./tmdb";

/** Show watchlist titles that come out within a week or came out within a week. */
export const DAYS_AHEAD = 7;
export const DAYS_BEHIND = 7;
const MAX_LOOKUPS = 80;
// TMDB release types: limited theatrical, theatrical, digital and TV.
const PUBLIC_RELEASES = new Set([2, 3, 4, 6]);

export type Release = {
  item: LibraryItem;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  kind: "movie" | "series" | "season";
  season?: number;
  /** TMDB details used for the date; carry the backdrop for the home spotlight. */
  details?: TmdbItem;
};

export function localIso(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayNumber(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400_000;
}

/** Calendar days from `today` to `date`; negative for past dates. */
export function daysUntil(date: string, today: string) {
  return Math.round(dayNumber(date) - dayNumber(today));
}

/** "сегодня", "завтра", "через 3 дня", "вчера", "5 дней назад". */
export function relativeDay(date: string, today: string) {
  const days = daysUntil(date, today);
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  if (days === -1) return "вчера";
  const n = Math.abs(days);
  const span = `${n} ${plural(n, "день", "дня", "дней")}`;
  return days > 0 ? `через ${span}` : `${span} назад`;
}

export function inReleaseWindow(
  date: string | null | undefined,
  today: string,
) {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return false;
  const diff = daysUntil(date.slice(0, 10), today);
  return diff >= -DAYS_BEHIND && diff <= DAYS_AHEAD;
}

/** The first public release in the viewer's region, else TMDB's primary date. */
export function movieReleaseDate(movie: MovieReleases, region: string) {
  const regional = movie.release_dates?.results
    .find((r) => r.iso_3166_1 === region)
    ?.release_dates.filter((r) => PUBLIC_RELEASES.has(r.type))
    .map((r) => r.release_date.slice(0, 10))
    .sort()[0];
  return regional || movie.release_date?.slice(0, 10) || null;
}

export function showRelease(
  show: ShowAirDates,
  today: string,
): Pick<Release, "date" | "kind" | "season"> | null {
  const premieres = [show.next_episode_to_air, show.last_episode_to_air]
    .filter((ep) => ep && ep.episode_number === 1 && ep.air_date)
    .map((ep) => ({
      date: ep!.air_date!.slice(0, 10),
      kind: ep!.season_number <= 1 ? ("series" as const) : ("season" as const),
      season: ep!.season_number,
    }));
  if (show.first_air_date)
    premieres.push({
      date: show.first_air_date.slice(0, 10),
      kind: "series",
      season: 1,
    });
  return premieres.find((p) => inReleaseWindow(p.date, today)) || null;
}

function mayReleaseNow(item: LibraryItem, today: string) {
  if (item.type === "tv") return true;
  const year = Number(item.year);
  return !year || Math.abs(year - Number(today.slice(0, 4))) <= 1;
}

export async function loadWatchlistReleases(
  items: LibraryItem[],
  region: string,
  today = localIso(new Date()),
): Promise<Release[]> {
  const candidates = items
    .filter((item) => item.status === "watchlist" && mayReleaseNow(item, today))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_LOOKUPS);
  const found = await Promise.all(
    candidates.map(async (item): Promise<Release | null> => {
      try {
        if (item.type === "movie") {
          const details = await tmdb.movieReleases(item.id);
          const date = movieReleaseDate(details, region);
          return date && inReleaseWindow(date, today)
            ? { item, date, kind: "movie", details }
            : null;
        }
        const details = await tmdb.showAirDates(item.id);
        const hit = showRelease(details, today);
        return hit ? { item, ...hit, details } : null;
      } catch {
        return null;
      }
    }),
  );
  return found
    .filter((r): r is Release => r !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}
