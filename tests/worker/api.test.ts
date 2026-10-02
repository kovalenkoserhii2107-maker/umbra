import { beforeEach, describe, expect, it } from "vitest";
import { handle } from "../../worker/src/index";
import { resetTokenForTests } from "../../worker/src/twitch";
import { htmlToText } from "../../worker/src/steamStore";
import { shorten } from "../../worker/src/share";
import type { CacheLike, Deps, Env } from "../../worker/src/env";

const SITE = "https://kovalenkoserhii2107-maker.github.io";
const env: Env = {
  ALLOWED_ORIGINS: `${SITE},http://127.0.0.1:5187`,
  TWITCH_CLIENT_ID: "client-id",
  TWITCH_CLIENT_SECRET: "client-secret",
  STEAM_API_KEY: "steam",
  OPENCRITIC_API_KEY: "rapid",
  ITAD_API_KEY: "itad",
  TMDB_KEY: "tmdb-key",
  SITE_URL: "https://kovalenkoserhii2107-maker.github.io/umbra/",
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
        itad: true,
        opencritic: true,
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

  it("returns Game Pass store ids and refuses unknown lists", async () => {
    const { send, calls } = setup(() =>
      Response.json([
        { siglId: "f13cf6b4", title: "Recently added" },
        { id: "9NBLGGH4R315" },
        { id: "9PDV8FKWP3B4" },
        { id: "9NBLGGH4R315" },
        { id: "bad id" },
      ]),
    );
    const response = await send("/gamepass/recent");
    expect(await response.json()).toEqual({
      list: "recent",
      ids: ["9NBLGGH4R315", "9PDV8FKWP3B4"],
    });
    expect(calls[0].url).toContain("id=f13cf6b4-57e6-4459-89df-6aec18cf0538");
    expect((await send("/gamepass/everything")).status).toBe(404);
  });

  describe("IsThereAnyDeal", () => {
    const deal = (shop: string, amount: number, cut: number) => ({
      shop: { id: 1, name: shop },
      price: { amount, amountInt: amount * 100, currency: "USD" },
      regular: { amount: 39.99, currency: "USD" },
      cut,
      voucher: null,
      storeLow: { amount: 9.99, currency: "USD" },
      drm: [{ id: 61, name: "Steam" }],
      expiry: "2026-10-10T17:00:00+00:00",
      url: `https://itad.link/${shop}`,
    });

    it("finds the game by Steam app and returns prices cheapest first", async () => {
      const { send, calls } = setup(({ url }) => {
        expect(url).toContain("key=itad");
        if (url.includes("/games/lookup/v1"))
          return Response.json({
            found: true,
            game: {
              id: "018d937f-1",
              slug: "the-witcher-3-wild-hunt",
              title: "The Witcher 3",
            },
          });
        return Response.json([
          {
            id: "018d937f-1",
            historyLow: { all: { amount: 5.99, currency: "USD" } },
            deals: [
              deal("Steam", 9.99, 75),
              deal("GOG", 7.99, 80),
              { shop: { name: "Broken" } },
            ],
          },
        ]);
      });
      const response = await send(
        "/prices?steam=292030&title=Witcher&country=UA",
      );
      const body = await response.json();
      expect(body).toMatchObject({
        found: true,
        url: "https://isthereanydeal.com/game/the-witcher-3-wild-hunt/info/",
        historyLow: { amount: 5.99, currency: "USD" },
      });
      expect(body.deals.map((d: { shop: string }) => d.shop)).toEqual([
        "GOG",
        "Steam",
      ]);
      expect(body.deals[0]).toEqual({
        shop: "GOG",
        price: 7.99,
        regular: 39.99,
        cut: 80,
        currency: "USD",
        url: "https://itad.link/GOG",
        voucher: null,
        storeLow: 9.99,
        drm: ["Steam"],
        expiry: "2026-10-10T17:00:00+00:00",
      });
      expect(calls[0].url).toContain("/games/lookup/v1?appid=292030");
      const prices = calls.find((c) => c.url.includes("/games/prices/v3"))!;
      expect(prices.url).toContain("country=UA");
      expect(prices.init!.body).toBe('["018d937f-1"]');
    });

    it("says not found and checks input", async () => {
      const { send } = setup(() => Response.json({ found: false }));
      expect(await (await send("/prices?title=Nothing")).json()).toEqual({
        found: false,
      });
      expect((await send("/prices")).status).toBe(400);
    });

    it("lists current deals of games only", async () => {
      const { send } = setup(() =>
        Response.json({
          list: [
            {
              title: "Hades",
              slug: "hades",
              type: "game",
              assets: { banner400: "b.jpg" },
              deal: deal("Steam", 4.99, 80),
            },
            {
              title: "Soundtrack",
              slug: "ost",
              type: "dlc",
              deal: deal("Steam", 1, 50),
            },
          ],
        }),
      );
      const body = await (await send("/deals?country=bad")).json();
      expect(body.list).toHaveLength(1);
      expect(body.list[0]).toMatchObject({
        title: "Hades",
        image: "b.jpg",
        deal: { cut: 80 },
      });
    });
  });

  describe("OpenCritic", () => {
    const reviews = [
      {
        score: 90,
        npScore: 90,
        snippet: "A triumph.",
        externalUrl: "https://ign.example/review",
        publishedDate: "2023-03-23T00:00:00.000Z",
        Outlet: { name: "IGN" },
        Authors: [{ name: "Tom" }],
      },
      {
        score: 4,
        snippet: "Recommended without doubt.",
        externalUrl: "https://outlet.example/r",
        Outlet: { name: "Outlet" },
        ScoreFormat: {
          isSelect: true,
          options: [{ label: "Must play", val: 4 }],
        },
      },
    ];
    const respond = ({ url, init }: Call) => {
      expect((init!.headers as Record<string, string>)["X-RapidAPI-Key"]).toBe(
        "rapid",
      );
      if (url.includes("/game/search"))
        return Response.json([
          { id: 1, name: "Resident Evil 4", dist: 0 },
          { id: 2, name: "Resident Evil 4", dist: 0 },
          { id: 3, name: "Resident Evil Village", dist: 0.4 },
        ]);
      if (url.endsWith("/game/1"))
        return Response.json({
          id: 1,
          name: "Resident Evil 4",
          firstReleaseDate: "2005-01-11",
          topCriticScore: 96,
        });
      if (url.endsWith("/game/2"))
        return Response.json({
          id: 2,
          name: "Resident Evil 4",
          firstReleaseDate: "2023-03-24T00:00:00.000Z",
          topCriticScore: 92.4,
          tier: "Mighty",
          percentRecommended: 97.2,
          numReviews: 250,
        });
      if (url.includes("/reviews/game/2")) return Response.json(reviews);
      return new Response("", { status: 404 });
    };

    it("picks the release from the right year and keeps answers", async () => {
      const { send, calls } = setup(respond);
      const response = await send(
        "/opencritic?name=Resident%20Evil%204&year=2023",
      );
      const body = await response.json();
      expect(body).toMatchObject({
        found: true,
        id: 2,
        score: 92,
        tier: "Mighty",
        recommended: 97,
        reviews: 250,
        url: "https://opencritic.com/game/2/resident-evil-4",
      });
      expect(body.topReviews).toEqual([
        {
          outlet: "IGN",
          author: "Tom",
          score: 90,
          verdict: null,
          snippet: "A triumph.",
          url: "https://ign.example/review",
          date: "2023-03-23",
        },
        expect.objectContaining({ outlet: "Outlet", verdict: "Must play" }),
      ]);
      const used = calls.length;
      const again = await send(
        "/opencritic?name=resident%20evil%204&year=2023",
      );
      expect(again.headers.get("X-Cache")).toBe("HIT");
      expect(calls).toHaveLength(used);
    });

    it("says not found instead of borrowing a far match", async () => {
      const { send } = setup(respond);
      const body = await (
        await send("/opencritic?name=Resident%20Evil%204&year=2015")
      ).json();
      expect(body).toEqual({ found: false });
    });

    it("explains a missing key and a missing name", async () => {
      const { send } = setup(respond, {
        env: { ...env, OPENCRITIC_API_KEY: "" },
      });
      const response = await send("/opencritic?name=Portal");
      expect(response.status).toBe(503);
      expect((await send("/opencritic?name=")).status).toBe(400);
    });
  });

  describe("Steam store", () => {
    it("joins the store page, reviews and players of an app", async () => {
      const { send, calls } = setup(({ url }) => {
        if (url.includes("appdetails"))
          return Response.json({
            "620": {
              success: true,
              data: {
                name: "Portal 2",
                about_the_game:
                  "<p>Сиквел &laquo;Portal&raquo;.</p><ul><li>Кооператив</li></ul>",
                short_description: "Головоломка",
                header_image: "https://cdn.example/620.jpg",
                metacritic: {
                  score: 95,
                  url: "https://www.metacritic.com/game/portal-2",
                },
                recommendations: { total: 300000 },
                achievements: { total: 51 },
                categories: [{ description: "Для одного игрока" }],
                pc_requirements: {
                  minimum: "<strong>ОС:</strong> Windows 7<br>",
                },
              },
            },
          });
        if (url.includes("appreviews"))
          return Response.json({
            query_summary: {
              review_score: 9,
              total_positive: 98,
              total_reviews: 100,
            },
          });
        return Response.json({ response: { player_count: 4321, result: 1 } });
      });
      const response = await send("/steam/app/620");
      expect(await response.json()).toEqual({
        appId: 620,
        name: "Portal 2",
        about: "Сиквел «Portal».\n• Кооператив",
        short: "Головоломка",
        headerImage: "https://cdn.example/620.jpg",
        metacritic: {
          score: 95,
          url: "https://www.metacritic.com/game/portal-2",
        },
        recommendations: 300000,
        achievements: 51,
        categories: ["Для одного игрока"],
        requirements: { minimum: "ОС: Windows 7", recommended: "" },
        reviews: { score: 9, positive: 98, total: 100 },
        players: 4321,
      });
      expect(calls[0].url).toContain("appids=620&l=russian");
    });

    it("answers 404 for an unknown app and rejects bad ids", async () => {
      const { send } = setup(() => Response.json({ "1": { success: false } }));
      expect((await send("/steam/app/1")).status).toBe(404);
      expect((await send("/steam/app/abc")).status).toBe(404);
    });

    it("turns store HTML into text", () => {
      expect(htmlToText("a<br/>b&amp;c&#169;<b>d</b>")).toBe("a\nb&c©d");
    });
  });

  describe("Steam account", () => {
    const id = "76561198000000001";
    it("returns the library with play time and the wishlist", async () => {
      const { send, calls } = setup(({ url }) => {
        if (url.includes("GetOwnedGames"))
          return Response.json({
            response: {
              game_count: 2,
              games: [
                {
                  appid: 292030,
                  name: "The Witcher 3",
                  playtime_forever: 7200,
                  playtime_2weeks: 90,
                  rtime_last_played: 1759000000,
                },
                { appid: 620, name: "Portal 2", playtime_forever: 0 },
              ],
            },
          });
        return Response.json({ response: { items: [{ appid: 1091500 }] } });
      });
      const body = await (await send(`/steam/user/${id}/library`)).json();
      expect(body).toEqual({
        private: false,
        games: [
          {
            appId: 292030,
            name: "The Witcher 3",
            minutes: 7200,
            recent: 90,
            lastPlayed: 1759000000,
          },
          {
            appId: 620,
            name: "Portal 2",
            minutes: 0,
            recent: 0,
            lastPlayed: 0,
          },
        ],
        wishlist: [1091500],
      });
      expect(calls[0].url).toContain("key=steam");
      expect(calls[0].url).toContain(`steamid=${id}`);
    });

    it("marks a private library", async () => {
      const { send } = setup(() => Response.json({ response: {} }));
      expect(
        (await (await send(`/steam/user/${id}/library`)).json()).private,
      ).toBe(true);
    });

    it("ranks unlocked achievements by rarity", async () => {
      const { send } = setup(({ url }) => {
        if (url.includes("GetPlayerAchievements"))
          return Response.json({
            playerstats: {
              success: true,
              achievements: [
                { apiname: "A", achieved: 1, unlocktime: 10 },
                { apiname: "B", achieved: 1, unlocktime: 20 },
                { apiname: "C", achieved: 0 },
              ],
            },
          });
        if (url.includes("GetSchemaForGame"))
          return Response.json({
            game: {
              availableGameStats: {
                achievements: [
                  {
                    name: "A",
                    displayName: "Первый шаг",
                    description: "d",
                    icon: "a.jpg",
                  },
                  {
                    name: "B",
                    displayName: "Легенда",
                    description: "d",
                    icon: "b.jpg",
                  },
                  {
                    name: "C",
                    displayName: "Секрет",
                    description: "hidden",
                    hidden: 1,
                  },
                ],
              },
            },
          });
        return Response.json({
          achievementpercentages: {
            achievements: [
              { name: "A", percent: "80.4" },
              { name: "B", percent: 1.23 },
              { name: "C", percent: 40 },
            ],
          },
        });
      });
      const body = await (
        await send(`/steam/user/${id}/achievements/292030`)
      ).json();
      expect(body.total).toBe(3);
      expect(body.achieved).toBe(2);
      expect(body.rarest.map((a: { name: string }) => a.name)).toEqual([
        "Легенда",
        "Первый шаг",
      ]);
      expect(body.rarest[0].percent).toBe(1.2);
      expect(body.next[0]).toMatchObject({
        name: "Секрет",
        description: "",
        unlocked: false,
      });
    });

    it("rejects malformed ids and explains private stats", async () => {
      const { send } = setup(() => new Response("", { status: 403 }));
      expect((await send("/steam/user/123/library")).status).toBe(404);
      const response = await send(`/steam/user/${id}/profile`);
      expect(response.status).toBe(403);
      expect((await response.json()).error).toBe("steam_private");
    });
  });

  describe("share links", () => {
    const og = (html: string, name: string) =>
      html.match(new RegExp(`property="og:${name}" content="([^"]*)"`))?.[1];

    it("give messengers a poster and a short description, people the app", async () => {
      const { send, calls } = setup(() =>
        Response.json({
          title: "Стражи Галактики. Часть 2",
          overview:
            "Питер Квилл и его команда отправляются в новое путешествие. " +
            "Они раскрывают тайну происхождения Квилла и сталкиваются с новыми врагами. ".repeat(
              4,
            ),
          poster_path: "/poster.jpg",
          release_date: "2017-04-19",
          vote_average: 7.6,
          vote_count: 20000,
          genres: [{ name: "фантастика" }],
        }),
      );
      // Messengers send no Origin header; share links must still answer.
      const response = await send("/s/movie/283995", {}, "");
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/html");
      const html = await response.text();
      expect(og(html, "title")).toBe("Стражи Галактики. Часть 2 (2017)");
      expect(og(html, "image")).toBe(
        "https://image.tmdb.org/t/p/w500/poster.jpg",
      );
      const description = og(html, "description")!;
      expect(description).toMatch(
        /^Фильм · 2017 · фантастика · TMDB 7\.6\nПитер Квилл/,
      );
      expect(description.length).toBeLessThan(300);
      expect(html).toContain(
        'content="0;url=https://kovalenkoserhii2107-maker.github.io/umbra/#/title/movie/283995"',
      );
      expect(calls[0].url).toContain(
        "/3/movie/283995?api_key=tmdb-key&language=ru-RU",
      );
      await send("/s/movie/283995", {}, "");
      expect(calls).toHaveLength(1);
    });

    it("use the Russian Steam text for games and escape everything", async () => {
      const { send } = setup(({ url }) => {
        if (url.startsWith("https://id.twitch.tv")) return tokenResponse();
        if (url.includes("api.igdb.com"))
          return Response.json([
            {
              name: 'The "Witcher" 3 <Wild Hunt>',
              summary: "English summary",
              cover: { image_id: "co1wyy" },
              first_release_date: 1431993600,
              aggregated_rating: 93.4,
              aggregated_rating_count: 30,
              websites: [{ url: "https://store.steampowered.com/app/292030" }],
            },
          ]);
        if (url.includes("appdetails"))
          return Response.json({
            "292030": {
              success: true,
              data: { short_description: "Охотник на чудовищ Геральт." },
            },
          });
        return Response.json({});
      });
      const html = await (await send("/s/game/1942", {}, "")).text();
      expect(og(html, "title")).toBe(
        "The &quot;Witcher&quot; 3 &lt;Wild Hunt&gt; (2015)",
      );
      expect(og(html, "description")).toBe(
        "Игра · 2015 · критики 93\nОхотник на чудовищ Геральт.",
      );
      expect(og(html, "image")).toBe(
        "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1wyy.jpg",
      );
      expect(html).not.toContain("<Wild");
      expect(html).toContain("#/games/1942");
    });

    it("still open the app when nothing is found", async () => {
      const { send } = setup(() => new Response("", { status: 404 }));
      const html = await (await send("/s/tv/1", {}, "")).text();
      expect(og(html, "title")).toBe("Umbra");
      expect(og(html, "image")).toBeUndefined();
      expect(html).toContain("#/title/tv/1");
      expect((await send("/s/person/1", {}, "")).status).toBe(403);
    });

    it("shorten long text at a sentence or a word", () => {
      expect(shorten("Короткий текст.")).toBe("Короткий текст.");
      expect(shorten(`${"Слово ".repeat(60)}`, 50)).toMatch(
        /^(Слово ){7}Слово…$/,
      );
      expect(
        shorten(
          "Первое предложение здесь. Второе очень длинное предложение тут",
          36,
        ),
      ).toBe("Первое предложение здесь.");
    });
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
