import type { LibraryItem } from "./library";
import { daysUntil, localIso, relativeDay, type Release } from "./releases";
import { tmdb, type AirDate, type MediaType, type TmdbItem } from "./tmdb";
import { dayMonthLabel } from "./format";

/** A new episode counts as news from 3 days before today to 1 day after. */
export const EPISODE_DAYS_BEHIND = 3;
export const EPISODE_DAYS_AHEAD = 1;
const MAX_SHOWS = 40;

export type NewEpisode = {
  item: LibraryItem;
  date: string;
  season: number;
  episode: number;
  details: TmdbItem;
};

export type Spotlight = {
  reason: "episode" | "release" | "recommendation" | "popular";
  media: MediaType;
  item: TmdbItem;
  /** Short line above the title: why this title is shown. */
  kicker: string;
  /** Optional line under the title. */
  note?: string;
};

function episodeInWindow(ep: AirDate | null | undefined, today: string) {
  if (!ep?.air_date) return false;
  const days = daysUntil(ep.air_date.slice(0, 10), today);
  return days >= -EPISODE_DAYS_BEHIND && days <= EPISODE_DAYS_AHEAD;
}

/** Series the user already follows that got (or are about to get) an episode. */
export async function loadNewEpisodes(
  items: LibraryItem[],
  today = localIso(new Date()),
): Promise<NewEpisode[]> {
  const shows = items
    .filter(
      (x) =>
        x.type === "tv" && (x.status === "watched" || x.status === "watching"),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SHOWS);
  const found = await Promise.all(
    shows.map(async (item): Promise<NewEpisode | null> => {
      try {
        const details = await tmdb.showAirDates(item.id);
        // Prefer an episode that can already be watched.
        const ep = [details.last_episode_to_air, details.next_episode_to_air]
          .filter((x) => episodeInWindow(x, today))
          .shift();
        if (!ep?.air_date) return null;
        return {
          item,
          date: ep.air_date.slice(0, 10),
          season: ep.season_number,
          episode: ep.episode_number,
          details,
        };
      } catch {
        return null;
      }
    }),
  );
  return found
    .filter((x): x is NewEpisode => x !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** The title recommendations are based on: best rated, then most recent. */
export function tasteSeed(items: LibraryItem[]): LibraryItem | undefined {
  const watched = items
    .filter((x) => x.status === "watched")
    .sort(
      (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.updatedAt - a.updatedAt,
    );
  if (watched.length) return watched[0];
  return [...items]
    .filter((x) => x.status === "watchlist" || x.status === "watching")
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

function closestRelease(releases: Release[], today: string) {
  return [...releases].sort((a, b) => {
    const da = daysUntil(a.date, today);
    const db = daysUntil(b.date, today);
    // Nearest to today first; on a tie the upcoming one wins.
    return Math.abs(da) - Math.abs(db) || db - da;
  })[0];
}

function fromLibrary(item: LibraryItem, details?: TmdbItem): TmdbItem {
  return {
    ...details,
    id: item.id,
    title: item.type === "movie" ? item.title : undefined,
    name: item.type === "tv" ? item.title : undefined,
    media_type: item.type,
  };
}

export function pickSpotlight({
  episodes,
  releases,
  recommendations,
  popular,
  seed,
  library,
  today = localIso(new Date()),
}: {
  episodes: NewEpisode[];
  releases: Release[];
  recommendations: TmdbItem[];
  popular: TmdbItem[];
  seed?: LibraryItem;
  library: LibraryItem[];
  today?: string;
}): Spotlight | null {
  // Watchlist releases come first so they stay at the very top of the feed.
  const release = closestRelease(releases, today);
  if (release) {
    return {
      reason: "release",
      media: release.item.type,
      item: fromLibrary(release.item, release.details),
      kicker: "Из «Хочу посмотреть»",
      note: `${
        release.kind === "season"
          ? `Сезон ${release.season}`
          : daysUntil(release.date, today) >= 0
            ? "Выход"
            : "Вышел"
      } ${dayMonthLabel(release.date)} · ${relativeDay(release.date, today)}`,
    };
  }
  const episode = episodes[0];
  if (episode) {
    const premiere = episode.episode === 1;
    return {
      reason: "episode",
      media: "tv",
      item: fromLibrary(episode.item, episode.details),
      kicker: `${premiere ? `Новый сезон ${episode.season}` : "Новая серия"} · S${episode.season}E${episode.episode} · ${relativeDay(episode.date, today)}`,
      note: "Сериал из твоей коллекции",
    };
  }
  const owned = new Set(library.map((x) => `${x.type}:${x.id}`));
  const fresh = (list: TmdbItem[], fallback?: MediaType) =>
    list.find(
      (x) =>
        x.media_type !== "person" &&
        (x.backdrop_path || x.poster_path) &&
        !owned.has(`${x.media_type || fallback}:${x.id}`),
    );
  const rec = seed ? fresh(recommendations, seed.type) : undefined;
  if (rec && seed) {
    return {
      reason: "recommendation",
      media: (rec.media_type as MediaType) || seed.type,
      item: rec,
      kicker: "Тебе может понравиться",
      note:
        seed.status === "watched" && seed.rating
          ? `Потому что ты оценил «${seed.title}» на ${seed.rating}/10`
          : `Похоже на «${seed.title}» из твоей коллекции`,
    };
  }
  const hit = fresh(popular);
  if (hit) {
    return {
      reason: "popular",
      media: hit.media_type === "tv" ? "tv" : "movie",
      item: hit,
      kicker: "Популярно на этой неделе",
    };
  }
  return null;
}
