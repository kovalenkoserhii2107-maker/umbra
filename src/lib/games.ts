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
  screenshots?: { id: number; image: string }[];
};

export type GameDetails = Game & {
  status?: string;
};

const BASE = "https://www.freetogame.com/api";

export function gamesList(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return requestJson<Game[]>(`${BASE}/games${qs ? `?${qs}` : ""}`, 3_600_000);
}

export function gameDetails(id: number) {
  return requestJson<GameDetails>(`${BASE}/game?id=${id}`, 3_600_000);
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
] as const;

export type GamePlatformId = (typeof GAME_PLATFORMS)[number]["id"];

export function gamePlatform(id: string) {
  return GAME_PLATFORMS.find((item) => item.id === id);
}

export function gameYear(game: Pick<Game, "release_date">) {
  return game.release_date?.slice(0, 4) || "";
}

export async function platformGiveaways(platforms: string[]) {
  const lists = await Promise.all(
    platforms.map(async (platform) => {
      try {
        const data = await requestJson<Giveaway[] | { status?: number }>(
          `https://www.gamerpower.com/api/giveaways?platform=${platform}`,
          600_000,
        );
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    }),
  );
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
