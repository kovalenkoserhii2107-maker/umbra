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
