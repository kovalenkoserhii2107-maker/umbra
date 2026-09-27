import { type Game } from "./games";

export type SteamCatalog = {
  popular: number[];
  playing: number[];
  upcoming: number[];
  top: number[];
  games: Record<string, Game>;
  studios?: Record<string, number[]>;
};

let loading: Promise<SteamCatalog> | null = null;

export function loadSteamCatalog() {
  if (!loading) {
    loading = fetch(`${import.meta.env.BASE_URL}steam-catalog.json`).then(
      (response) => {
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        return response.json() as Promise<SteamCatalog>;
      },
    );
  }
  return loading;
}

export function catalogGames(catalog: SteamCatalog, ids: number[]) {
  return ids
    .map((id) => catalog.games[String(id)])
    .filter((game): game is Game => Boolean(game));
}
