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
    "igdb" | "twitch" | "itad" | "opencritic" | "steam",
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

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = apiUrl();
  if (!base) throw new ApiError(0, "api_not_configured");
  let response: Response;
  try {
    response = await fetch(base + path, {
      ...init,
      signal: AbortSignal.timeout(15_000),
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
