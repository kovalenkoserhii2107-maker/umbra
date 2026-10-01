import type { LibraryItem } from "./library";
import { tmdb, type AirDate } from "./tmdb";

/** The last watched episode; everything before it counts as watched too. */
export type Episode = { season: number; episode: number };
export type SeasonCount = { season_number: number; episode_count: number };

export function progressOf(
  item?: Pick<LibraryItem, "season" | "episode"> | null,
): Episode | null {
  if (!item?.season || !item.episode) return null;
  return { season: item.season, episode: item.episode };
}

export function compareEpisodes(a: Episode, b: Episode) {
  return a.season - b.season || a.episode - b.episode;
}

export function isWatched(progress: Episode | null, ep: Episode) {
  return Boolean(progress && compareEpisodes(ep, progress) <= 0);
}

function regular(seasons: SeasonCount[]) {
  return seasons
    .filter((s) => s.season_number > 0 && s.episode_count > 0)
    .sort((a, b) => a.season_number - b.season_number);
}

/** The episode right before `ep`, or season 0 episode 0 when none is left. */
export function previousEpisode(ep: Episode, seasons: SeasonCount[]): Episode {
  if (ep.episode > 1) return { season: ep.season, episode: ep.episode - 1 };
  const before = regular(seasons).filter((s) => s.season_number < ep.season);
  const last = before[before.length - 1];
  return last
    ? { season: last.season_number, episode: last.episode_count }
    : { season: 0, episode: 0 };
}

export function nextEpisode(
  progress: Episode | null,
  seasons: SeasonCount[],
): Episode | null {
  const list = regular(seasons);
  if (!progress)
    return list[0] ? { season: list[0].season_number, episode: 1 } : null;
  const current = list.find((s) => s.season_number === progress.season);
  if (current && progress.episode < current.episode_count)
    return { season: progress.season, episode: progress.episode + 1 };
  const after = list.find((s) => s.season_number > progress.season);
  return after ? { season: after.season_number, episode: 1 } : null;
}

export function episodeLabel(ep: Episode) {
  return `S${ep.season}E${ep.episode}`;
}

export type ContinueItem = {
  item: LibraryItem;
  next: Episode | null;
  /** The next episode has aired and can be watched now. */
  available: boolean;
  /** Air date of the next episode when it has not aired yet. */
  date?: string;
};

function aired(ep: Episode, last?: AirDate | null) {
  return Boolean(
    last &&
    compareEpisodes(ep, {
      season: last.season_number,
      episode: last.episode_number,
    }) <= 0,
  );
}

export function continueState(
  item: LibraryItem,
  show: {
    seasons?: SeasonCount[];
    last_episode_to_air?: AirDate | null;
    next_episode_to_air?: AirDate | null;
  },
): ContinueItem {
  const next = nextEpisode(progressOf(item), show.seasons ?? []);
  if (next && aired(next, show.last_episode_to_air))
    return { item, next, available: true };
  const upcoming = show.next_episode_to_air;
  const waiting = upcoming
    ? { season: upcoming.season_number, episode: upcoming.episode_number }
    : next;
  return {
    item,
    next: waiting,
    available: false,
    date: upcoming?.air_date?.slice(0, 10) || undefined,
  };
}

export type ShowInfo = Parameters<typeof continueState>[1];

/** Air dates of the shows being watched, keyed by TMDB ID. */
export async function loadWatchingShows(
  items: LibraryItem[],
): Promise<Record<number, ShowInfo>> {
  const shows = items
    .filter((x) => x.type === "tv" && x.status === "watching")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 40);
  const rows = await Promise.all(
    shows.map(async (item) => {
      try {
        return [item.id, await tmdb.showAirDates(item.id)] as const;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(rows.filter((r) => r !== null));
}

/** Computed from the live library so marking an episode updates at once. */
export function continueWatching(
  items: LibraryItem[],
  shows: Record<number, ShowInfo>,
): ContinueItem[] {
  return items
    .filter((x) => x.type === "tv" && x.status === "watching" && shows[x.id])
    .map((item) => continueState(item, shows[item.id]))
    .sort(
      // Watchable now first (most recently touched first), then by air date.
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        (a.available
          ? b.item.updatedAt - a.item.updatedAt
          : (a.date || "9999").localeCompare(b.date || "9999")),
    );
}
