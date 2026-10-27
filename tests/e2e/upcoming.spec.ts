import { test, expect, type Page } from "@playwright/test";

async function register(page: Page) {
  await page.goto("#/login");
  await page
    .getByRole("button", { name: "Немає акаунту — зареєструватися" })
    .click();
  await page.getByLabel("Ім'я", { exact: true }).fill("Fan");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`soon-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Створити акаунт", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
}

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const list = (results: unknown[]) => ({
  page: 1,
  total_pages: 1,
  total_results: results.length,
  results,
});

test("coming soon rows for films and series, popular first, with dates", async ({
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
    const p = url.searchParams;
    if (
      url.pathname === "/3/discover/movie" &&
      p.get("primary_release_date.gte")
    )
      return route.fulfill({
        json: list([
          {
            id: 901,
            title: "Малий фільм",
            release_date: inDays(1),
            popularity: 20,
            poster_path: "/a.jpg",
          },
          {
            id: 902,
            title: "Головна прем'єра",
            release_date: inDays(40),
            popularity: 400,
            poster_path: "/b.jpg",
          },
        ]),
      });
    if (url.pathname === "/3/discover/tv" && p.get("first_air_date.gte"))
      return route.fulfill({
        json: list([
          {
            id: 911,
            name: "Новий серіал",
            first_air_date: inDays(10),
            popularity: 60,
            poster_path: "/c.jpg",
          },
        ]),
      });
    if (url.pathname === "/3/discover/tv" && p.get("air_date.gte"))
      return route.fulfill({
        json: list([
          {
            id: 912,
            name: "Велике повернення",
            popularity: 500,
            poster_path: "/d.jpg",
          },
        ]),
      });
    if (url.pathname === "/3/tv/912")
      return route.fulfill({
        json: {
          id: 912,
          name: "Велике повернення",
          next_episode_to_air: {
            air_date: inDays(20),
            season_number: 5,
            episode_number: 1,
          },
        },
      });
    return route.fulfill({ json: list([]) });
  });

  await register(page);
  const films = page.locator("section", {
    has: page.getByRole("heading", { name: "Скоро вийдуть фільми" }),
  });
  const shows = page.locator("section", {
    has: page.getByRole("heading", { name: "Скоро вийдуть серіали" }),
  });
  // The most anticipated first, the date under the poster.
  await expect(films.locator(".row-scroll a").first()).toContainText(
    "Головна прем'єра",
  );
  await expect(films).toContainText("завтра");
  await expect(shows.locator(".row-scroll a").first()).toContainText(
    "Велике повернення",
  );
  await expect(shows.locator(".row-scroll a").first()).toContainText(
    /сезон 5 · \d+ [а-яіїєґ]+/,
  );

  await shows.getByRole("link", { name: "Усі" }).click();
  await expect(page).toHaveURL(/#\/feed\/upcoming-tv$/);
  await expect(
    page.getByRole("heading", { name: "Скоро вийдуть серіали" }),
  ).toBeVisible();
  await expect(page.getByText("Новий серіал")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("#/");
  await shows.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".ui-evidence/upcoming.png" });
});
