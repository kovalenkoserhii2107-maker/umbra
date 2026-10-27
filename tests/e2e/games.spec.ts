import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Request,
} from "@playwright/test";

// The catalog opens only after sign-in; each test uses a fresh emulator account.
async function signIn(page: Page) {
  await page.goto("#/login");
  await page
    .getByRole("button", { name: "Немає акаунту — зареєструватися" })
    .click();
  await page.getByLabel("Ім'я", { exact: true }).fill("Gamer");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`g-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Створити акаунт", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
}

const API = "https://umbra-api.test";
const cover = (id: string) => ({ image_id: id });

const witcher = {
  id: 1942,
  name: "The Witcher 3: Wild Hunt",
  slug: "the-witcher-3-wild-hunt",
  summary: "English summary from IGDB.",
  first_release_date: 1431993600, // 2015-05-19
  game_type: 0,
  cover: cover("co1wyy"),
  artworks: [cover("ar1")],
  screenshots: [cover("sc1"), cover("sc2")],
  videos: [{ video_id: "c0i88t0Kacs", name: "Launch Trailer" }],
  platforms: [
    { id: 6, name: "PC (Microsoft Windows)", abbreviation: "PC" },
    { id: 48, name: "PlayStation 4", abbreviation: "PS4" },
    { id: 130, name: "Nintendo Switch", abbreviation: "Switch" },
  ],
  genres: [{ name: "Role-playing (RPG)" }, { name: "Adventure" }],
  themes: [{ name: "Open world" }],
  game_modes: [{ name: "Single player" }],
  player_perspectives: [{ name: "Third person" }],
  involved_companies: [
    { developer: true, company: { id: 908, name: "CD Projekt RED" } },
    { publisher: true, company: { id: 1, name: "CD Projekt" } },
  ],
  aggregated_rating: 93,
  aggregated_rating_count: 30,
  rating: 93.4,
  rating_count: 4000,
  release_dates: [
    { date: 1431993600, platform: 6 },
    { date: 1431993600, platform: 48 },
    { date: 1571097600, platform: 130 },
  ],
  websites: [
    { url: "https://store.steampowered.com/app/292030" },
    { url: "https://thewitcher.com/en/witcher3" },
  ],
  collections: [{ id: 5, name: "The Witcher" }],
  expansions: [
    {
      id: 22439,
      name: "The Witcher 3: Wild Hunt - Blood and Wine",
      cover: cover("co2"),
      first_release_date: 1464652800,
      game_type: 2,
    },
  ],
  similar_games: [
    { id: 472, name: "The Elder Scrolls V: Skyrim", cover: cover("co3") },
  ],
};

const daysAgo = (days: number) => Math.floor(Date.now() / 1000) - days * 86400;

const summary = (id: number, name: string, extra = {}) => ({
  id,
  name,
  cover: cover(`c${id}`),
  first_release_date: 1700000000,
  platforms: [6, 167],
  genres: [{ name: "Shooter" }],
  aggregated_rating: 80,
  aggregated_rating_count: 10,
  ...extra,
});

type Seen = { igdb: Array<{ endpoint: string; body: string }> };

async function mockApi(
  context: BrowserContext | Page,
  seen: Seen = { igdb: [] },
) {
  const cors = { "Access-Control-Allow-Origin": "*" };
  await context.route("https://images.igdb.com/**", (r) =>
    r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#333"/></svg>',
    }),
  );
  await context.route("https://www.youtube.com/**", (r) =>
    r.fulfill({ body: "" }),
  );
  await context.route("https://i.ytimg.com/**", (r) => r.fulfill({ body: "" }));
  await context.route("https://www.gamerpower.com/**", (r) =>
    r.fulfill({ json: [], headers: cors }),
  );
  await context.route(`${API}/**`, async (route) => {
    const request: Request = route.request();
    const url = new URL(request.url());
    const body = request.postData() || "";
    const reply = (json: unknown, status = 200) =>
      route.fulfill({ json, status, headers: cors });
    const igdb = url.pathname.match(/^\/igdb\/(\w+)$/);
    if (igdb) {
      seen.igdb.push({ endpoint: igdb[1], body });
      const endpoint = igdb[1];
      if (endpoint === "multiquery")
        return reply([
          { name: "visits", result: [{ game_id: 301 }, { game_id: 119133 }] },
          { name: "want", result: [{ game_id: 1020 }, { game_id: 119133 }] },
          { name: "playing", result: [{ game_id: 119133 }] },
          { name: "peak", result: [] },
          {
            name: "fresh",
            result: [
              summary(300, "Quiet Release", {
                first_release_date: daysAgo(10),
              }),
              summary(301, "Hit Release", { first_release_date: daysAgo(20) }),
            ],
          },
          {
            name: "upcoming",
            result: [
              summary(400, "Soon Game", { first_release_date: daysAgo(-20) }),
            ],
          },
          { name: "best", result: [summary(500, "Best Game")] },
        ]);
      if (endpoint === "popularity_types")
        return reply([
          { id: 1, name: "Visits" },
          { id: 2, name: "Want to Play" },
          { id: 3, name: "Playing" },
          { id: 5, name: "24hr Peak Players" },
        ]);
      if (endpoint === "language_supports")
        return reply([
          {
            language: { name: "Russian", locale: "ru-RU" },
            language_support_type: { name: "Interface" },
          },
          {
            language: { name: "Russian", locale: "ru-RU" },
            language_support_type: { name: "Subtitles" },
          },
          {
            language: { name: "English", locale: "en-US" },
            language_support_type: { name: "Audio" },
          },
        ]);
      if (endpoint === "game_time_to_beats")
        return reply([
          { hastily: 180000, normally: 360000, completely: 612000, count: 300 },
        ]);
      if (endpoint === "external_games" && body.includes("9NBLGGH4R315"))
        return reply([{ game: 777, uid: "9NBLGGH4R315" }]);
      if (endpoint === "external_games") {
        const steam: Record<string, number> = {
          "292030": 1942,
          "620": 72,
          "1091500": 1877,
        };
        return reply(
          Object.entries(steam)
            .filter(([uid]) => body.includes(`"${uid}"`))
            .map(([uid, game]) => ({
              game,
              uid,
              url: `https://store.steampowered.com/app/${uid}`,
            })),
        );
      }
      if (endpoint === "games") {
        if (body.startsWith("fields age_ratings"))
          return reply([
            {
              age_ratings: [
                {
                  organization: { name: "ESRB" },
                  rating_category: { rating: "M" },
                },
                {
                  organization: { name: "PEGI" },
                  rating_category: { rating: "Eighteen" },
                },
              ],
            },
          ]);
        if (/where id = 1942;/.test(body)) return reply([witcher]);
        if (/where id = \d+;/.test(body)) return reply([]);
        if (body.includes("collections = (5)"))
          return reply([
            summary(1, "The Witcher"),
            summary(2, "The Witcher 2"),
          ]);
        if (body.startsWith("search")) {
          if (body.includes("fields id;") && body.includes("Witcher 3"))
            return reply([{ id: 1942 }]);
          if (body.includes('"witcher"'))
            return reply([
              {
                ...summary(1942, "The Witcher 3: Wild Hunt"),
                total_rating_count: 5000,
              },
              { ...summary(2, "The Witcher 2"), total_rating_count: 900 },
            ]);
          return reply([]);
        }
        if (/where id = \(1942\)/.test(body))
          return reply([
            {
              ...summary(1942, "The Witcher 3: Wild Hunt"),
              cover: cover("co1wyy"),
              platforms: [6, 48, 130],
            },
          ]);
        if (/where id = \([\d,]*\b72\b/.test(body))
          return reply([
            summary(1942, "The Witcher 3: Wild Hunt"),
            summary(72, "Portal 2"),
            summary(1877, "Cyberpunk 2077"),
          ]);
        if (body.includes("where id = (777)"))
          return reply([summary(777, "Halo Infinite")]);
        if (body.includes("where id = (") && body.includes("119133"))
          return reply([
            summary(119133, "Elden Ring", { first_release_date: daysAgo(900) }),
            // GTA VI is known only from "Want to Play", not from the date query.
            summary(1020, "Grand Theft Auto VI", {
              first_release_date: daysAgo(-49),
              hypes: 9000,
            }),
          ]);
        return reply([summary(600, "Browse Game")]);
      }
      return reply([]);
    }
    if (url.pathname === "/prices")
      return reply({
        found: true,
        id: "itad-1",
        title: "The Witcher 3",
        url: "https://isthereanydeal.com/game/the-witcher-3-wild-hunt/info/",
        historyLow: { amount: 5.99, currency: "USD" },
        deals: [
          {
            shop: "GOG",
            price: 7.99,
            regular: 39.99,
            cut: 80,
            currency: "USD",
            url: "https://itad.link/gog",
            voucher: null,
            storeLow: 7.99,
            drm: ["DRM Free"],
            expiry: null,
          },
          {
            shop: "Steam",
            price: 39.99,
            regular: 39.99,
            cut: 0,
            currency: "USD",
            url: "https://itad.link/steam",
            voucher: null,
            storeLow: 5.99,
            drm: ["Steam"],
            expiry: null,
          },
        ],
      });
    if (url.pathname === "/deals")
      return reply({
        list: [
          {
            title: "The Witcher 3: Wild Hunt",
            slug: "the-witcher-3-wild-hunt",
            image: "https://images.igdb.com/banner.jpg",
            deal: {
              shop: "GOG",
              price: 7.99,
              regular: 39.99,
              cut: 80,
              currency: "USD",
              url: "https://itad.link/gog",
              voucher: null,
              storeLow: 7.99,
              drm: [],
              expiry: null,
            },
          },
        ],
      });
    if (url.pathname === "/twitch/top-games")
      return reply({
        data: [
          { id: "1", name: "Just Chatting", box_art_url: "", igdb_id: "" },
          { id: "2", name: "Elden Ring", box_art_url: "", igdb_id: "119133" },
        ],
      });
    const pass = url.pathname.match(/^\/gamepass\/(\w+)$/);
    if (pass)
      return reply({
        list: pass[1],
        ids: ["recent", "console", "pc"].includes(pass[1])
          ? ["9NBLGGH4R315"]
          : [],
      });
    if (url.pathname === "/opencritic")
      return reply({
        found: true,
        id: 463,
        name: "The Witcher 3: Wild Hunt",
        url: "https://opencritic.com/game/463/the-witcher-3-wild-hunt",
        score: 93,
        tier: "Mighty",
        recommended: 98,
        reviews: 150,
        topReviews: [
          {
            outlet: "IGN",
            author: "Vince Ingenito",
            score: 93,
            verdict: null,
            snippet: "An absolute triumph of open world storytelling.",
            url: "https://ign.example/witcher3",
            date: "2015-05-12",
          },
        ],
      });
    if (url.pathname === "/steam/app/292030")
      return reply({
        appId: 292030,
        name: "The Witcher 3",
        about: "Русское описание из Steam.",
        short: "",
        headerImage: "",
        metacritic: {
          score: 93,
          url: "https://www.metacritic.com/game/the-witcher-3",
        },
        recommendations: 700000,
        achievements: 78,
        categories: [],
        requirements: { minimum: "ОС: Windows 10", recommended: "" },
        reviews: { score: 9, positive: 970, total: 1000 },
        players: 25000,
      });
    return reply({ error: "not_found" }, 404);
  });
  return seen;
}

test("game card gathers ratings, Russian description and facts from every source", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await signIn(page);
  await page.goto("#/games/1942");
  await expect(
    page.getByRole("heading", {
      name: "The Witcher 3: Wild Hunt",
      exact: true,
    }),
  ).toBeVisible();
  for (const [title, value] of [
    ["OpenCritic — середня оцінка провідних критиків", "93"],
    ["Metascore — зведена оцінка критиків", "93"],
    ["Частка позитивних відгуків у Steam", "97%"],
    ["Оцінка гравців IGDB", "9.3"],
  ])
    await expect(
      page.getByRole("link", { name: `${title}: ${value}` }),
    ).toBeVisible();
  await expect(page.getByText("могутня")).toBeVisible();
  await expect(page.getByText("Русское описание из Steam.")).toBeVisible();
  await expect(page.getByText("English summary from IGDB.")).toHaveCount(0);
  await expect(
    page.getByText("PEGI 18", { exact: true }).first(),
  ).toBeVisible();

  const facts = page.locator("section", { hasText: "Подробиці" });
  await expect(facts).toContainText("19 травня 2015 · PC, PS4");
  await expect(facts).toContainText("15 жовтня 2019 · Switch");
  await expect(facts).toContainText("Сюжет 50 год");
  await expect(facts).toContainText("На 100% 170 год");
  await expect(facts).toContainText("інтерфейс, субтитри");
  await expect(facts).toContainText("PEGI 18 · ESRB M");
  await expect(facts).toContainText("25 000");
  await expect(
    facts.getByRole("link", { name: "CD Projekt RED" }),
  ).toHaveAttribute("href", "#/games/studio/908");

  await expect(page.getByText("An absolute triumph")).toBeVisible();
  const stores = page.locator("section", { hasText: "Де купити" });
  await expect(stores.getByRole("link", { name: "Steam ↗" })).toHaveAttribute(
    "href",
    "https://store.steampowered.com/app/292030",
  );
  await expect(
    stores.getByRole("link", { name: /PlayStation Store/ }),
  ).toContainText("пошук");
  await expect(
    stores.getByRole("link", { name: /Nintendo eShop/ }),
  ).toBeVisible();
  const gog = stores.getByRole("link", { name: /GOG/ }).first();
  await expect(gog).toContainText("−80%");
  await expect(gog).toContainText("7,99");
  await expect(gog).toContainText("мінімум у магазині");
  await expect(stores).toContainText("Мінімум за весь час: 5,99");
  await expect(
    page.getByRole("heading", { name: "Серія «The Witcher»" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Доповнення" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".ui-evidence/game-card-mobile.png",
    fullPage: true,
  });
});

test("feed puts popular new releases first and finds awaited games like GTA VI", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seen = await mockApi(page);
  await signIn(page);
  await page.goto("#/games");
  const hero = (label: string) =>
    page.getByRole("link").filter({ hasText: label });
  await expect(hero("головна новинка")).toContainText("Hit Release");
  await expect(hero("найочікуваніша")).toContainText("Grand Theft Auto VI");
  await expect(hero("найбільше грають")).toContainText("Elden Ring");
  for (const title of [
    "Популярні новинки",
    "Зараз популярно",
    "Найочікуваніші",
    "Скоро вийдуть",
    "Нещодавно в Game Pass",
    "Найкращі за рік",
  ])
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const fresh = page.locator("section", {
    has: page.getByRole("heading", { name: "Популярні новинки" }),
  });
  await expect(fresh.getByRole("link").first()).toContainText("Hit Release");
  const awaited = page.locator("section", {
    has: page.getByRole("heading", { name: "Найочікуваніші" }),
  });
  await expect(awaited.getByRole("link").first()).toContainText(
    "Grand Theft Auto VI",
  );
  await expect(
    page
      .locator("section", {
        has: page.getByRole("heading", { name: "Нещодавно в Game Pass" }),
      })
      .getByText("Halo Infinite"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Знижки на ПК" }),
  ).toBeVisible();
  // The app does not zoom on phones.
  expect(
    await page.locator('meta[name="viewport"]').getAttribute("content"),
  ).toContain("user-scalable=no");
  const feed = seen.igdb.find((q) => q.endpoint === "multiquery")!.body;
  expect(feed).toContain("popularity_type = 2");
  expect(feed).toContain("first_release_date = null");
  await page.screenshot({ path: ".ui-evidence/game-feed-mobile.png" });
  // A deal opens the game in Umbra.
  await page
    .locator("section", {
      has: page.getByRole("heading", { name: "Знижки на ПК" }),
    })
    .getByRole("link", { name: /The Witcher 3/ })
    .click();
  await expect(page).toHaveURL(/#\/games\/1942$/);
});

test("feed follows my platforms and remembers them", async ({ page }) => {
  const seen = await mockApi(page);
  await signIn(page);
  await page.goto("#/games");
  await expect(page.getByText("Hit Release").first()).toBeVisible();
  const picker = page.getByRole("group", { name: "Мої платформи" });
  await picker.getByRole("button", { name: "Xbox" }).click();
  await picker.getByRole("button", { name: "Switch" }).click();
  await expect(picker.getByRole("button", { name: "Switch" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect
    .poll(
      () => seen.igdb.filter((q) => q.endpoint === "multiquery").at(-1)?.body,
    )
    .toContain("platforms = (6,167,48)");
  await page.reload();
  await expect(
    page
      .getByRole("group", { name: "Мої платформи" })
      .getByRole("button", { name: "Xbox" }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("search asks IGDB by name across the chosen platforms", async ({
  page,
}) => {
  const seen = await mockApi(page);
  await signIn(page);
  await page.goto("#/games/search");
  await page.getByLabel("Назва гри").fill("witcher");
  await expect(page.getByText("The Witcher 2")).toBeVisible();
  const query = seen.igdb.filter((q) => q.body.startsWith("search")).at(-1)!;
  expect(query.body).toContain('search "witcher"');
  expect(query.body).toContain("platforms = (6,167,48,169,49,508,130)");
  await page
    .getByRole("group", { name: "Платформи" })
    .getByRole("button", { name: "ПК" })
    .click();
  await expect
    .poll(
      () => seen.igdb.filter((q) => q.body.startsWith("search")).at(-1)?.body,
    )
    .toContain("platforms = (167,48,169,49,508,130)");
  await page.getByRole("link", { name: /The Witcher 3/ }).click();
  await expect(page).toHaveURL(/#\/games\/1942$/);
});

test("unknown game says so instead of showing another one", async ({
  page,
}) => {
  await mockApi(page);
  await signIn(page);
  await page.goto("#/games/999999");
  await expect(page.getByText("Гру не знайдено.")).toBeVisible();
  await expect(page.getByRole("link", { name: "До пошуку ігор" })).toBeVisible();
});

test("collection lives in the cloud: marks sync across tabs; old device entries move up on request", async ({
  context,
  page,
}) => {
  await mockApi(context);
  await signIn(page);
  // A game saved on this device by the old version, under its Steam app id.
  await page.evaluate(() =>
    localStorage.setItem(
      "umbra.gamesLibrary",
      JSON.stringify([
        {
          id: 292030,
          title: "Ведьмак 3 (старая запись)",
          thumbnail: "",
          year: "2015",
          genre: "RPG",
          status: "want",
          rating: null,
          note: "",
          updatedAt: 1,
        },
      ]),
    ),
  );
  const other = await context.newPage();
  await other.goto("http://127.0.0.1:5187/umbra/#/games/library");
  // Whose they are is unknown: nothing moves until the owner asks.
  await expect(other.getByText("Ведьмак 3 (старая запись)")).toHaveCount(0);
  expect(
    await other.evaluate(() => localStorage.getItem("umbra.gamesLibrary")),
  ).not.toBeNull();
  await other.goto("http://127.0.0.1:5187/umbra/#/settings");
  await expect(
    other.getByText("На цьому пристрої залишилися ігри зі старої версії: 1."),
  ).toBeVisible();
  await other.getByRole("button", { name: "Перенести в мій акаунт" }).click();
  await expect(
    other.getByText("Ігри з пристрою перенесено в акаунт."),
  ).toBeVisible();
  await other.goto("http://127.0.0.1:5187/umbra/#/games/library");
  await expect(
    other.getByRole("link", { name: /Ведьмак 3 \(старая запись\)/ }),
  ).toHaveAttribute("href", "#/games/1942");
  await expect
    .poll(() =>
      other.evaluate(() => localStorage.getItem("umbra.gamesLibrary")),
    )
    .toBeNull();
  // The old entry had no cover; it is filled in from IGDB.
  await expect(
    other.locator('a[href="#/games/1942"] img[src*="co1wyy"]'),
  ).toBeVisible();

  await page.goto("#/games/1942");
  await expect(
    page.getByRole("button", { name: "Хочу пограти", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Пройдено", exact: true }).click();
  // The game is on PC, PS4 and Switch: the card asks where it was played.
  const where = page.getByRole("group", { name: "Де граю" });
  await where.getByRole("button", { name: "PlayStation" }).click();
  await page.getByRole("button", { name: "9 з 10", exact: true }).click();
  await page.getByPlaceholder("наприклад, 40").fill("120");
  await page.getByPlaceholder("Коментар").fill("Шедевр");
  await page.getByRole("button", { name: "Зберегти", exact: true }).click();
  await expect(page.getByText("«Шедевр»")).toBeVisible();

  const switcher = other.getByRole("group", { name: "Платформа" });
  await expect(
    switcher.getByRole("button", { name: /PlayStation 1/ }),
  ).toBeVisible();
  await switcher.getByRole("button", { name: /PlayStation/ }).click();
  await expect(other.getByText(/Пройдено · 9\/10 · 120 год/)).toBeVisible();
  await switcher.getByRole("button", { name: /Xbox/ }).click();
  await expect(
    other.getByText("Тут поки порожньо", { exact: false }),
  ).toBeVisible();
  await other.reload();
  await expect(
    other
      .getByRole("group", { name: "Платформа" })
      .getByRole("button", { name: /Xbox/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await other.close();
});

test("Steam sign-in imports the library, wishlist, play time and achievements", async ({
  context,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(context);
  const steamId = "76561198000000001";
  const cors = { "Access-Control-Allow-Origin": "*" };
  await context.route(`${API}/steam/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/steam/verify")
      return route.fulfill({ json: { steamId }, headers: cors });
    if (path.endsWith("/profile"))
      return route.fulfill({
        json: { steamId, name: "Geralt", avatar: "", url: "", public: true },
        headers: cors,
      });
    if (path.endsWith("/library"))
      return route.fulfill({
        json: {
          private: false,
          games: [
            {
              appId: 292030,
              name: "The Witcher 3",
              minutes: 7260,
              recent: 95,
              lastPlayed: Math.floor(Date.now() / 1000) - 86400,
            },
            {
              appId: 620,
              name: "Portal 2",
              minutes: 600,
              recent: 0,
              lastPlayed: 1600000000,
            },
            {
              appId: 999999,
              name: "Unknown indie",
              minutes: 5,
              recent: 0,
              lastPlayed: 0,
            },
          ],
          wishlist: [1091500],
        },
        headers: cors,
      });
    if (path.includes("/achievements/292030"))
      return route.fulfill({
        json: {
          total: 78,
          achieved: 39,
          rarest: [
            {
              name: "Легенда",
              description: "Пройти на «На смерть!»",
              icon: "",
              percent: 2.1,
              unlocked: true,
              unlockedAt: 1,
            },
          ],
          next: [
            {
              name: "Гвинт",
              description: "Виграти партію",
              icon: "",
              percent: 61.5,
              unlocked: false,
              unlockedAt: 0,
            },
          ],
        },
        headers: cors,
      });
    return route.continue();
  });
  await signIn(page);
  // The collection has no Steam controls; they live in the settings.
  await page.goto("#/games/library");
  await expect(page.getByRole("heading", { name: "Мої ігри" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Увійти через Steam" }),
  ).toHaveCount(0);
  await page.goto("#/settings");
  await expect(
    page.getByRole("link", { name: "Увійти через Steam" }),
  ).toHaveAttribute(
    "href",
    /steamcommunity\.com\/openid\/login\?.*return_to=http%3A%2F%2F127\.0\.0\.1%3A5187%2Fumbra%2F%3Fsteam%3D1/,
  );
  // An unsolicited OpenID callback without the tab's state token is ignored.
  await page.goto(
    "http://127.0.0.1:5187/umbra/?steam=1&openid.mode=id_res&openid.claimed_id=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561198000000001&openid.sig=x",
  );
  await expect(page).toHaveURL(/\/umbra\/#\/settings$/);
  await expect(page.getByText("Steam · Geralt")).toHaveCount(0);

  // Steam sends the browser back to openid.return_to with openid.* parameters.
  const steamHref = (await page
    .getByRole("link", { name: "Увійти через Steam" })
    .getAttribute("href"))!;
  const returnTo = new URL(steamHref).searchParams.get("openid.return_to")!;
  await page.goto(
    `${returnTo}&openid.mode=id_res&openid.claimed_id=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F76561198000000001&openid.sig=x`,
  );
  await expect(page).toHaveURL(/\/umbra\/#\/settings$/);
  await expect(page.getByText("Steam · Geralt")).toBeVisible();
  await expect(
    page.getByText(/додано 3; 1 гра зі Steam не знайшлися в IGDB/),
  ).toBeVisible();
  await page.screenshot({
    path: ".ui-evidence/settings-mobile.png",
    fullPage: true,
  });
  await page.goto("#/games/library");
  const switcher = page.getByRole("group", { name: "Платформа" });
  await expect(switcher.getByRole("button", { name: /ПК 3/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Нещодавно грав" }),
  ).toBeVisible();
  // Steam refreshes by itself; there is no button for it.
  await expect(page.getByRole("button", { name: "Оновити" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Cyberpunk 2077/ }),
  ).toContainText("Хочу пограти");
  await expect(page.getByRole("link", { name: /Portal 2/ })).toContainText(
    "У бібліотеці · 10 год",
  );
  await page.screenshot({
    path: ".ui-evidence/game-library-mobile.png",
    fullPage: true,
  });

  // Games stats come from the same collection.
  await page.goto("#/stats?tab=games");
  await expect(page.getByRole("tab", { name: "Ігри" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("годин в іграх")).toBeVisible();
  await expect(page.getByText("131", { exact: true })).toBeVisible();
  const platforms = page.locator("section", {
    has: page.getByRole("heading", { name: "За платформами" }),
  });
  await platforms.getByRole("button", { name: /ПК/ }).click();
  await expect(platforms.getByRole("link", { name: /Portal 2/ })).toBeVisible();
  await page.screenshot({
    path: ".ui-evidence/stats-games-mobile.png",
    fullPage: true,
  });

  await page.goto("#/games/1942");
  const mine = page.locator("section", {
    has: page.getByRole("heading", { name: "Мій Steam" }),
  });
  await expect(mine).toContainText("121 год");
  await expect(mine).toContainText("39 з 78 · 50%");
  await expect(mine).toContainText("Легенда");
  await expect(mine).toContainText("2,1%");
  await expect(
    page.getByRole("button", { name: "Граю", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("backup file carries the games: loading it restores them, saving it includes them", async ({
  context,
  page,
}) => {
  await mockApi(context);
  await signIn(page);
  await page.goto("#/settings");
  const backup = {
    version: 1,
    items: [],
    games: [
      {
        id: 1942,
        title: "Ведьмак 3 (из копии)",
        cover: "",
        year: "2015",
        genre: "RPG",
        platforms: ["pc"],
        status: "played",
        rating: 9,
        note: "Шедевр",
        hours: 120,
      },
    ],
  };
  await page.locator('input[type="file"]').setInputFiles({
    name: "umbra-library.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByText(/Колекцію імпортовано/)).toBeVisible();
  await page.goto("#/games/library");
  await expect(
    page.getByRole("link", { name: /Ведьмак 3 \(из копии\)/ }),
  ).toBeVisible();

  await page.goto("#/settings");
  await expect(page.getByText(/1 гра в акаунті/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Завантажити" }).click();
  const file = await (await download).createReadStream();
  let text = "";
  for await (const chunk of file) text += chunk;
  const saved = JSON.parse(text);
  expect(saved.games).toHaveLength(1);
  expect(saved.games[0]).toMatchObject({ id: 1942, rating: 9, hours: 120 });
});
