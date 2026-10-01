import { test, expect, type BrowserContext, type Page } from "@playwright/test";
const film = {
  id: 101,
  title: "Test Film",
  release_date: "2026-01-01",
  overview: "A test film",
  credits: { cast: [], crew: [] },
  videos: { results: [] },
  "watch/providers": { results: {} },
  external_ids: {},
};
const show = {
  id: 202,
  name: "Test Show",
  first_air_date: "2025-01-01",
  overview: "A test show",
  credits: { cast: [], crew: [] },
  videos: { results: [] },
  "watch/providers": { results: {} },
  external_ids: {},
  genres: [{ id: 18, name: "Драма" }],
  episode_run_time: [40],
  seasons: [{ id: 1, name: "S1", season_number: 1, episode_count: 3 }],
  last_episode_to_air: {
    season_number: 1,
    episode_number: 3,
    air_date: "2025-01-15",
  },
};
const episodes = [1, 2, 3].map((n) => ({
  id: 9000 + n,
  name: `Episode ${n}`,
  episode_number: n,
  season_number: 1,
  air_date: "2025-01-01",
}));
async function catalog(context: BrowserContext) {
  await context.route("https://api.themoviedb.org/**", (route) => {
    const url = route.request().url();
    if (url.includes("/movie/101?")) return route.fulfill({ json: film });
    if (/\/tv\/202\/season\/1\?/.test(url))
      return route.fulfill({
        json: { episodes, name: "S1", season_number: 1 },
      });
    if (url.includes("/tv/202/season/")) return route.fulfill({ json: {} });
    if (url.includes("/tv/202?")) return route.fulfill({ json: show });
    return route.fulfill({
      json: { page: 1, results: [], total_pages: 1, total_results: 0 },
    });
  });
  await context.route(
    /https:\/\/(api.agregarr.org|imdb-top250.mmdju.workers.dev|query.wikidata.org)\//,
    (route) => route.fulfill({ json: [] }),
  );
}
async function register(page: Page, name: string) {
  await page.goto("#/login");
  await page
    .getByRole("button", { name: "Нет аккаунта — зарегистрироваться" })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill(name);
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${name.toLowerCase()}-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
}

test("friends invite, accept and see each other's ratings without notes", async ({
  browser,
}) => {
  const one = await browser.newContext();
  const two = await browser.newContext();
  await catalog(one);
  await catalog(two);
  const a = await one.newPage();
  const b = await two.newPage();
  await register(a, "Anna");
  await register(b, "Boris");

  await a.goto("#/friends");
  await a.getByRole("button", { name: "Пригласить друга" }).click();
  const telegram = await a
    .getByRole("link", { name: /Telegram/ })
    .getAttribute("href");
  const invite = new URL(
    new URL(telegram!).searchParams.get("url")!,
  ).hash.slice(1);
  expect(invite).toMatch(/^\/friends\/invite\/.+/);
  await a.getByRole("button", { name: "Отмена" }).click();

  await b.goto(`#${invite}`);
  await expect(b.getByText("приглашает тебя в друзья")).toBeVisible();
  await expect(b.getByText("Anna", { exact: true })).toBeVisible();
  await b.getByRole("button", { name: "Добавить в друзья" }).click();
  await expect(b.getByText(/ещё не принял заявку/)).toBeVisible();

  await expect(a.getByText("Заявки в друзья")).toBeVisible();
  await a.getByRole("button", { name: "Принять", exact: true }).click();
  await expect(a.getByRole("link", { name: /Boris/ })).toBeVisible();

  await a.goto("#/title/movie/101");
  await a.getByRole("button", { name: "В просмотренные", exact: true }).click();
  await a.getByRole("radio", { name: "8 из 10" }).click();
  await a.getByLabel("Комментарий", { exact: true }).fill("Anna's secret note");
  await a.getByRole("button", { name: "Подтвердить", exact: true }).click();
  await expect(
    a.getByText("Все изменения сохранены", { exact: true }),
  ).toBeVisible();

  await expect
    .poll(
      async () => {
        await b.goto("#/title/movie/101");
        await b.reload();
        await b.getByRole("heading", { name: "Test Film" }).waitFor();
        await b.waitForTimeout(1500);
        return b.getByText("Оценки друзей").count();
      },
      { timeout: 20000 },
    )
    .toBe(1);
  await expect(b.getByText("8/10")).toBeVisible();
  await expect(b.getByText("Anna's secret note")).toHaveCount(0);
  await b.goto("#/friends");
  await b.getByRole("link", { name: /Anna/ }).click();
  await expect(b.getByText("Test Film")).toBeVisible();
  await expect(b.getByText("Anna's secret note")).toHaveCount(0);
  await one.close();
  await two.close();
});

test("series tracking, collection filters, stats and sharing", async ({
  page,
  context,
}) => {
  await catalog(context);
  await register(page, "Viewer");
  await page.goto("#/title/tv/202");
  const share = page.getByRole("button", { name: "Поделиться", exact: true });
  await share.click();
  await expect(page.getByRole("link", { name: /Telegram/ })).toHaveAttribute(
    "href",
    /t\.me\/share\/url\?url=.*title%2Ftv%2F202/,
  );
  // The sheet sits on the visible screen, not at the bottom of a long page.
  await page.setViewportSize({ width: 390, height: 500 });
  const sheet = await page
    .getByRole("dialog", { name: "Поделиться" })
    .boundingBox();
  expect(sheet!.y).toBeGreaterThanOrEqual(0);
  expect(sheet!.y + sheet!.height).toBeLessThanOrEqual(501);
  await page.getByRole("button", { name: "Отмена" }).click();
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole("button", { name: "Смотрю", exact: true }).click();
  await page.getByRole("checkbox", { name: "S1E2 просмотрена" }).click();
  await expect(
    page.getByText("Просмотрено до S1E2 · дальше S1E3"),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "S1E1 просмотрена" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByText("Все изменения сохранены", { exact: true }),
  ).toBeVisible();

  await page.goto("#/");
  await expect(page.getByText("Продолжить смотреть")).toBeVisible();
  await expect(page.getByText("S1E3")).toBeVisible();
  await page.getByRole("button", { name: "✓ Просмотрено" }).click();
  await expect(page.getByText("новых серий нет")).toBeVisible();

  await page.goto("#/library");
  await page.getByRole("button", { name: /Смотрю · 1/ }).click();
  await expect(page).toHaveURL(/status=watching/);
  await expect(page.getByText(/смотрю · S1E3/i)).toBeVisible();
  await page.getByLabel("Тип").selectOption("movie");
  await expect(
    page.getByText("Под эти фильтры ничего не подходит."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await expect(page.getByText("Test Show")).toBeVisible();

  await page.goto("#/stats");
  await expect(page.getByRole("heading", { name: "Статистика" })).toBeVisible();
  await expect(page.getByText("≈2")).toBeVisible();
  await expect(page.getByText("Драма")).toBeVisible();
});
