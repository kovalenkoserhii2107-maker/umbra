import { test, expect, type Page } from "@playwright/test";

async function register(page: Page) {
  await page.goto("#/login");
  await page
    .getByRole("button", { name: "Немає акаунту — зареєструватися" })
    .click();
  await page.getByLabel("Ім'я", { exact: true }).fill("Fan");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`spot-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Створити акаунт", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const list = (results: unknown[]) => ({
  page: 1,
  total_pages: 1,
  total_results: results.length,
  results,
});

const film = (id: number, title: string, vote: number, popularity: number) => ({
  id,
  title,
  release_date: daysAgo(20),
  vote_average: vote,
  vote_count: 900,
  popularity,
  backdrop_path: `/b${id}.jpg`,
  poster_path: `/p${id}.jpg`,
  genre_ids: [18],
});

test("home opens on a fresh, highly rated title that changes between visits", async ({
  page,
  context,
}) => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"><rect width="2" height="3"/></svg>';
  await context.route("https://image.tmdb.org/**", (r) =>
    r.fulfill({ contentType: "image/svg+xml", body: svg }),
  );
  await context.route("https://api.themoviedb.org/**", (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname === "/3/discover/movie" &&
      url.searchParams.get("vote_count.gte")
    )
      return route.fulfill({
        json: list([
          film(801, "Свіжий хіт", 8.4, 500),
          film(802, "Друга новинка", 8.0, 300),
          film(803, "Слабкий новий", 5.9, 900),
        ]),
      });
    if (/^\/3\/(movie|tv)\/\d+$/.test(url.pathname))
      return route.fulfill({ json: {} });
    return route.fulfill({ json: list([]) });
  });

  await register(page);
  const hero = page
    .locator("section")
    .filter({ has: page.locator("h2") })
    .first();
  await expect(hero.getByText("Нове й високо оцінене · ★ 8.4")).toBeVisible();
  await expect(hero.getByRole("heading", { name: "Свіжий хіт" })).toBeVisible();

  // Within the visit it holds still.
  await page.goto("#/library");
  await page.goto("#/");
  await expect(hero.getByRole("heading", { name: "Свіжий хіт" })).toBeVisible();

  // The next visit (a new tab) opens on the next one; the 5.9 never shows.
  const next = await context.newPage();
  await next.goto("/#/");
  const nextHero = next
    .locator("section")
    .filter({ has: next.locator("h2") })
    .first();
  await expect(
    nextHero.getByText("Нове й високо оцінене · ★ 8.0"),
  ).toBeVisible();
  await expect(
    nextHero.getByRole("heading", { name: "Друга новинка" }),
  ).toBeVisible();
});

test("genre and theme shelves load as the home page scrolls and open in full", async ({
  page,
  context,
}) => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"><rect width="2" height="3"/></svg>';
  await context.route("https://image.tmdb.org/**", (r) =>
    r.fulfill({ contentType: "image/svg+xml", body: svg }),
  );
  const asked: string[] = [];
  await context.route("https://api.themoviedb.org/**", (route) => {
    const url = new URL(route.request().url());
    const p = url.searchParams;
    if (url.pathname.startsWith("/3/discover/")) asked.push(url.search);
    if (url.pathname === "/3/discover/movie" && p.get("with_genres") === "878")
      return route.fulfill({
        json: list([film(701, "Космічна одіссея", 7.9, 100)]),
      });
    if (
      url.pathname === "/3/discover/movie" &&
      p.get("with_keywords") === "4379"
    )
      return route.fulfill({
        json: list([film(702, "Петля часу", 7.1, 50)]),
      });
    return route.fulfill({ json: list([]) });
  });

  await register(page);
  await expect(page.getByRole("heading", { name: "Фантастика" })).toBeVisible();
  await page.mouse.wheel(0, 20000);
  await expect(page.getByText("Космічна одіссея")).toBeVisible();
  await page.mouse.wheel(0, 20000);
  await expect(
    page.getByRole("heading", { name: "Подорожі в часі" }),
  ).toBeVisible();
  await expect(page.getByText("Петля часу")).toBeVisible();
  // Empty shelves leave no trace.
  await expect(page.getByRole("heading", { name: "Антиутопії" })).toHaveCount(
    0,
  );

  await page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Фантастика" }) })
    .getByRole("link", { name: "Усі" })
    .click();
  await expect(page).toHaveURL(/#\/feed\/g-scifi$/);
  await expect(page.getByText("Космічна одіссея")).toBeVisible();
  expect(asked.some((q) => q.includes("with_genres=878"))).toBe(true);
});
