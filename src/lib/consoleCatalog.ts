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

let loading: Promise<ConsoleCatalog> | null = null;

export function loadConsoleCatalog() {
  if (!loading) {
    loading = fetch(`${import.meta.env.BASE_URL}console-catalog.json`).then(
      (response) => {
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        return response.json() as Promise<ConsoleCatalog>;
      },
    );
  }
  return loading;
}

export function consoleGames(catalog: ConsoleCatalog, ids: number[]) {
  return ids
    .map((id) => catalog.games[String(id)])
    .filter((game): game is Game => Boolean(game));
}
