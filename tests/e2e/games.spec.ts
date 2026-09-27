import { test, expect } from "@playwright/test";
const game = {
  id: 620,
  title: "Portal 2",
  thumbnail: "https://images.example.test/portal.jpg",
  short_description: "Puzzle game",
  description: "Описание Portal 2",
  game_url: "https://store.steampowered.com/app/620/",
  genre: "Puzzle",
  platform: "PC",
  platforms: ["Windows", "Linux"],
  developer: "Valve",
  publisher: "Valve",
  release_date: "2011",
  metacritic: 95,
  steam: 98,
  steamReviewCount: 1000,
  steamAppId: 620,
  modes: ["Один игрок", "Кооператив по сети"],
  playerCount: 1234,
  checkedAt: "2026-09-27T00:00:00Z",
  screenshots: [
    {
      id: 1,
      image: "https://images.example.test/shot.jpg",
      full: "https://images.example.test/full.jpg",
    },
  ],
  offers: [
    {
      store: "Steam",
      price: 99,
      currency: "UAH",
      region: "UA",
      checkedAt: "2026-09-27T00:00:00Z",
      url: "https://store.steampowered.com/app/620/",
    },
    {
      store: "Fanatical",
      price: 3,
      currency: "USD",
      region: "US",
      checkedAt: "2026-09-27T00:00:00Z",
      url: "https://www.cheapshark.com/redirect?dealID=verified",
      source: "CheapShark",
    },
  ],
};
test("direct game route loads only its details and shows verified facts and store offers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.route("**/catalog/details/620.json", (r) =>
    r.fulfill({ json: game }),
  );
  await page.route("https://images.example.test/**", (r) =>
    r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#222"/></svg>',
    }),
  );
  await page.goto("#/games/620");
  await expect(
    page.getByRole("heading", { name: "Portal 2", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Steam: 98% положительных")).toBeVisible();
  await expect(page.getByText("Metacritic: 95/100")).toBeVisible();
  await expect(page.getByText("Описание Portal 2")).toBeVisible();
  await expect(page.getByText("Windows · Linux")).toBeVisible();
  await expect(page.getByText("Один игрок · Кооператив по сети")).toBeVisible();
  await expect(page.getByRole("link", { name: /Fanatical/ })).toHaveAttribute(
    "href",
    /cheapshark.com\/redirect/,
  );
  await expect(
    page.getByRole("img", { name: "Portal 2 — скриншот 1" }),
  ).toHaveCount(1);
  expect(
    requests.filter((u) =>
      /freetogame|steam-ratings|catalog\/(steam|consoles)\.json/.test(u),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".ui-evidence/game-details-mobile.png",
    fullPage: true,
  });
});
test("unknown game cannot fall back to a different provider sharing its numeric ID", async ({
  page,
}) => {
  await page.route("**/catalog/details/999999.json", (r) =>
    r.fulfill({ status: 404, body: "Not found" }),
  );
  await page.goto("#/games/999999");
  await expect(page.getByRole("link", { name: "К поиску игр" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Portal 2" })).toHaveCount(0);
});
test("missing ratings and offers are explicit rather than fabricated", async ({
  page,
}) => {
  await page.route("**/catalog/details/620.json", (r) =>
    r.fulfill({
      json: {
        ...game,
        metacritic: null,
        steam: null,
        offers: [],
        screenshots: [],
      },
    }),
  );
  await page.goto("#/games/620");
  await expect(page.getByText("Metacritic: нет оценки")).toBeVisible();
  await expect(page.getByText("Steam: нет оценки")).toBeVisible();
  await expect(page.getByText("Скриншоты пока недоступны.")).toBeVisible();
  await expect(
    page.getByText(/Проверенных предложений пока нет/),
  ).toBeVisible();
});
test("visited production game remains readable offline without preloading every game", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4187/umbra/#/login");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.goto("http://127.0.0.1:4187/umbra/#/games/620");
  await expect(
    page.getByRole("heading", { name: "Portal 2", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean(
          await caches.match(
            new URL("catalog/details/620.json", document.baseURI).href,
          ),
        ),
      ),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Portal 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Характеристики", exact: true }),
  ).toBeVisible();
  await context.close();
});
