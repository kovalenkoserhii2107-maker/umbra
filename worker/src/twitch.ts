import type { Deps } from "./env";
import { ApiError, cacheKey } from "./http";

type Token = { value: string; expiresAt: number };

// Kept per isolate; the Cache API copy survives isolate restarts.
let memory: Token | null = null;
const TOKEN_KEY = "twitch/app-token";

export function resetTokenForTests() {
  memory = null;
}

function credentials(deps: Deps) {
  const id = deps.env.TWITCH_CLIENT_ID;
  const secret = deps.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret)
    throw new ApiError(503, "twitch_not_configured", "Twitch keys are missing");
  return { id, secret };
}

/** App access token for IGDB and Helix (client credentials flow). */
export async function twitchToken(deps: Deps, refresh = false) {
  const { id, secret } = credentials(deps);
  const now = deps.now();
  if (!refresh && memory && memory.expiresAt > now) return memory.value;
  if (!refresh && deps.cache) {
    const stored = await deps.cache.match(cacheKey(TOKEN_KEY));
    if (stored) {
      const token = (await stored.json()) as Token;
      if (token.expiresAt > now) {
        memory = token;
        return token.value;
      }
    }
  }
  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", id);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("grant_type", "client_credentials");
  const response = await deps.fetch(url.toString(), { method: "POST" });
  if (!response.ok)
    throw new ApiError(502, "twitch_auth_failed", "Twitch rejected the keys");
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token)
    throw new ApiError(502, "twitch_auth_failed", "No access token");
  // Renew five minutes early.
  const ttl = Math.max(60, (data.expires_in || 3600) - 300);
  memory = { value: data.access_token, expiresAt: now + ttl * 1000 };
  if (deps.cache)
    deps.waitUntil(
      deps.cache.put(
        cacheKey(TOKEN_KEY),
        new Response(JSON.stringify(memory), {
          headers: { "Cache-Control": `max-age=${ttl}` },
        }),
      ),
    );
  return memory.value;
}

/** Authorized request with one retry on an expired token or a rate limit. */
export async function twitchFetch(
  deps: Deps,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const { id } = credentials(deps);
  for (let attempt = 0; ; attempt++) {
    const token = await twitchToken(deps, attempt > 0);
    const response = await deps.fetch(url, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        "Client-ID": id,
        Authorization: `Bearer ${token}`,
      },
    });
    if (response.status === 401 && attempt === 0) continue;
    if (response.status === 429 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      continue;
    }
    return response;
  }
}

export async function topGames(deps: Deps, first: number) {
  const url = `https://api.twitch.tv/helix/games/top?first=${first}`;
  const response = await twitchFetch(deps, url);
  if (!response.ok)
    throw new ApiError(
      502,
      "twitch_failed",
      `Twitch answered ${response.status}`,
    );
  return response.text();
}
