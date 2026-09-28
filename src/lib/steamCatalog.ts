import { requestJson } from "./http";
import { type Game } from "./games";

export type SteamCatalog = {
  popular: number[];
  playing: number[];
  upcoming: number[];
  top: number[];
  games: Record<string, Game>;
  studios?: Record<string, number[]>;
};

export function loadSteamCatalog() {
  return requestJson<SteamCatalog>(
    `${import.meta.env.BASE_URL}catalog/steam.json`,
    300_000,
  );
}

export function catalogGames(catalog: SteamCatalog, ids: number[]) {
  return ids
    .map((id) => catalog.games[String(id)])
    .filter((game): game is Game => Boolean(game));
}
