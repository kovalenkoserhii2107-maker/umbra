import { requestJson } from "./http";
import { type Game } from "./games";

export type ConsoleShelf = {
  popular: number[];
  upcoming: number[];
  top: number[];
};

export type ConsoleCatalog = {
  playstation: ConsoleShelf;
  xbox: ConsoleShelf;
  nintendo: ConsoleShelf;
  games: Record<string, Game>;
};

export function loadConsoleCatalog() {
  return requestJson<ConsoleCatalog>(
    `${import.meta.env.BASE_URL}catalog/consoles.json`,
    300_000,
  );
}

export function consoleGames(catalog: ConsoleCatalog, ids: number[]) {
  return ids
    .map((id) => catalog.games[String(id)])
    .filter((game): game is Game => Boolean(game));
}
