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
    .getByRole("button", { name: "Нет аккаунта — зарегистрироваться" })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill("Gamer");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`g-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
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
          {
            name: "popular",
            result: [{ game_id: 1942 }, { game_id: 119133 }],
          },
          { name: "fresh", result: [summary(300, "Fresh Game")] },
          {
            name: "soon",
            result: [
              summary(400, "Soon Game", { first_release_date: 1893456000 }),
            ],
          },
          { name: "best", result: [summary(500, "Best Game")] },
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
      if (endpoint === "external_games")
        return reply([
          {
            game: 1942,
            uid: "292030",
            url: "https://store.steampowered.com/app/292030",
          },
        ]);
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
        if (body.includes("where id = (1942,119133)"))
          return reply([
            summary(119133, "Elden Ring"),
            summary(1942, "The Witcher 3: Wild Hunt"),
          ]);
        return reply([summary(600, "Browse Game")]);
      }
      return reply([]);
    }
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
    ["OpenCritic — средняя оценка ведущих критиков", "93"],
    ["Metascore — сводная оценка критиков", "93"],
    ["Доля положительных отзывов в Steam", "97%"],
    ["Оценка игроков IGDB", "9.3"],
  ])
    await expect(
      page.getByRole("link", { name: `${title}: ${value}` }),
    ).toBeVisible();
  await expect(page.getByText("могучая")).toBeVisible();
  await expect(page.getByText("Русское описание из Steam.")).toBeVisible();
  await expect(page.getByText("English summary from IGDB.")).toHaveCount(0);
  await expect(
    page.getByText("PEGI 18", { exact: true }).first(),
  ).toBeVisible();

  const facts = page.locator("section", { hasText: "Подробности" });
  await expect(facts).toContainText("19 мая 2015 · PC, PS4");
  await expect(facts).toContainText("15 октября 2019 · Switch");
  await expect(facts).toContainText("Сюжет 50 ч");
  await expect(facts).toContainText("На 100% 170 ч");
  await expect(facts).toContainText("интерфейс, субтитры");
  await expect(facts).toContainText("PEGI 18 · ESRB M");
  await expect(facts).toContainText("25 000");
  await expect(
    facts.getByRole("link", { name: "CD Projekt RED" }),
  ).toHaveAttribute("href", "#/games/studio/908");

  await expect(page.getByText("An absolute triumph")).toBeVisible();
  const stores = page.locator("section", { hasText: "Где купить" });
  await expect(stores.getByRole("link", { name: /Steam/ })).toHaveAttribute(
    "href",
    "https://store.steampowered.com/app/292030",
  );
  await expect(
    stores.getByRole("link", { name: /PlayStation Store/ }),
  ).toContainText("поиск");
  await expect(
    stores.getByRole("link", { name: /Nintendo eShop/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Серия «The Witcher»" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Дополнения" })).toBeVisible();
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

test("feed follows my platforms and remembers them", async ({ page }) => {
  const seen = await mockApi(page);
  await signIn(page);
  await page.goto("#/games");
  await expect(page.getByText("Elden Ring").first()).toBeVisible();
  await expect(page.getByText("сейчас обсуждают")).toBeVisible();
  for (const title of ["Новинки", "Скоро выйдут", "Лучшие за год"])
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const picker = page.getByRole("group", { name: "Мои платформы" });
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
      .getByRole("group", { name: "Мои платформы" })
      .getByRole("button", { name: "Xbox" }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("search asks IGDB by name across the chosen platforms", async ({
  page,
}) => {
  const seen = await mockApi(page);
  await signIn(page);
  await page.goto("#/games/search");
  await page.getByLabel("Название игры").fill("witcher");
  await expect(page.getByText("The Witcher 2")).toBeVisible();
  const query = seen.igdb.filter((q) => q.body.startsWith("search")).at(-1)!;
  expect(query.body).toContain('search "witcher"');
  expect(query.body).toContain("platforms = (6,167,48,169,49,508,130)");
  await page
    .getByRole("group", { name: "Платформы" })
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
  await expect(page.getByText("Игра не найдена.")).toBeVisible();
  await expect(page.getByRole("link", { name: "К поиску игр" })).toBeVisible();
});

test("marking a game updates another tab and old Steam entries move to IGDB", async ({
  context,
  page,
}) => {
  await mockApi(context);
  await signIn(page);
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
  await expect(
    other.getByRole("link", { name: /Ведьмак 3 \(старая запись\)/ }),
  ).toHaveAttribute("href", "#/games/1942");
  await page.goto("#/games/1942");
  await expect(
    page.getByRole("button", { name: "Хочу поиграть", exact: true }),
  ).toHaveClass(/bg-ink/);
  await page.getByRole("button", { name: "В пройденные", exact: true }).click();
  await page.getByRole("button", { name: "9 из 10", exact: true }).click();
  await page.getByPlaceholder("Комментарий").fill("Шедевр");
  await page.getByRole("button", { name: "Подтвердить", exact: true }).click();
  await expect(other.getByText(/9\/10/)).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("umbra.gamesLibrary")!),
    ),
  ).toEqual([
    expect.objectContaining({
      id: 1942,
      source: "igdb",
      status: "played",
      rating: 9,
      note: "Шедевр",
    }),
  ]);
  await other.close();
});
