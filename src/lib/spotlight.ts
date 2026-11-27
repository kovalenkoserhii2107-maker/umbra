import type { LibraryItem } from "./library";
import { daysUntil, localIso, relativeDay, type Release } from "./releases";
import { tmdb, type AirDate, type MediaType, type TmdbItem } from "./tmdb";
import { dayMonthLabel } from "./format";
import { isWatched, progressOf } from "./tracking";

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
  reason: "for-you" | "episode" | "release" | "recommendation" | "popular";
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

/* ------------------------------------------------------------------ */
/* "Для тебе": a fresh, popular, highly rated title matched to taste.  */
/* ------------------------------------------------------------------ */

/** "New" means released within this many days. */
export const FOR_YOU_DAYS = 365;
export const FOR_YOU_MIN_RATING = 7;
const FOR_YOU_MIN_VOTES = 50;
/** How many of the best candidates take turns in the spotlight. */
export const FOR_YOU_TURNS = 8;
const SEEDS = 3;

export type TasteSeed = {
  type: MediaType;
  id: number;
  title: string;
  rating: number | null;
};

export type ForYou = {
  /** TMDB recommendations for a few titles the user liked. */
  recs: Array<{ seed: TasteSeed; results: TmdbItem[] }>;
  /** Discover: new, popular, rated 7+ in the genres those point to. */
  discovered: TmdbItem[];
};

export type ForYouPick = {
  media: MediaType;
  item: TmdbItem;
  /** The liked title that led to it, when it came from recommendations. */
  because?: TasteSeed;
  score: number;
};

const dayIndex = (today: string) => Math.round(Date.parse(today) / 86400_000);

function shiftIso(today: string, days: number) {
  return new Date(Date.parse(today) + days * 86400_000)
    .toISOString()
    .slice(0, 10);
}

/** A few liked titles to steer the pick; a different few each day. */
export function likedSeeds(items: LibraryItem[], today: string): LibraryItem[] {
  const seen = items.filter(
    (x) => x.status === "watched" || x.status === "watching",
  );
  const liked = seen
    .filter((x) => (x.rating ?? 0) >= 7)
    .sort(
      (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.updatedAt - a.updatedAt,
    );
  const pool = (
    liked.length ? liked : [...seen].sort((a, b) => b.updatedAt - a.updatedAt)
  ).slice(0, 12);
  if (pool.length <= SEEDS) return pool;
  const start = dayIndex(today) % pool.length;
  return Array.from(
    { length: SEEDS },
    (_, i) => pool[(start + i) % pool.length],
  );
}

/** Only what the spotlight and the cards need: keeps the saved copy small. */
function slim(item: TmdbItem, type: MediaType): TmdbItem {
  return {
    id: item.id,
    title: item.title,
    name: item.name,
    poster_path: item.poster_path,
    backdrop_path: item.backdrop_path,
    release_date: item.release_date,
    first_air_date: item.first_air_date,
    vote_average: item.vote_average,
    vote_count: item.vote_count,
    popularity: item.popularity,
    genre_ids: item.genre_ids,
    media_type: (item.media_type as MediaType) || type,
  };
}

/** Genre weights per media type, from what the liked titles point to. */
export function tasteGenres(recs: ForYou["recs"]) {
  const weights: Record<MediaType, Record<number, number>> = {
    movie: {},
    tv: {},
  };
  for (const { seed, results } of recs)
    for (const item of results) {
      const type = (item.media_type as MediaType) || seed.type;
      if (type !== "movie" && type !== "tv") continue;
      for (const g of item.genre_ids ?? [])
        weights[type][g] = (weights[type][g] ?? 0) + 1;
    }
  return weights;
}

const topGenres = (weights: Record<number, number>, n: number) =>
  Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([g]) => Number(g));

export async function loadForYou(
  items: LibraryItem[],
  today = localIso(new Date()),
): Promise<ForYou> {
  const seeds = likedSeeds(items, today);
  const recs = await Promise.all(
    seeds.map(async (x) => {
      const seed: TasteSeed = {
        type: x.type,
        id: x.id,
        title: x.title,
        rating: x.status === "watched" ? x.rating : null,
      };
      try {
        const page = await tmdb.recommendations(x.type, x.id);
        return {
          seed,
          results: page.results.slice(0, 20).map((r) => slim(r, x.type)),
        };
      } catch {
        return { seed, results: [] };
      }
    }),
  );
  const weights = tasteGenres(recs);
  const from = shiftIso(today, -FOR_YOU_DAYS);
  const discovered = await Promise.all(
    (["movie", "tv"] as const).map(async (type) => {
      const genres = topGenres(weights[type], 3);
      if (!genres.length) return [];
      const date = type === "movie" ? "primary_release_date" : "first_air_date";
      try {
        const page = await tmdb.discoverRaw(type, {
          sort_by: "popularity.desc",
          with_genres: genres.join("|"),
          "vote_average.gte": FOR_YOU_MIN_RATING,
          "vote_count.gte": type === "movie" ? 150 : 80,
          [`${date}.gte`]: from,
          [`${date}.lte`]: today,
        });
        return page.results.slice(0, 20).map((r) => slim(r, type));
      } catch {
        return [];
      }
    }),
  );
  return { recs, discovered: discovered.flat() };
}

/**
 * Candidates for "Для тебе", best first: not in the library, released in the
 * last year, rated 7+ by enough people; ranked by how well they match the
 * user's taste, then by rating, popularity and freshness.
 */
export function rankForYou({
  forYou,
  popular,
  library,
  today = localIso(new Date()),
}: {
  forYou?: ForYou | null;
  popular: TmdbItem[];
  library: LibraryItem[];
  today?: string;
}): ForYouPick[] {
  const owned = new Set(library.map((x) => `${x.type}:${x.id}`));
  const found = new Map<
    string,
    { media: MediaType; item: TmdbItem; hits: number; because?: TasteSeed }
  >();
  const add = (item: TmdbItem, fallback: MediaType, seed?: TasteSeed) => {
    const media = (item.media_type || fallback) as MediaType | "person";
    if (media !== "movie" && media !== "tv") return;
    const key = `${media}:${item.id}`;
    const entry = found.get(key) ?? { media, item, hits: 0 };
    if (seed) {
      entry.hits += 1;
      if (!entry.because || (seed.rating ?? 0) > (entry.because.rating ?? 0))
        entry.because = seed;
    }
    found.set(key, entry);
  };
  for (const { seed, results } of forYou?.recs ?? [])
    for (const item of results) add(item, seed.type, seed);
  for (const item of forYou?.discovered ?? []) add(item, "movie");
  for (const item of popular) add(item, "movie");

  const weights = tasteGenres(forYou?.recs ?? []);
  const peak = (type: MediaType) =>
    Math.max(1, ...Object.values(weights[type]));

  const picks: ForYouPick[] = [];
  for (const [key, { media, item, hits, because }] of found) {
    if (owned.has(key) || !item.backdrop_path) continue;
    const date = (item.release_date || item.first_air_date || "").slice(0, 10);
    if (!date) continue;
    const age = -daysUntil(date, today);
    if (age < 0 || age > FOR_YOU_DAYS) continue;
    const vote = item.vote_average ?? 0;
    if (vote < FOR_YOU_MIN_RATING || (item.vote_count ?? 0) < FOR_YOU_MIN_VOTES)
      continue;
    const genres = item.genre_ids ?? [];
    const match = genres.length
      ? genres.reduce((sum, g) => sum + (weights[media][g] ?? 0), 0) /
        genres.length /
        peak(media)
      : 0;
    const score =
      hits * 1.5 +
      match * 2 +
      (vote - FOR_YOU_MIN_RATING) * 0.8 +
      Math.log10(1 + (item.popularity ?? 0)) * 0.5 +
      (1 - age / FOR_YOU_DAYS) * 0.5;
    picks.push({ media, item, because, score });
  }
  return picks.sort((a, b) => b.score - a.score);
}

export const pickKey = (p: { media: MediaType; item: { id: number } }) =>
  `${p.media}:${p.item.id}`;

/**
 * Puts the title to show first. The best few take turns: the one picked
 * earlier this visit stays, otherwise the best one not shown lately.
 */
export function takeTurns(
  picks: ForYouPick[],
  memory: { keep?: string | null; recent: string[] },
): ForYouPick[] {
  const turns = picks.slice(0, FOR_YOU_TURNS);
  if (!turns.length) return picks;
  const kept = turns.find((p) => pickKey(p) === memory.keep);
  const unseen = turns.find((p) => !memory.recent.includes(pickKey(p)));
  // Everything shown lately: the one shown longest ago.
  const oldest = [...turns].sort(
    (a, b) =>
      memory.recent.indexOf(pickKey(b)) - memory.recent.indexOf(pickKey(a)),
  )[0];
  const first = kept ?? unseen ?? oldest;
  return [first, ...picks.filter((p) => p !== first)];
}

const NOW_KEY = "umbra:spotlight:now";
const RECENT_KEY = "umbra:spotlight:recent";

/** What the spotlight showed: this visit (session) and the last few visits. */
export const spotlightMemory = {
  read(): { keep: string | null; recent: string[] } {
    let keep: string | null = null;
    let recent: string[] = [];
    try {
      keep = sessionStorage.getItem(NOW_KEY);
    } catch {
      /* storage blocked */
    }
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      if (Array.isArray(saved))
        recent = saved.filter((x): x is string => typeof x === "string");
    } catch {
      /* storage blocked or broken */
    }
    return { keep, recent };
  },
  remember(key: string) {
    try {
      sessionStorage.setItem(NOW_KEY, key);
      const { recent } = spotlightMemory.read();
      if (recent[0] === key) return;
      localStorage.setItem(
        RECENT_KEY,
        JSON.stringify([key, ...recent.filter((x) => x !== key)].slice(0, 12)),
      );
    } catch {
      /* storage blocked */
    }
  },
};

function forYouSpotlight(pick: ForYouPick, personal: boolean): Spotlight {
  const { item, media, because } = pick;
  const year = (item.release_date || item.first_air_date || "").slice(0, 4);
  const stars = `★ ${(item.vote_average ?? 0).toFixed(1)}`;
  return {
    reason: "for-you",
    media,
    item,
    kicker: [personal ? "Для тебе" : "Нове й високо оцінене", stars, year]
      .filter(Boolean)
      .join(" · "),
    note: because
      ? because.rating
        ? `Тому що ти оцінив «${because.title}» на ${because.rating}/10`
        : `Схоже на «${because.title}» із твоєї колекції`
      : personal
        ? `Новинка ${media === "tv" ? "серіалів" : "кіно"} у жанрах, які ти любиш`
        : undefined,
  };
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
  forYou = [],
  episodes,
  releases,
  recommendations,
  popular,
  seed,
  library,
  today = localIso(new Date()),
}: {
  /** Ranked by rankForYou, the one to show first (takeTurns) at the top. */
  forYou?: ForYouPick[];
  episodes: NewEpisode[];
  releases: Release[];
  recommendations: TmdbItem[];
  popular: TmdbItem[];
  seed?: LibraryItem;
  library: LibraryItem[];
  today?: string;
}): Spotlight | null {
  // A personal pick from what is new, popular and highly rated comes first:
  // it changes from visit to visit. Releases and episodes have their rows.
  if (forYou[0]) {
    const personal = library.some(
      (x) => x.status === "watched" || x.status === "watching",
    );
    return forYouSpotlight(forYou[0], personal);
  }
  // Then watchlist releases, so they stay near the top of the feed.
  const release = closestRelease(releases, today);
  if (release) {
    return {
      reason: "release",
      media: release.item.type,
      item: fromLibrary(release.item, release.details),
      kicker: "З «Хочу подивитися»",
      note: `${
        release.kind === "season"
          ? `Сезон ${release.season}`
          : release.kind === "return"
            ? `Продовження ${release.season} сезону`
            : daysUntil(release.date, today) >= 0
              ? "Вихід"
              : "Вийшов"
      } ${dayMonthLabel(release.date)} · ${relativeDay(release.date, today)}`,
    };
  }
  // Skip episodes already marked as watched since the list was loaded.
  const episode = episodes.find((e) => {
    const current = library.find((x) => x.type === "tv" && x.id === e.item.id);
    return !isWatched(progressOf(current), e);
  });
  if (episode) {
    const premiere = episode.episode === 1;
    return {
      reason: "episode",
      media: "tv",
      item: fromLibrary(episode.item, episode.details),
      kicker: `${premiere ? `Новий сезон ${episode.season}` : "Нова серія"} · S${episode.season}E${episode.episode} · ${relativeDay(episode.date, today)}`,
      note: "Серіал із твоєї колекції",
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
      kicker: "Тобі може сподобатися",
      note:
        seed.status === "watched" && seed.rating
          ? `Тому що ти оцінив «${seed.title}» на ${seed.rating}/10`
          : `Схоже на «${seed.title}» із твоєї колекції`,
    };
  }
  const hit = fresh(popular);
  if (hit) {
    return {
      reason: "popular",
      media: hit.media_type === "tv" ? "tv" : "movie",
      item: hit,
      kicker: "Популярно цього тижня",
    };
  }
  return null;
}
