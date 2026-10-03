/**
 * Client for the Umbra API worker (worker/), which holds the keys for IGDB,
 * Twitch, IsThereAnyDeal, OpenCritic and Steam. Its address comes from the
 * API_URL repository variable (VITE_API_URL at build time).
 */
export function apiUrl() {
  return ((import.meta.env.VITE_API_URL as string | undefined) || "")
    .trim()
    .replace(/\/+$/, "");
}

export type ApiHealth = {
  ok: boolean;
  services: Record<
    "igdb" | "twitch" | "itad" | "opencritic" | "steam" | "ai",
    boolean
  >;
};

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(
  path: string,
  init: RequestInit = {},
  timeout = 15_000,
): Promise<T> {
  const base = apiUrl();
  if (!base) throw new ApiError(0, "api_not_configured");
  let response: Response;
  try {
    response = await fetch(base + path, {
      ...init,
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  const data = (await response.json().catch(() => null)) as
    (T & { error?: string; message?: string }) | null;
  if (!response.ok)
    throw new ApiError(
      response.status,
      data?.error || `http_${response.status}`,
      data?.message,
    );
  return data as T;
}

export const apiHealth = () => call<ApiHealth>("/health");

const memory = new Map<string, { until: number; value: Promise<unknown> }>();

/** IGDB query through the worker; identical queries share one request for 10 min. */
export function igdb<T>(endpoint: string, query: string): Promise<T> {
  const key = `${endpoint}\n${query}`;
  const hit = memory.get(key);
  if (hit && hit.until > Date.now()) return hit.value as Promise<T>;
  const value = call<T>(`/igdb/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: query,
  });
  memory.set(key, { until: Date.now() + 600_000, value });
  value.catch(() => memory.delete(key));
  if (memory.size > 300) memory.delete(memory.keys().next().value!);
  return value;
}

export const twitchTopGames = (first = 20) =>
  call<{
    data: Array<{
      id: string;
      name: string;
      box_art_url: string;
      igdb_id?: string;
    }>;
  }>(`/twitch/top-games?first=${first}`);

/** Confirms the openid.* parameters Steam sent back after sign-in. */
export const verifySteam = (params: Record<string, string>) =>
  call<{ steamId: string }>("/steam/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ params }),
  });

export type OpenCritic =
  | { found: false }
  | {
      found: true;
      id: number;
      name: string;
      url: string;
      score: number | null;
      tier: string | null;
      recommended: number | null;
      reviews: number;
      topReviews: Array<{
        outlet: string;
        author: string;
        score: number | null;
        verdict: string | null;
        snippet: string;
        url: string;
        date: string;
      }>;
    };

export const openCritic = (name: string, year: number | null) =>
  call<OpenCritic>(
    `/opencritic?name=${encodeURIComponent(name)}${year ? `&year=${year}` : ""}`,
  );

export type SteamApp = {
  appId: number;
  name: string;
  about: string;
  short: string;
  headerImage: string;
  metacritic: { score: number; url: string } | null;
  recommendations: number | null;
  achievements: number | null;
  categories: string[];
  requirements: { minimum: string; recommended: string };
  reviews: { score: number; positive: number; total: number } | null;
  players: number | null;
};

export const steamApp = (appId: number) =>
  call<SteamApp>(`/steam/app/${appId}`);

/** Microsoft Store ids of a Game Pass list. */
export const gamePass = (list: string) =>
  call<{ list: string; ids: string[] }>(`/gamepass/${list}`);

export type Deal = {
  shop: string;
  price: number;
  regular: number;
  cut: number;
  currency: string;
  url: string;
  voucher: string | null;
  storeLow: number | null;
  drm: string[];
  expiry: string | null;
};

export type Prices =
  | { found: false }
  | {
      found: true;
      id: string;
      title: string;
      url: string;
      deals: Deal[];
      historyLow: { amount: number; currency: string } | null;
    };

/** PC store prices from IsThereAnyDeal for a Steam app or a title. */
export const gamePrices = (
  steamId: number | null,
  title: string,
  country: string,
) =>
  call<Prices>(
    `/prices?${steamId ? `steam=${steamId}&` : ""}title=${encodeURIComponent(title)}&country=${country}`,
  );

export type DealItem = {
  title: string;
  slug: string;
  image: string;
  deal: Deal;
};

export const currentDeals = (country: string) =>
  call<{ list: DealItem[] }>(`/deals?country=${country}`);

export type SteamProfile = {
  steamId: string;
  name: string;
  avatar: string;
  url: string;
  public: boolean;
};

export type SteamLibrary = {
  private: boolean;
  games: Array<{
    appId: number;
    name: string;
    minutes: number;
    recent: number;
    lastPlayed: number;
  }>;
  wishlist: number[];
};

export type SteamAchievement = {
  name: string;
  description: string;
  icon: string;
  percent: number | null;
  unlocked: boolean;
  unlockedAt: number;
};

export type SteamAchievements = {
  total: number;
  achieved: number;
  rarest: SteamAchievement[];
  next: SteamAchievement[];
};

export const steamProfile = (steamId: string) =>
  call<SteamProfile>(`/steam/user/${steamId}/profile`);
export const steamLibrary = (steamId: string) =>
  call<SteamLibrary>(`/steam/user/${steamId}/library`);
export const steamAchievements = (steamId: string, appId: number) =>
  call<SteamAchievements>(`/steam/user/${steamId}/achievements/${appId}`);

export type AiStep =
  | { question: string; answer: string }
  | {
      shown: Array<{
        title: string;
        year: number | null;
        type: "movie" | "tv";
        verdict: "seen" | "liked" | "disliked" | null;
        rating: number | null;
      }>;
    };

export type AiQuestion = {
  question: string;
  options: Array<{ label: string; hint: string }>;
  allow_custom: boolean;
};

export type AiPicks = {
  /** What Claude understood about the user's taste. */
  taste: string;
  intro: string;
  picks: Array<{
    title: string;
    original_title: string;
    year: number;
    type: "movie" | "tv";
    reason: string;
  }>;
};

/** One step of the Claude picker; `token` is the Firebase sign-in token. */
export function aiTonight(
  token: string,
  body: { stage: "ask"; profile: string; steps: AiStep[]; rewatch: boolean },
): Promise<AiQuestion>;
export function aiTonight(
  token: string,
  body: { stage: "pick"; profile: string; steps: AiStep[]; rewatch: boolean },
): Promise<AiPicks>;
export function aiTonight(
  token: string,
  body: {
    stage: "ask" | "pick";
    profile: string;
    steps: AiStep[];
    rewatch: boolean;
  },
) {
  return call<AiQuestion | AiPicks>(
    "/ai/tonight",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
    // Thinking through a whole library takes a while.
    150_000,
  );
}
