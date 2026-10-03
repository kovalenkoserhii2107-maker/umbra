import { test, expect, type BrowserContext, type Page } from "@playwright/test";

async function register(page: Page) {
  await page.goto("#/login");
  await page
    .getByRole("button", { name: "Нет аккаунта — зарегистрироваться" })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill("Viewer");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`tonight-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
}

const comedy = (id: number, title: string, extra = {}) => ({
  id,
  title,
  genre_ids: [35],
  vote_average: 7.8,
  vote_count: 4000,
  popularity: 80,
  release_date: "2025-03-01",
  poster_path: null,
  overview: `${title} — смешной фильм.`,
  ...extra,
});

async function tmdb(context: BrowserContext, seen: string[]) {
  const page = (results: unknown[]) => ({
    page: 1,
    total_pages: 1,
    total_results: results.length,
    results,
  });
  await context.route("https://api.themoviedb.org/**", (route) => {
    const url = new URL(route.request().url());
    seen.push(url.pathname + url.search);
    if (url.pathname === "/3/genre/movie/list")
      return route.fulfill({
        json: {
          genres: [
            { id: 35, name: "комедия" },
            { id: 27, name: "ужасы" },
            { id: 18, name: "драма" },
          ],
        },
      });
    if (url.pathname === "/3/discover/movie")
      return route.fulfill({
        json: page([
          comedy(501, "Мальчишник в Вегасе"),
          comedy(502, "Страшно смешно", { genre_ids: [27] }),
          comedy(503, "Тихая комедия", { vote_average: 6.1, popularity: 5 }),
        ]),
      });
    const providers = url.pathname.match(
      /^\/3\/movie\/(\d+)\/watch\/providers$/,
    );
    if (providers)
      return route.fulfill({
        json: {
          results:
            providers[1] === "501"
              ? {
                  UA: {
                    flatrate: [{ provider_id: 8, provider_name: "Netflix" }],
                  },
                }
              : {},
        },
      });
    return route.fulfill({ json: page([]) });
  });
}

test("evening picker asks four questions and picks by mood and services", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seen: string[] = [];
  await tmdb(context, seen);
  await register(page);
  await page.getByRole("link", { name: /Что посмотреть вечером/ }).click();
  await expect(page).toHaveURL(/#\/tonight$/);

  await expect(page.getByText("вопрос 1 из 4")).toBeVisible();
  await page.getByRole("button", { name: /Посмеяться/ }).click();
  await page.getByRole("button", { name: /Фильм до 1,5 часа/ }).click();
  // Back keeps the answers and the order of questions.
  await page.getByRole("button", { name: "← Назад" }).click();
  await expect(page.getByText("вопрос 2 из 4")).toBeVisible();
  await page.getByRole("button", { name: /Фильм до 1,5 часа/ }).click();
  await page.getByRole("button", { name: "Вдвоём" }).click();
  await page.getByRole("button", { name: "Что-то свежее" }).click();

  const card = page.locator("article", { hasText: "Мальчишник в Вегасе" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Смотреть: Netflix");
  await expect(card).toContainText("зрители ставят 7.8");
  // Only my services: the comedy nobody streams here is left out, and the
  // horror never matched the mood.
  await expect(page.getByRole("link", { name: "Тихая комедия" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: "Страшно смешно" })).toHaveCount(
    0,
  );
  const discover = seen.find(
    (u) => u.startsWith("/3/discover/movie") && u.includes("with_genres"),
  )!;
  expect(discover).toContain("with_genres=35");
  expect(discover).toContain("with_runtime.lte=100");
  expect(discover).toContain("watch_region=UA");

  await page.getByLabel(/Только на моих сервисах/).uncheck();
  await expect(page.getByRole("link", { name: "Тихая комедия" })).toBeVisible();

  await card.getByRole("button", { name: "+ Хочу посмотреть" }).click();
  await expect(
    card.getByRole("button", { name: "В «Хочу посмотреть»" }),
  ).toBeDisabled();
  await page.screenshot({
    path: ".ui-evidence/tonight-mobile.png",
    fullPage: true,
  });
});
