import { requestJson } from "./http";

export type Game = {
  id: number;
  title: string;
  thumbnail: string;
  short_description: string;
  game_url: string;
  genre: string;
  platform: string;
  publisher: string;
  developer: string;
  release_date: string;
  metacritic?: number | null;
  steam?: number | null;
  poster?: string;
  description?: string;
  screenshots?: { id: number; image: string; full?: string }[];
  steamAppId?: number;
  metacriticUrl?: string | null;
  steamReviewCount?: number | null;
  platforms?: string[];
  modes?: string[];
  playerCount?: number | null;
  releaseLabel?: string;
  requirements?: string;
  checkedAt?: string;
  pcDetails?: boolean;
  offers?: {
    store: string;
    url: string;
    price: number;
    regularPrice?: number;
    currency: string;
    region: string;
    checkedAt: string;
    source?: string;
  }[];
};

export type GameDetails = Game & {
  status?: string;
};

export async function gameDetails(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("HTTP_404");
  const game = await requestJson<GameDetails>(
    `${import.meta.env.BASE_URL}catalog/details/${id}.json`,
    300_000,
  );
  if (game.id !== id || typeof game.title !== "string")
    throw new Error("INVALID_GAME");
  return game;
}

export type Giveaway = {
  id: number;
  title: string;
  thumbnail: string;
  image: string;
  description: string;
  platforms: string;
  open_giveaway_url: string;
  type: string;
  end_date: string;
};

export const GAME_PLATFORMS = [
  { id: "pc", name: "PC", short: "STEAM", tint: "#66c0f4" },
  { id: "playstation", name: "PlayStation", short: "PS", tint: "#003791" },
  { id: "xbox", name: "Xbox", short: "XBOX", tint: "#107c10" },
  { id: "nintendo", name: "Nintendo Switch", short: "NS", tint: "#e60012" },
] as const;

export type GamePlatformId = (typeof GAME_PLATFORMS)[number]["id"];

export function gamePlatform(id: string) {
  return GAME_PLATFORMS.find((item) => item.id === id);
}

export function gameYear(game: Pick<Game, "release_date">) {
  return game.release_date?.slice(0, 4) || "";
}

export async function platformGiveaways(platforms: string[]) {
  const results = await Promise.allSettled(
    platforms.map(async (platform) => {
      const data = await requestJson<Giveaway[] | { status?: number }>(
        `https://www.gamerpower.com/api/giveaways?platform=${platform}`,
        600_000,
      );
      return Array.isArray(data) ? data : [];
    }),
  );
  const successful = results.filter(
    (r): r is PromiseFulfilledResult<Giveaway[]> => r.status === "fulfilled",
  );
  if (!successful.length) throw new Error("NETWORK");
  const lists = successful.map((r) => r.value);
  const seen = new Set<number>();
  return lists.flat().filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function matchGames(games: Game[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return games;
  return games.filter((game) =>
    [game.title, game.genre, game.developer, game.publisher]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}
