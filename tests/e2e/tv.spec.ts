import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// The TV app's WebView: 960×540 CSS px, the site opened with ?tv=1.
test.use({ viewport: { width: 960, height: 540 } });

async function register(page: Page) {
  await page.goto("?tv=1#/login");
  await page
    .getByRole("button", { name: "Нет аккаунта — зарегистрироваться" })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill("Viewer");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`tv-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
}

/** The Android app's window.UmbraTV; calls are kept in window.__calls. */
async function bridge(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const calls: unknown[][] = [];
    w.__calls = calls;
    const send = (state: string, text: string) =>
      window.dispatchEvent(
        new CustomEvent("umbratv", { detail: { type: "voice", state, text } }),
      );
    w.UmbraTV = {
      version: () => "test",
      installedApps: () => JSON.stringify({ youtube: true, netflix: true }),
      openExternal: (url: string) => calls.push(["open", url]),
      launchApp: (app: string, query: string) =>
        calls.push(["launch", app, query]),
      voiceAvailable: () => true,
      startVoice: (language: string) => {
        calls.push(["voice", language]);
        setTimeout(() => send("listening", ""), 50);
        setTimeout(() => send("partial", "мат"), 150);
        setTimeout(() => send("result", "матрица"), 300);
        setTimeout(() => send("end", ""), 350);
      },
      stopVoice: () => calls.push(["stopVoice"]),
    };
  });
}

const page1 = (results: unknown[]) => ({
  page: 1,
  total_pages: 1,
  total_results: results.length,
  results,
});

const DUNE = {
  id: 438631,
  title: "Дюна",
  original_title: "Dune",
  release_date: "2021-09-15",
  vote_average: 7.8,
  vote_count: 12000,
  popularity: 90,
  poster_path: null,
};
const MATRIX = {
  id: 603,
  title: "Матрица",
  original_title: "The Matrix",
  release_date: "1999-03-30",
  vote_average: 8.2,
  vote_count: 25000,
  popularity: 70,
  poster_path: null,
};

async function tmdb(context: BrowserContext) {
  await context.route("https://api.themoviedb.org/**", (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("query") || "";
    if (url.pathname === "/3/search/movie") {
      if (query === "дюна") return route.fulfill({ json: page1([DUNE]) });
      if (query === "матрица") return route.fulfill({ json: page1([MATRIX]) });
    }
    if (url.pathname === "/3/movie/438631")
      return route.fulfill({
        json: {
          ...DUNE,
          overview: "Пустынная планета.",
          genres: [],
          videos: {
            results: [
              {
                key: "dune-trailer",
                site: "YouTube",
                type: "Trailer",
                name: "Трейлер",
                official: true,
                iso_639_1: "ru",
              },
            ],
          },
          "watch/providers": {
            results: {
              UA: {
                link: "https://www.themoviedb.org/movie/438631/watch",
                flatrate: [{ provider_id: 8, provider_name: "Netflix" }],
                buy: [{ provider_id: 2, provider_name: "Apple TV" }],
              },
            },
          },
        },
      });
    return route.fulfill({ json: page1([]) });
  });
}

const focused = (page: Page) =>
  page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");

async function press(page: Page, ...keys: string[]) {
  for (const key of keys) await page.keyboard.press(key);
}

test("TV: remote types on the on-screen keyboard, opens the title, watches and goes back", async ({
  page,
  context,
}) => {
  await bridge(context);
  await tmdb(context);
  await register(page);
  await expect(page.locator("html")).toHaveClass(/\btv\b/);
  // No mobile tab bar; the top menu is there instead.
  await expect(page.locator("nav.fixed")).toBeHidden();
  await expect(
    page.getByRole("banner").getByRole("link", { name: "На вечер" }),
  ).toBeVisible();

  await page.goto("?tv=1#/search");
  await expect.poll(() => focused(page)).toBe("а");
  const field = page.getByLabel("Поиск фильмов, сериалов и людей");
  await expect(field).toHaveAttribute("readonly", "");

  // Letters in alphabetical rows of seven: д, ю, н, а.
  await press(page, "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight");
  expect(await focused(page)).toBe("д");
  await press(page, "Enter", "ArrowDown", "ArrowDown", "ArrowDown");
  await press(page, "ArrowDown", "ArrowLeft", "Enter");
  await press(page, "ArrowUp", "ArrowUp", "ArrowLeft", "ArrowLeft");
  await press(page, "ArrowLeft", "Enter", "ArrowUp", "ArrowUp", "Enter");
  await expect(field).toHaveValue("дюна");
  await expect(page).toHaveURL(/q=%D0%B4%D1%8E%D0%BD%D0%B0/);
  const result = page.getByRole("link", { name: /Дюна/ }).first();
  await expect(result).toBeVisible();

  // To the results on the right, then into the title.
  for (let i = 0; i < 12 && !(await focused(page)).includes("Дюна"); i++)
    await press(
      page,
      (await focused(page)).length === 1 ? "ArrowRight" : "ArrowDown",
    );
  expect(await focused(page)).toContain("Дюна");
  await press(page, "Enter");
  await expect(page).toHaveURL(/#\/title\/movie\/438631/);

  // "Смотреть" opens the installed app; the trailer goes to YouTube.
  await expect.poll(() => focused(page)).toContain("Смотреть в Netflix");
  await press(page, "Enter", "ArrowRight");
  expect(await focused(page)).toContain("Трейлер");
  await press(page, "Enter");
  expect(await page.evaluate(() => (window as any).__calls)).toEqual([
    ["launch", "netflix", "Dune"],
    ["open", "https://www.youtube.com/watch?v=dune-trailer"],
  ]);
  // Apple TV is not installed on this TV: no button for it.
  await expect(page.getByRole("button", { name: /Apple TV/ })).toHaveCount(0);

  // The remote's Back: nothing open, so the app goes back in history and
  // focus returns to the result it came from.
  expect(await page.evaluate(() => (window as any).umbraTvBack())).toBe(false);
  await page.goBack();
  await expect(page).toHaveURL(/#\/search/);
  await expect.poll(() => focused(page)).toContain("Дюна");
});

test("TV: voice search through the app", async ({ page, context }) => {
  await bridge(context);
  await tmdb(context);
  await register(page);
  await page.goto("?tv=1#/search");
  await expect.poll(() => focused(page)).toBe("а");
  await press(page, "ArrowUp");
  expect(await focused(page)).toBe("Сказать голосом");
  await press(page, "Enter");
  await expect(page).toHaveURL(/q=%D0%BC%D0%B0%D1%82%D1%80%D0%B8%D1%86%D0%B0/);
  await expect(page.getByLabel("Поиск фильмов, сериалов и людей")).toHaveValue(
    "матрица",
  );
  await expect(
    page.getByRole("link", { name: /Матрица/ }).first(),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).__calls)).toEqual([
    ["voice", "ru-RU"],
  ]);
});
