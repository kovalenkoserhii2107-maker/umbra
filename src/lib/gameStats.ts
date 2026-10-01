import { GAME_STATUSES, playedHours, type GameEntry } from "./gameEntry";
import { PLATFORM_GROUPS } from "./igdb";
import { averageLabel } from "./stats";

/** One row of a games breakdown with the games behind it. */
export type GameBar = {
  label: string;
  value: number;
  extra?: string;
  items: GameEntry[];
};

export type GameStats = {
  total: number;
  played: number;
  playing: number;
  want: number;
  hours: number;
  /** Hours in the last two weeks, from Steam. */
  recentHours: number;
  average: number | null;
  statuses: GameBar[];
  platforms: GameBar[];
  ratings: GameBar[];
  genres: GameBar[];
  mostPlayed: GameEntry[];
  recent: GameEntry[];
  best: GameEntry[];
};

const hoursText = (h: number) => `${Math.round(h).toLocaleString("ru-RU")} ч`;

const sumHours = (list: GameEntry[]) =>
  list.reduce((s, g) => s + (playedHours(g) ?? 0), 0);

/** When the player last touched a game: their mark or the last Steam session. */
const lastTouched = (g: GameEntry) =>
  Math.max(g.updatedAt, (g.steam?.lastPlayed ?? 0) * 1000);

export function gameYears(list: GameEntry[]) {
  const years = new Set(
    list
      .map(lastTouched)
      .filter(Boolean)
      .map((t) => new Date(t).getFullYear()),
  );
  return [...years].sort((a, b) => b - a);
}

/** Games stats for all time or for the year a game was last touched. */
export function computeGameStats(
  all: GameEntry[],
  year: number | null,
): GameStats {
  const list =
    year === null
      ? all
      : all.filter((g) => new Date(lastTouched(g)).getFullYear() === year);
  const rated = list.filter((g) => g.rating !== null);
  const by = (pick: (g: GameEntry) => boolean) => list.filter(pick);

  const statuses = GAME_STATUSES.map((s) => {
    const items = by((g) => g.status === s.id);
    return { label: s.label, value: items.length, items };
  }).filter((b) => b.value);

  const platforms = PLATFORM_GROUPS.map((p) => {
    const items = by((g) => g.platforms.includes(p.id));
    const h = sumHours(items);
    return {
      label: p.name,
      value: items.length,
      extra: h ? hoursText(h) : undefined,
      items,
    };
  }).filter((b) => b.value);

  const ratings = Array.from({ length: 10 }, (_, i) => {
    const items = rated.filter((g) => g.rating === 10 - i);
    return { label: String(10 - i), value: items.length, items };
  });

  const genreRows = new Map<string, GameEntry[]>();
  for (const g of list)
    if (g.genre) genreRows.set(g.genre, [...(genreRows.get(g.genre) || []), g]);
  const genres = [...genreRows.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ru"))
    .slice(0, 8)
    .map(([label, items]) => ({
      label,
      value: items.length,
      extra: averageLabel(items),
      items,
    }));

  return {
    total: list.length,
    played: by((g) => g.status === "played").length,
    playing: by((g) => g.status === "playing").length,
    want: by((g) => g.status === "want").length,
    hours: Math.round(sumHours(list)),
    recentHours:
      Math.round(list.reduce((s, g) => s + (g.steam?.recent ?? 0), 0) / 6) / 10,
    average: rated.length
      ? Math.round(
          (rated.reduce((s, g) => s + g.rating!, 0) / rated.length) * 10,
        ) / 10
      : null,
    statuses,
    platforms,
    ratings,
    genres,
    mostPlayed: list
      .filter((g) => (playedHours(g) ?? 0) > 0)
      .sort((a, b) => (playedHours(b) ?? 0) - (playedHours(a) ?? 0))
      .slice(0, 10),
    recent: list
      .filter((g) => (g.steam?.recent ?? 0) > 0)
      .sort((a, b) => b.steam!.recent - a.steam!.recent),
    best: [...rated]
      .sort((a, b) => b.rating! - a.rating! || b.updatedAt - a.updatedAt)
      .slice(0, 10),
  };
}
