import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// The TV app's WebView: 960×540 CSS px, the site opened with ?tv=1.
test.use({ viewport: { width: 960, height: 540 } });

async function register(page: Page) {
  await page.goto("?tv=1#/login");
  // On TV the email form opens from the sign-in screen (Google and QR first).
  await page.getByRole("button", { name: "Войти по email и паролю" }).click();
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
    // Catalog rows of the home screen; searches find nothing else.
    if (
      url.pathname.startsWith("/3/search/") ||
      url.pathname.startsWith("/3/discover/tv") ||
      url.pathname.startsWith("/3/tv/")
    )
      return route.fulfill({ json: page1([]) });
    return route.fulfill({ json: page1([DUNE, MATRIX]) });
  });
}

const focused = (page: Page) =>
  page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");

/** What has the remote on a TV screen of lanes (src/tv). */
const onScreen = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-focused]")]
      .map((e) => e.textContent?.trim() ?? "")
      .join(" | "),
  );

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
  // The TV's own screens: the menu on top, no mobile tab bar.
  await expect(page.locator("nav.fixed")).toHaveCount(0);
  await expect(page.getByText("На вечер")).toBeVisible();

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
  await expect.poll(() => onScreen(page)).toContain("Смотреть в Netflix");
  await press(page, "Enter", "ArrowRight");
  expect(await onScreen(page)).toBe("Трейлер");
  await press(page, "Enter");
  expect(await page.evaluate(() => (window as any).__calls)).toEqual([
    ["launch", "netflix", "Dune"],
    ["open", "https://www.youtube.com/watch?v=dune-trailer"],
  ]);
  // Apple TV is not installed on this TV: no button for it.
  await expect(page.getByText(/Смотреть в Apple TV/)).toHaveCount(0);

  // Down to the rating: 8 marks the film as seen with that score.
  await press(page, "ArrowDown");
  expect(await onScreen(page)).toBe("1");
  for (let i = 0; i < 7; i++) await press(page, "ArrowRight");
  await press(page, "Enter");
  await expect(page.getByText("Просмотрено · твоя оценка 8")).toBeVisible();

  // The remote's Back: nothing open, so the app goes back in history and
  // focus returns to the result it came from.
  expect(await page.evaluate(() => (window as any).umbraTvBack())).toBe(false);
  await page.goBack();
  await expect(page).toHaveURL(/#\/search/);
  await expect.poll(() => focused(page)).toContain("Дюна");
});

test("TV: home rows, the title behind a poster, Back to it, the collection", async ({
  page,
  context,
}) => {
  await bridge(context);
  await tmdb(context);
  await register(page);

  // The focused poster's title fills the screen above the rows.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Дюна");
  await press(page, "ArrowRight");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Матрица");
  await press(page, "ArrowLeft", "Enter");
  await expect(page).toHaveURL(/#\/title\/movie\/438631/);
  await expect.poll(() => onScreen(page)).toContain("Смотреть в Netflix");
  // "Хочу посмотреть" is the third button.
  await press(page, "ArrowRight", "ArrowRight");
  expect(await onScreen(page)).toBe("＋ Хочу посмотреть");
  await press(page, "Enter");
  await expect(page.getByText("В «Хочу посмотреть»").first()).toBeVisible();

  // Back: the home screen, on the same poster.
  await page.goBack();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Дюна");

  // Up to the menu (past the new «Хочу посмотреть» row), over to Коллекция.
  await press(page, "ArrowUp");
  expect(await onScreen(page)).toBe("Дюна");
  await press(page, "ArrowUp");
  expect(await onScreen(page)).toBe("Лента");
  await press(page, "ArrowRight", "ArrowRight", "ArrowRight", "Enter");
  await expect(page).toHaveURL(/#\/library$/);
  // The router swaps screens in a transition: wait for the collection itself.
  await expect(page.locator('[data-screen="/library"]')).toBeVisible();
  await expect(
    page.getByText("Хочу посмотреть", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Дюна");

  // Filters: up to them, «Тип» → «Сериалы» hides the film; «Сбросить» brings it back.
  await press(page, "ArrowUp");
  expect(await onScreen(page)).toBe("Тип:все");
  await press(page, "Enter");
  expect(await onScreen(page)).toBe("Фильмы и сериалы");
  await press(page, "ArrowRight", "ArrowRight", "Enter");
  expect(await onScreen(page)).toBe("Тип:Сериалы");
  await expect(
    page.getByText("Под эти фильтры ничего нет.", { exact: false }),
  ).toBeVisible();
  for (let i = 0; i < 5; i++) await press(page, "ArrowRight");
  expect(await onScreen(page)).toBe("Сбросить");
  await press(page, "Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Дюна");
  await press(page, "ArrowDown");

  // Back from a row goes to the menu first (the app then leaves).
  expect(await page.evaluate(() => (window as any).umbraTvBack())).toBe(true);
  await expect.poll(() => onScreen(page)).toBe("Коллекция");
  expect(await page.evaluate(() => (window as any).umbraTvBack())).toBe(false);
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
