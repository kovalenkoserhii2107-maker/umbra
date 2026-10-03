import { test, expect, type BrowserContext, type Page } from "@playwright/test";

async function register(page: Page) {
  await page.goto("#/login");
  await page
    .getByRole("button", { name: "Нет аккаунта — зарегистрироваться" })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill("Seeker");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`search-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
}

const page1 = (results: unknown[]) => ({
  page: 1,
  total_pages: 1,
  total_results: results.length,
  results,
});

const MOVIES: Record<string, unknown[]> = {
  дюн: [
    {
      id: 438631,
      title: "Дюна",
      original_title: "Dune",
      release_date: "2021-09-15",
      vote_average: 7.8,
      vote_count: 12000,
      popularity: 90,
      poster_path: null,
    },
  ],
  дюна: [
    {
      id: 438631,
      title: "Дюна",
      original_title: "Dune",
      release_date: "2021-09-15",
      vote_average: 7.8,
      vote_count: 12000,
      popularity: 90,
      poster_path: null,
    },
  ],
  матрица: [
    {
      id: 603,
      title: "Матрица",
      original_title: "The Matrix",
      release_date: "1999-03-30",
      vote_average: 8.2,
      vote_count: 25000,
      popularity: 70,
      poster_path: null,
    },
  ],
};

async function tmdb(context: BrowserContext, queries: string[]) {
  await context.route("https://api.themoviedb.org/**", (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("query") || "";
    if (url.pathname.startsWith("/3/search/")) queries.push(query);
    if (url.pathname === "/3/search/movie")
      return route.fulfill({ json: page1(MOVIES[query] ?? []) });
    if (url.pathname === "/3/search/person" && query === "матрица")
      return route.fulfill({
        json: page1([
          {
            id: 6384,
            name: "Киану Ривз",
            known_for_department: "Acting",
            profile_path: null,
          },
        ]),
      });
    return route.fulfill({ json: page1([]) });
  });
}

test("film search finds titles as letters are typed", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const queries: string[] = [];
  await tmdb(context, queries);
  await register(page);
  await page.goto("#/search");

  const box = page.getByRole("textbox", {
    name: "Поиск фильмов, сериалов и людей",
  });
  await expect(box).toBeFocused();
  // No Enter: results follow the typing.
  await box.pressSequentially("дюн", { delay: 40 });
  await expect(page.getByRole("link", { name: /Дюна/ })).toBeVisible();
  await expect(page).toHaveURL(/q=%D0%B4%D1%8E%D0%BD/);
  // Only the finished word is searched, not every letter.
  expect(queries.filter((q) => q === "д")).toHaveLength(0);

  // The wrong keyboard layout is fixed on the fly.
  await page.getByRole("button", { name: "Очистить" }).click();
  await expect(box).toHaveValue("");
  await box.pressSequentially("l.yf", { delay: 40 });
  await expect(page.getByText("похоже, была не та раскладка")).toBeVisible();
  await expect(page.getByRole("link", { name: /Дюна/ })).toBeVisible();

  // The button searches at once and remembers the query.
  await box.fill("матрица");
  await page.getByRole("button", { name: "Найти" }).click();
  await expect(page.getByRole("link", { name: /Матрица/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Киану Ривз/ })).toBeVisible();
  await page.getByRole("button", { name: "Сериалы" }).click();
  await expect(page.getByRole("link", { name: /Матрица/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Всё" }).click();
  await page.screenshot({ path: ".ui-evidence/search-mobile.png" });

  await page.getByRole("button", { name: "Очистить" }).click();
  await expect(page.getByText("недавно искал")).toBeVisible();
  await page.getByRole("button", { name: "матрица" }).click();
  await expect(page.getByRole("link", { name: /Матрица/ })).toBeVisible();
});
