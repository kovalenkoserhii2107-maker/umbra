import type { PlatformGroupId } from "./igdb";

/** A game in the player's collection (Firestore users/{uid}/games/{id}). */
export type GameStatus = "want" | "playing" | "played" | "dropped" | "owned";

export type SteamPlay = {
  appId: number;
  /** Total minutes played. */
  minutes: number;
  /** Minutes in the last two weeks. */
  recent: number;
  /** Unix seconds of the last session, 0 if never. */
  lastPlayed: number;
};

export type GameEntry = {
  id: number;
  title: string;
  cover: string;
  year: string;
  genre: string;
  platforms: PlatformGroupId[];
  status: GameStatus;
  rating: number | null;
  note: string;
  /** Hours entered by hand, for consoles; Steam time comes from `steam`. */
  hours: number | null;
  steam?: SteamPlay;
  updatedAt: number;
};

export const GAME_STATUSES: Array<{ id: GameStatus; label: string }> = [
  { id: "playing", label: "Играю" },
  { id: "want", label: "Хочу поиграть" },
  { id: "played", label: "Пройдено" },
  { id: "dropped", label: "Брошено" },
  { id: "owned", label: "В библиотеке" },
];

export const statusLabel = (s: GameStatus) =>
  GAME_STATUSES.find((x) => x.id === s)?.label ?? s;

const GROUPS = ["pc", "playstation", "xbox", "nintendo"] as const;
const COVER = /^https:\/\/(images\.igdb\.com|[a-z0-9.-]+\.steamstatic\.com)\//;

/** Mirrors the Firestore rule; throws on anything the rule would reject. */
export function parseEntry(value: unknown): GameEntry {
  const v = (value ?? {}) as Record<string, unknown>;
  const fail = (what: string) => {
    throw new Error(`Некорректная запись игры: ${what}`);
  };
  if (!Number.isSafeInteger(v.id) || Number(v.id) <= 0) fail("id");
  if (typeof v.title !== "string" || v.title.length > 500) fail("title");
  const cover = typeof v.cover === "string" ? v.cover : "";
  if (cover && (!COVER.test(cover) || cover.length > 2048)) fail("cover");
  const platforms = Array.isArray(v.platforms) ? v.platforms : [];
  if (platforms.some((p) => !GROUPS.includes(p as never))) fail("platforms");
  if (!GAME_STATUSES.some((s) => s.id === v.status)) fail("status");
  const rating = v.rating ?? null;
  if (
    rating !== null &&
    (typeof rating !== "number" || !(rating >= 1 && rating <= 10))
  )
    fail("rating");
  const hours = v.hours ?? null;
  if (
    hours !== null &&
    (typeof hours !== "number" || !(hours >= 0 && hours <= 100000))
  )
    fail("hours");
  const note = typeof v.note === "string" ? v.note : "";
  if (note.length > 5000) fail("note");
  const s = v.steam as Record<string, unknown> | undefined;
  const int = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0;
  if (
    s !== undefined &&
    !(
      int(s.appId) &&
      Number(s.appId) > 0 &&
      int(s.minutes) &&
      int(s.recent) &&
      int(s.lastPlayed)
    )
  )
    fail("steam");
  return {
    id: Number(v.id),
    title: v.title as string,
    cover,
    year: typeof v.year === "string" ? v.year.slice(0, 10) : "",
    genre: typeof v.genre === "string" ? v.genre.slice(0, 100) : "",
    platforms: [...new Set(platforms as PlatformGroupId[])],
    status: v.status as GameStatus,
    rating: rating as number | null,
    note,
    hours: hours as number | null,
    ...(s
      ? {
          steam: {
            appId: Number(s.appId),
            minutes: Number(s.minutes),
            recent: Number(s.recent),
            lastPlayed: Number(s.lastPlayed),
          },
        }
      : {}),
    updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : 0,
  };
}

/** Hours played: Steam time when known, else what the player entered. */
export function playedHours(e: GameEntry) {
  if (e.steam && e.steam.minutes > 0)
    return Math.round((e.steam.minutes / 60) * 10) / 10;
  return e.hours;
}

export type LibrarySort = "recent" | "hours" | "rating" | "title";

export function sortEntries(list: GameEntry[], sort: LibrarySort) {
  const copy = [...list];
  const last = (e: GameEntry) =>
    Math.max(e.updatedAt, (e.steam?.lastPlayed ?? 0) * 1000);
  if (sort === "recent") copy.sort((a, b) => last(b) - last(a));
  if (sort === "hours")
    copy.sort((a, b) => (playedHours(b) ?? 0) - (playedHours(a) ?? 0));
  if (sort === "rating") copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  if (sort === "title")
    copy.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  return copy;
}

/** Counts per platform group for the switcher, "all" included. */
export function platformCounts(list: GameEntry[]) {
  const counts: Record<string, number> = { all: list.length };
  for (const g of GROUPS)
    counts[g] = list.filter((e) => e.platforms.includes(g)).length;
  return counts;
}

/**
 * Merges a Steam library into the collection. Existing entries keep the
 * player's status, rating and note; they gain PC and fresh play time. New
 * games come in as "owned", or "playing" when played in the last two weeks.
 */
export function mergeSteam(
  current: GameEntry[],
  owned: Array<{
    id: number;
    play: SteamPlay;
    summary: Omit<
      GameEntry,
      | "platforms"
      | "status"
      | "rating"
      | "note"
      | "hours"
      | "updatedAt"
      | "steam"
    >;
  }>,
  wishlist: Array<{
    id: number;
    summary: Omit<
      GameEntry,
      | "platforms"
      | "status"
      | "rating"
      | "note"
      | "hours"
      | "updatedAt"
      | "steam"
    >;
  }>,
) {
  const byId = new Map(current.map((e) => [e.id, e]));
  const changed: GameEntry[] = [];
  for (const { id, play, summary } of owned) {
    const old = byId.get(id);
    if (old) {
      const same =
        old.steam &&
        old.steam.minutes === play.minutes &&
        old.steam.recent === play.recent &&
        old.steam.lastPlayed === play.lastPlayed &&
        old.platforms.includes("pc");
      if (same) continue;
      changed.push({
        ...old,
        platforms: old.platforms.includes("pc")
          ? old.platforms
          : [...old.platforms, "pc"],
        // A wished game that is now owned moves to the library.
        status: old.status === "want" ? "owned" : old.status,
        steam: play,
      });
    } else
      changed.push({
        ...summary,
        id,
        platforms: ["pc"],
        status: play.recent > 0 ? "playing" : "owned",
        rating: null,
        note: "",
        hours: null,
        steam: play,
        updatedAt: 0,
      });
    byId.set(id, changed.at(-1)!);
  }
  for (const { id, summary } of wishlist) {
    if (byId.has(id)) continue;
    const entry: GameEntry = {
      ...summary,
      id,
      platforms: ["pc"],
      status: "want",
      rating: null,
      note: "",
      hours: null,
      updatedAt: 0,
    };
    changed.push(entry);
    byId.set(id, entry);
  }
  return changed;
}
