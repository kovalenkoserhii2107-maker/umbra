import { type Game } from "./games";
import { type ConsoleCatalog } from "./consoleCatalog";
import { type SteamCatalog } from "./steamCatalog";

export const GAME_GENRES = [
  { id: "Action", label: "Боевик" },
  { id: "Adventure", label: "Приключения" },
  { id: "RPG", label: "Ролевые" },
  { id: "Strategy", label: "Стратегия" },
  { id: "Simulation", label: "Симулятор" },
  { id: "Sports", label: "Спорт" },
  { id: "Racing", label: "Гонки" },
  { id: "Indie", label: "Инди" },
  { id: "Casual", label: "Казуальные" },
] as const;

export type GamePlatformFilter =
  "all" | "pc" | "playstation" | "xbox" | "nintendo";
export type GameSort = "relevance" | "popular" | "rating" | "year";

export type GameFilters = {
  platform: GamePlatformFilter;
  year: string;
  genre: string | null;
  minScore: number;
  sort: GameSort;
};

export const defaultGameFilters: GameFilters = {
  platform: "all",
  year: "",
  genre: null,
  minScore: 0,
  sort: "relevance",
};

const GENRE_WORDS: Record<string, string[]> = {
  Action: [
    "action",
    "shooter",
    "fps",
    "fighting",
    "beat",
    "survival",
    "экшен",
    "боевик",
  ],
  Adventure: ["adventure", "platformer", "metroidvania", "приключ"],
  RPG: ["rpg", "role-playing", "role playing", "ролев"],
  Strategy: ["strategy", "tactics", "стратег"],
  Simulation: ["simulation", "симул"],
  Sports: ["sport", "спорт"],
  Racing: ["racing", "гонк"],
  Indie: ["indie", "инди"],
  Casual: ["casual", "казуал"],
};

function fold(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function gameScore(game: Game) {
  if (typeof game.metacritic === "number" && game.metacritic > 0)
    return game.metacritic / 10;
  if (typeof game.steam === "number" && game.steam > 0) return game.steam / 10;
  return 0;
}

function gameYear(game: Game) {
  const year = Number(String(game.release_date || "").slice(0, 4));
  return Number.isFinite(year) ? year : 0;
}

function onPlatform(game: Game, platform: GamePlatformFilter) {
  if (platform === "all") return true;
  const text = game.platform.toLowerCase();
  if (platform === "pc") return text.includes("steam") || text === "pc";
  if (platform === "playstation") return text.includes("playstation");
  if (platform === "xbox") return text.includes("xbox");
  return text.includes("switch") || text.includes("nintendo");
}

function hasGenre(game: Game, genre: string) {
  const text = fold(game.genre || "");
  return (GENRE_WORDS[genre] || [genre.toLowerCase()]).some((word) =>
    text.includes(word),
  );
}

export function gamePool(
  steam: SteamCatalog | null,
  consoles: ConsoleCatalog | null,
) {
  return [
    ...Object.values(steam?.games ?? {}),
    ...Object.values(consoles?.games ?? {}),
  ];
}

export function popularityRank(
  steam: SteamCatalog | null,
  consoles: ConsoleCatalog | null,
) {
  const rank = new Map<number, number>();
  const lists = [
    steam?.popular,
    steam?.playing,
    steam?.top,
    consoles?.playstation.popular,
    consoles?.xbox.popular,
    consoles?.nintendo.popular,
  ];
  for (const list of lists) {
    list?.forEach((id) => {
      if (!rank.has(id)) rank.set(id, rank.size);
    });
  }
  return rank;
}

export function filterGames(
  games: Game[],
  query: string,
  filters: GameFilters,
  rank: Map<number, number>,
) {
  const needle = fold(query);
  const matched = games.filter((game) => {
    if (!onPlatform(game, filters.platform)) return false;
    if (filters.year && gameYear(game) !== Number(filters.year)) return false;
    if (filters.genre && !hasGenre(game, filters.genre)) return false;
    if (filters.minScore && gameScore(game) < filters.minScore) return false;
    if (!needle) return true;
    return fold(
      [game.title, game.genre, game.developer, game.publisher].join(" "),
    ).includes(needle);
  });
  const sort =
    !needle && filters.sort === "relevance" ? "popular" : filters.sort;
  const unique = filters.platform === "all" ? dedupe(matched) : matched;
  const copy = unique.slice();
  if (sort === "rating") {
    copy.sort(
      (a, b) => gameScore(b) - gameScore(a) || gameYear(b) - gameYear(a),
    );
  } else if (sort === "year") {
    copy.sort(
      (a, b) => gameYear(b) - gameYear(a) || gameScore(b) - gameScore(a),
    );
  } else if (sort === "popular") {
    copy.sort(
      (a, b) =>
        (rank.get(a.id) ?? 100_000) - (rank.get(b.id) ?? 100_000) ||
        gameScore(b) - gameScore(a),
    );
  } else {
    copy.sort((a, b) => relevance(b, needle) - relevance(a, needle));
  }
  return copy;
}

function dedupe(list: Game[]) {
  const map = new Map<string, Game>();
  for (const game of list) {
    const key = fold(game.title);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, game);
      continue;
    }
    const nextBetter =
      (Boolean(game.genre) && !prev.genre) ||
      (Boolean(game.genre) === Boolean(prev.genre) &&
        gameScore(game) > gameScore(prev));
    if (nextBetter) map.set(key, game);
  }
  return [...map.values()];
}

function relevance(game: Game, needle: string) {
  const title = fold(game.title);
  if (!needle) return 0;
  if (title === needle) return 100;
  if (title.startsWith(needle)) return 80;
  if (title.includes(needle)) return 60;
  if (fold(game.developer).includes(needle)) return 40;
  if (fold(game.genre).includes(needle)) return 20;
  return 1;
}
