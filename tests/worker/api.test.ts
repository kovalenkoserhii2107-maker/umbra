import { beforeEach, describe, expect, it } from "vitest";
import { handle } from "../../worker/src/index";
import { resetTokenForTests } from "../../worker/src/twitch";
import type { CacheLike, Deps, Env } from "../../worker/src/env";

const SITE = "https://kovalenkoserhii2107-maker.github.io";
const env: Env = {
  ALLOWED_ORIGINS: `${SITE},http://127.0.0.1:5187`,
  TWITCH_CLIENT_ID: "client-id",
  TWITCH_CLIENT_SECRET: "client-secret",
  STEAM_API_KEY: "steam",
};

type Call = { url: string; init?: RequestInit };

function memoryCache(): CacheLike & { size(): number } {
  const store = new Map<string, string>();
  return {
    async match(key) {
      const body = store.get(key.url);
      return body === undefined ? undefined : new Response(body);
    },
    async put(key, response) {
      store.set(key.url, await response.text());
    },
    size: () => store.size,
  };
}

function setup(
  respond: (call: Call) => Response | Promise<Response>,
  overrides: Partial<Deps> = {},
) {
  const calls: Call[] = [];
  const pending: Promise<unknown>[] = [];
  const cache = memoryCache();
  const deps: Deps = {
    env,
    cache,
    now: () => 1_000_000,
    waitUntil: (task) => pending.push(task),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { url: String(input), init };
      calls.push(call);
      return respond(call);
    }) as typeof fetch,
    ...overrides,
  };
  const send = async (path: string, init: RequestInit = {}, origin = SITE) => {
    const headers = new Headers(init.headers);
    if (origin) headers.set("Origin", origin);
    const response = await handle(
      new Request(`https://umbra-api.example.workers.dev${path}`, {
        ...init,
        headers,
      }),
      deps,
    );
    await Promise.all(pending);
    return response;
  };
  return { calls, send, cache };
}

const tokenResponse = () =>
  Response.json({ access_token: "token-1", expires_in: 5_000_000 });

beforeEach(() => resetTokenForTests());

describe("umbra-api", () => {
  it("reports which services have keys without exposing them", async () => {
    const { send } = setup(() => new Response("unused"));
    const response = await send("/health", {}, "");
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      services: {
        igdb: true,
        twitch: true,
        itad: false,
        opencritic: false,
        steam: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain("client-secret");
  });

  it("answers only the allowed sites and their preflight", async () => {
    const { send, calls } = setup(() => new Response("unused"));
    const denied = await send(
      "/igdb/games",
      { method: "POST", body: "fields name;" },
      "https://evil.example",
    );
    expect(denied.status).toBe(403);
    expect(calls).toHaveLength(0);
    const preflight = await send("/igdb/games", { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
  });

  it("proxies IGDB with a Twitch token and caches the answer", async () => {
    const { send, calls } = setup(({ url }) =>
      url.startsWith("https://id.twitch.tv")
        ? tokenResponse()
        : Response.json([{ id: 1942, name: "The Witcher 3" }]),
    );
    const query = "fields name; where id = 1942;";
    const first = await send("/igdb/games", { method: "POST", body: query });
    expect(first.status).toBe(200);
    expect(first.headers.get("X-Cache")).toBe("MISS");
    expect(first.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    expect(await first.json()).toEqual([{ id: 1942, name: "The Witcher 3" }]);
    const igdbCall = calls.find(
      (c) => c.url === "https://api.igdb.com/v4/games",
    )!;
    const headers = igdbCall.init!.headers as Record<string, string>;
    expect(headers["Client-ID"]).toBe("client-id");
    expect(headers.Authorization).toBe("Bearer token-1");
    expect(igdbCall.init!.body).toBe(query);

    const second = await send("/igdb/games", { method: "POST", body: query });
    expect(second.headers.get("X-Cache")).toBe("HIT");
    expect(calls.filter((c) => c.url.includes("api.igdb.com"))).toHaveLength(1);
  });

  it("refreshes an expired token once", async () => {
    let igdbCalls = 0;
    let tokens = 0;
    const { send } = setup(({ url }) => {
      if (url.startsWith("https://id.twitch.tv"))
        return Response.json({
          access_token: `token-${++tokens}`,
          expires_in: 5_000_000,
        });
      igdbCalls++;
      return igdbCalls === 1
        ? new Response("", { status: 401 })
        : Response.json([]);
    });
    const response = await send("/igdb/genres", {
      method: "POST",
      body: "fields name;",
    });
    expect(response.status).toBe(200);
    expect(tokens).toBe(2);
  });

  it("rejects unknown endpoints, empty and oversized queries", async () => {
    const { send, calls } = setup(() => tokenResponse());
    expect(
      (await send("/igdb/private_lists", { method: "POST", body: "fields *;" }))
        .status,
    ).toBe(404);
    expect(
      (await send("/igdb/games", { method: "POST", body: "  " })).status,
    ).toBe(400);
    expect(
      (await send("/igdb/games", { method: "POST", body: "x".repeat(5000) }))
        .status,
    ).toBe(413);
    expect(calls.filter((c) => c.url.includes("api.igdb.com"))).toHaveLength(0);
  });

  it("explains a missing Twitch key", async () => {
    const { send } = setup(() => new Response("unused"), {
      env: { ...env, TWITCH_CLIENT_SECRET: "" },
    });
    const response = await send("/igdb/games", {
      method: "POST",
      body: "fields name;",
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("twitch_not_configured");
  });

  it("returns Twitch top games", async () => {
    const { send, calls } = setup(({ url }) =>
      url.startsWith("https://id.twitch.tv")
        ? tokenResponse()
        : Response.json({
            data: [{ id: "32982", name: "Grand Theft Auto V" }],
          }),
    );
    const response = await send("/twitch/top-games?first=5");
    expect((await response.json()).data[0].name).toBe("Grand Theft Auto V");
    expect(
      calls.some(
        (c) => c.url === "https://api.twitch.tv/helix/games/top?first=5",
      ),
    ).toBe(true);
  });

  describe("Steam sign-in", () => {
    const steamId = "76561198000000001";
    const params = {
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.mode": "id_res",
      "openid.op_endpoint": "https://steamcommunity.com/openid/login",
      "openid.claimed_id": `https://steamcommunity.com/openid/id/${steamId}`,
      "openid.identity": `https://steamcommunity.com/openid/id/${steamId}`,
      "openid.return_to": `${SITE}/umbra/?steam=1`,
      "openid.response_nonce": "2026-10-01T12:00:00Zabc",
      "openid.assoc_handle": "1234567890",
      "openid.signed":
        "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
      "openid.sig": "c2lnbmF0dXJl",
    };
    const verify = (
      body: unknown,
      steam = "ns:http://specs.openid.net/auth/2.0\nis_valid:true\n",
    ) => {
      const ctx = setup(() => new Response(steam));
      return {
        ctx,
        response: ctx.send("/steam/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      };
    };

    it("confirms a genuine sign-in with Steam", async () => {
      const { ctx, response } = verify({ params });
      const res = await response;
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ steamId });
      const call = ctx.calls[0];
      expect(call.url).toBe("https://steamcommunity.com/openid/login");
      expect(String(call.init!.body)).toContain(
        "openid.mode=check_authentication",
      );
    });

    it("refuses forged, foreign or cancelled answers", async () => {
      expect(
        (await verify({ params }, "is_valid:false\n").response).status,
      ).toBe(401);
      expect(
        (
          await verify({
            params: { ...params, "openid.return_to": "https://evil.example/" },
          }).response
        ).status,
      ).toBe(400);
      expect(
        (
          await verify({
            params: {
              ...params,
              "openid.claimed_id": "https://evil.example/id/1",
            },
          }).response
        ).status,
      ).toBe(400);
      expect(
        (
          await verify({ params: { ...params, "openid.mode": "cancel" } })
            .response
        ).status,
      ).toBe(400);
    });
  });
});
