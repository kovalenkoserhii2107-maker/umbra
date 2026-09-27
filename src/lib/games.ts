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
};

export type GameDetails = Game & {
  description?: string;
  status?: string;
  screenshots?: { id: number; image: string }[];
};

const BASE = "https://www.freetogame.com/api";

export function gamesList(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return requestJson<Game[]>(`${BASE}/games${qs ? `?${qs}` : ""}`, 3_600_000);
}

export function gameDetails(id: number) {
  return requestJson<GameDetails>(`${BASE}/game?id=${id}`, 3_600_000);
}

export function gameYear(game: Pick<Game, "release_date">) {
  return game.release_date?.slice(0, 4) || "";
}
