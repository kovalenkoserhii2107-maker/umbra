import { aiAllowed, aiTonight, checkAiLimits, parseAiRequest } from "./ai";
import type { CacheLike, Deps, Env } from "./env";
import { verifyIdToken } from "./firebaseAuth";
import {
  ApiError,
  allowedOrigin,
  cached,
  corsHeaders,
  errorResponse,
  json,
  sha256,
} from "./http";
import { IGDB_ENDPOINTS, igdbQuery } from "./igdb";
import { gamePassList } from "./gamepass";
import { country, currentDeals, gamePrices } from "./itad";
import { openCritic } from "./opencritic";
import { shareResponse } from "./share";
import { verifySteamLogin } from "./steam";
import { steamApp } from "./steamStore";
import {
  STEAM_ID,
  steamAchievements,
  steamLibrary,
  steamProfile,
} from "./steamUser";
import { topGames } from "./twitch";

function origins(env: Env) {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Which services have their keys; never the keys themselves. */
function health(env: Env) {
  const twitch = Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET);
  return {
    ok: true,
    services: {
      igdb: twitch,
      twitch,
      itad: Boolean(env.ITAD_API_KEY),
      opencritic: Boolean(env.OPENCRITIC_API_KEY),
      steam: Boolean(env.STEAM_API_KEY),
      ai: Boolean(env.ANTHROPIC_API_KEY),
    },
  };
}

async function route(
  request: Request,
  deps: Deps,
  url: URL,
): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "GET" && path === "/health")
    return json(health(deps.env));

  const igdb = path.match(/^\/igdb\/([a-z_]+)$/);
  if (igdb && request.method === "POST") {
    const endpoint = igdb[1];
    const query = await request.text();
    const key = `igdb/${endpoint}/${await sha256(query)}`;
    const ttl = IGDB_ENDPOINTS[endpoint] ?? 3600;
    const { body, hit } = await cached(deps, key, ttl, () =>
      igdbQuery(deps, endpoint, query),
    );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${Math.min(ttl, 3600)}`,
        "X-Cache": hit ? "HIT" : "MISS",
      },
    });
  }

  if (path === "/twitch/top-games" && request.method === "GET") {
    const first = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("first")) || 20),
    );
    const { body, hit } = await cached(deps, `twitch/top/${first}`, 600, () =>
      topGames(deps, first),
    );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Cache": hit ? "HIT" : "MISS",
      },
    });
  }

  const pass = path.match(/^\/gamepass\/([a-z]+)$/);
  if (pass && request.method === "GET") {
    const { body, hit } = await cached(
      deps,
      `gamepass/${pass[1]}`,
      21600,
      async () => JSON.stringify(await gamePassList(deps, pass[1])),
    );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Cache": hit ? "HIT" : "MISS",
      },
    });
  }

  if (path === "/prices" && request.method === "GET") {
    const appId = Number(url.searchParams.get("steam")) || null;
    const title = (url.searchParams.get("title") || "").trim().slice(0, 200);
    if (!appId && !title)
      throw new ApiError(400, "bad_game", "Steam app id or title is required");
    const region = country(url.searchParams.get("country"));
    const key = `itad/prices/${region}/${appId ?? (await sha256(title.toLowerCase()))}`;
    // Prices move with sales; three hours keeps under the request limit.
    const { body, hit } = await cached(deps, key, 10800, async () =>
      JSON.stringify(await gamePrices(deps, appId, title, region)),
    );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=1800",
        "X-Cache": hit ? "HIT" : "MISS",
      },
    });
  }

  if (path === "/deals" && request.method === "GET") {
    const region = country(url.searchParams.get("country"));
    const { body, hit } = await cached(
      deps,
      `itad/deals/${region}`,
      10800,
      async () => JSON.stringify(await currentDeals(deps, region)),
    );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=1800",
        "X-Cache": hit ? "HIT" : "MISS",
      },
    });
  }

  if (path === "/opencritic" && request.method === "GET") {
    const name = (url.searchParams.get("name") || "").trim();
    if (!name || name.length > 200)
      throw new ApiError(400, "bad_name", "Game name is required");
    const year = Number(url.searchParams.get("year")) || null;
    // 200 requests a day on the free plan, so answers are kept for 3 days.
    const key = `opencritic/${await sha256(name.toLowerCase())}/${year ?? ""}`;
    const { body, hit } = await cached(deps, key, 259200, async () =>
      JSON.stringify(await openCritic(deps, name, year)),
    );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Cache": hit ? "HIT" : "MISS",
      },
    });
  }

  const app = path.match(/^\/steam\/app\/(\d{1,10})$/);
  if (app && request.method === "GET") {
    const appId = Number(app[1]);
    const { body, hit } = await cached(
      deps,
      `steam/app/${appId}`,
      21600,
      async () => JSON.stringify(await steamApp(deps, appId)),
    );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=1800",
        "X-Cache": hit ? "HIT" : "MISS",
      },
    });
  }

  const user = path.match(
    /^\/steam\/user\/(\d{17})\/(profile|library|achievements)(?:\/(\d{1,10}))?$/,
  );
  if (user && request.method === "GET" && STEAM_ID.test(user[1])) {
    const [, steamId, part, app] = user;
    const load =
      part === "profile"
        ? { ttl: 3600, run: () => steamProfile(deps, steamId) }
        : part === "library"
          ? { ttl: 600, run: () => steamLibrary(deps, steamId) }
          : app
            ? {
                ttl: 1800,
                run: () => steamAchievements(deps, steamId, Number(app)),
              }
            : null;
    if (!load) throw new ApiError(404, "not_found", "No such route");
    const { body, hit } = await cached(
      deps,
      `steam/user/${steamId}/${part}/${app ?? ""}`,
      load.ttl,
      async () => JSON.stringify(await load.run()),
    );
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, max-age=300",
        "X-Cache": hit ? "HIT" : "MISS",
      },
    });
  }

  if (path === "/steam/verify" && request.method === "POST") {
    let payload: { params?: Record<string, unknown> };
    try {
      payload = (await request.json()) as typeof payload;
    } catch {
      throw new ApiError(400, "bad_json", "Body must be JSON");
    }
    return json(
      await verifySteamLogin(deps, payload.params || {}, origins(deps.env)),
    );
  }

  if (path === "/ai/tonight" && request.method === "POST") {
    if (!deps.env.ANTHROPIC_API_KEY)
      throw new ApiError(503, "ai_not_configured", "No ANTHROPIC_API_KEY");
    const user = await verifyIdToken(
      deps,
      request.headers.get("Authorization"),
      deps.env.FIREBASE_PROJECT_ID || "umbra-18ba8",
    );
    if (!aiAllowed(deps.env.AI_USERS, user.email))
      throw new ApiError(403, "ai_not_allowed", "AI is not enabled for you");
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new ApiError(400, "bad_json", "Body must be JSON");
    }
    const body = parseAiRequest(raw);
    await checkAiLimits(deps, user.uid);
    return json(await aiTonight(deps, body), 200, {
      "Cache-Control": "no-store",
    });
  }

  throw new ApiError(404, "not_found", "No such route");
}

/** The whole API: CORS, origin check and routing. Exported for tests. */
export async function handle(request: Request, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const origin = allowedOrigin(request, deps.env.ALLOWED_ORIGINS);
  const cors = corsHeaders(origin);

  if (request.method === "OPTIONS")
    return new Response(null, { status: origin ? 204 : 403, headers: cors });

  // Share links are opened by messengers and people, not by the app.
  const share = url.pathname.match(/^\/s\/(movie|tv|game)\/(\d{1,10})\/?$/);
  if (share && (request.method === "GET" || request.method === "HEAD"))
    return shareResponse(
      deps,
      share[1] as "movie" | "tv" | "game",
      Number(share[2]),
      url.toString(),
    );

  // Only the health check answers other sites, so keys cannot be used from elsewhere.
  const isHealth = url.pathname.replace(/\/+$/, "") === "/health";
  if (!origin && !isHealth)
    return json({ error: "origin_not_allowed", message: "Unknown site" }, 403);

  let response: Response;
  try {
    response = await route(request, deps, url);
  } catch (error) {
    response = errorResponse(error);
  }
  for (const [name, value] of Object.entries(cors))
    response.headers.set(name, value);
  return response;
}

type ExecutionContext = { waitUntil(task: Promise<unknown>): void };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const cache = (
      globalThis as unknown as { caches?: { default?: CacheLike } }
    ).caches?.default;
    return handle(request, {
      env,
      fetch: (input, init) => fetch(input, init),
      cache: cache ?? null,
      now: () => Date.now(),
      waitUntil: (task) => ctx.waitUntil(task),
    });
  },
};
