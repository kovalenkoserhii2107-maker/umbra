export type SteamScore = {
  appid: number;
  metacritic: number | null;
  steam: number | null;
};

let loading: Promise<Record<string, SteamScore>> | null = null;

export function loadSteamScores() {
  if (!loading) {
    loading = fetch(`${import.meta.env.BASE_URL}steam-ratings.json`)
      .then((response) =>
        response.ok ? (response.json() as Promise<Record<string, SteamScore>>) : {},
      )
      .catch(() => ({}));
  }
  return loading;
}
