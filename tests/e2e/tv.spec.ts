import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// The TV app's WebView: 960×540 CSS px, the site opened with ?tv=1.
test.use({ viewport: { width: 960, height: 540 } });

async function register(page: Page) {
  await page.goto("?tv=1#/login");
  // On TV the email form opens from the sign-in screen (Google and QR first).
  await page.getByRole("button", { name: "Увійти за email та паролем" }).click();
  await page
    .getByRole("button", { name: "Немає акаунту — зареєструватися" })
    .click();
  await page.getByLabel("Ім'я", { exact: true }).fill("Viewer");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`tv-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Створити акаунт", exact: true })
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
        setTimeout(() => send("result", "матриця"), 300);
        setTimeout(() => send("end", ""), 350);
      },
      stopVoice: () => calls.push(["stopVoice"]),
      exitApp: () => calls.push(["exit"]),
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
  title: "Матриця",
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
      if (query === "матриця") return route.fulfill({ json: page1([MATRIX]) });
    }
    if (url.pathname === "/3/movie/438631/reviews")
      return route.fulfill({
        json: {
          ...page1([]),
          total_results: 1,
          results: [
            {
              id: "r1",
              author: "Sand Critic",
              content: "Spice must flow. ".repeat(80),
              author_details: { rating: 9 },
            },
          ],
        },
      });
    if (url.pathname === "/3/movie/438631")
      return route.fulfill({
        json: {
          ...DUNE,
          tagline: "Час настав",
          budget: 165_000_000,
          revenue: 411_000_000,
          credits: {
            cast: [{ id: 1, name: "Тімоті Шаламе", character: "Пол" }],
            crew: [{ id: 2, name: "Дені Вільньов", job: "Director" }],
          },
          overview: "Пустельна планета.",
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
  await expect(page.getByText("На вечір")).toBeVisible();

  // The app opens with the remote on «Стрічка»; each tab opens as the remote
  // reaches it in the menu: no OK needed.
  await expect.poll(() => onScreen(page)).toBe("Стрічка");
  await press(page, "ArrowRight");
  await expect(page).toHaveURL(/#\/search$/);
  await expect(page.locator('[data-screen="/search"]')).toBeVisible();
  expect(await onScreen(page)).toBe("Пошук");
  await press(page, "ArrowDown", "ArrowDown");
  expect(await onScreen(page)).toBe("а");
  const field = page.getByRole("textbox", {
    name: "Пошук фільмів, серіалів та людей",
  });

  // A keyboard plugged into the TV types too.
  await page.keyboard.type("dun");
  await expect(field).toHaveAttribute("data-value", "dun");
  await press(page, "Backspace", "Backspace", "Backspace");
  await expect(field).toHaveAttribute("data-value", "");

  // Letters in alphabetical rows of seven: д, ю, н, а; up/down keep the column.
  await press(
    page,
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
    "ArrowRight",
  );
  expect(await onScreen(page)).toBe("д");
  await press(
    page,
    "Enter",
    "ArrowDown",
    "ArrowDown",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowLeft",
  );
  expect(await onScreen(page)).toBe("ю");
  await press(page, "Enter", "ArrowUp", "ArrowUp");
  expect(await onScreen(page)).toBe("н");
  await press(
    page,
    "Enter",
    "ArrowUp",
    "ArrowUp",
    "ArrowLeft",
    "ArrowLeft",
    "ArrowLeft",
    "Enter",
  );
  await expect(field).toHaveAttribute("data-value", "дюна");
  await expect(page).toHaveURL(/q=%D0%B4%D1%8E%D0%BD%D0%B0/);
  await expect(page.getByText("Дюна").first()).toBeVisible();

  // Off the right end of the keys to the results, then into the title.
  for (let i = 0; i < 7; i++) await press(page, "ArrowRight");
  expect(await onScreen(page)).toContain("Дюна");
  await press(page, "Enter");
  await expect(page).toHaveURL(/#\/title\/movie\/438631/);

  // "Дивитися" opens the installed app; the trailer goes to YouTube.
  await expect.poll(() => onScreen(page)).toContain("Дивитися в Netflix");
  await press(page, "Enter", "ArrowRight");
  // Lampa opens the same title's card (this app does not report it: try).
  expect(await onScreen(page)).toBe("Відкрити в Lampa");
  await press(page, "Enter", "ArrowRight");
  expect(await onScreen(page)).toBe("Трейлер");
  await press(page, "Enter");
  expect(await page.evaluate(() => (window as any).__calls)).toEqual([
    ["launch", "netflix", "Dune"],
    [
      "open",
      "intent://www.themoviedb.org/movie/438631#Intent;scheme=https;action=android.intent.action.VIEW;package=top.rootu.lampa;end",
    ],
    ["open", "https://www.youtube.com/watch?v=dune-trailer"],
  ]);
  // Apple TV is not installed on this TV: no button for it.
  await expect(page.getByText(/Дивитися в Apple TV/)).toHaveCount(0);

  // Down to the rating: 8 marks the film as seen with that score.
  await press(page, "ArrowDown");
  expect(await onScreen(page)).toBe("1");
  for (let i = 0; i < 7; i++) await press(page, "ArrowRight");
  await press(page, "Enter");
  await expect(page.getByText("Переглянуто · твоя оцінка 8")).toBeVisible();

  // What the phone shows is here too: the director, the facts, reviews to read.
  await expect(page.getByText("Дені Вільньов").first()).toBeVisible();
  await expect(page.getByText("$165 млн")).toBeVisible();
  for (
    let i = 0;
    i < 10 && !(await onScreen(page)).includes("Sand Critic");
    i++
  )
    await press(page, "ArrowDown");
  expect(await onScreen(page)).toContain("Sand Critic");
  await press(page, "Enter");
  const reader = page.getByRole("dialog", { name: "Sand Critic" });
  await expect(reader).toBeVisible();
  expect(await page.evaluate(() => (window as any).umbraTvBack())).toBe(true);
  await expect(reader).toHaveCount(0);

  // The remote's Back: nothing open, so the app goes back in history and
  // focus returns to the result it came from.
  expect(await page.evaluate(() => (window as any).umbraTvBack())).toBe(false);
  await page.goBack();
  await expect(page).toHaveURL(/#\/search/);
  await expect.poll(() => onScreen(page)).toContain("Дюна");
  // Left goes back to the letters, where the remote left them (the row's end).
  await press(page, "ArrowLeft");
  expect(await onScreen(page)).toBe("е");
});

test("TV: home rows, the title behind a poster, Back to it, the collection", async ({
  page,
  context,
}) => {
  await bridge(context);
  await tmdb(context);
  await register(page);

  // The app opens on the menu; down to the rows, the focused poster's title
  // fills the screen above them.
  await expect.poll(() => onScreen(page)).toBe("Стрічка");
  await press(page, "ArrowDown");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Дюна");
  await press(page, "ArrowRight");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Матриця");
  await press(page, "ArrowLeft", "Enter");
  await expect(page).toHaveURL(/#\/title\/movie\/438631/);
  await expect.poll(() => onScreen(page)).toContain("Дивитися в Netflix");
  // "Хочу подивитися" comes after Netflix, Lampa and the trailer.
  await press(page, "ArrowRight", "ArrowRight", "ArrowRight");
  expect(await onScreen(page)).toBe("＋ Хочу подивитися");
  await press(page, "Enter");
  await expect(page.getByText("У «Хочу подивитися»").first()).toBeVisible();

  // Back: the home screen, on the same poster.
  await page.goBack();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Дюна");

  // Up to the menu (past the new «Хочу подивитися» row), over to Колекція.
  await press(page, "ArrowUp");
  expect(await onScreen(page)).toBe("Дюна");
  await press(page, "ArrowUp");
  expect(await onScreen(page)).toBe("Стрічка");
  await press(page, "ArrowRight", "ArrowRight", "ArrowRight");
  await expect(page).toHaveURL(/#\/library$/);
  // The router swaps screens in a transition: wait for the collection itself.
  await expect(page.locator('[data-screen="/library"]')).toBeVisible();
  await expect(
    page.getByText("Хочу подивитися", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Дюна");

  // Opened from the menu, the remote is still on it; filters are just below.
  expect(await onScreen(page)).toBe("Колекція");
  // Filters: down to them, «Тип» → «Серіали» hides the film; «Скинути» brings it back.
  await press(page, "ArrowDown");
  expect(await onScreen(page)).toBe("Тип:всі");
  await press(page, "Enter");
  expect(await onScreen(page)).toBe("Фільми та серіали");
  await press(page, "ArrowRight", "ArrowRight", "Enter");
  expect(await onScreen(page)).toBe("Тип:Серіали");
  await expect(
    page.getByText("Під ці фільтри нічого немає.", { exact: false }),
  ).toBeVisible();
  for (let i = 0; i < 5; i++) await press(page, "ArrowRight");
  expect(await onScreen(page)).toBe("Скинути");
  await press(page, "Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Дюна");
  await press(page, "ArrowDown");

  // Back from a row goes to the menu first; from another tab — to «Стрічка»,
  // never out of the app.
  const back = () => page.evaluate(() => (window as any).umbraTvBack());
  expect(await back()).toBe(true);
  await expect.poll(() => onScreen(page)).toBe("Колекція");
  expect(await back()).toBe(true);
  await expect(page).toHaveURL(/#\/$/);
  await expect.poll(() => onScreen(page)).toBe("Стрічка");
  // On «Стрічка»: the first Back says how to leave, a second one soon closes.
  const exits = () =>
    page.evaluate(() =>
      (window as any).__calls.filter((c: string[]) => c[0] === "exit"),
    );
  expect(await back()).toBe(true);
  await expect(
    page.getByText("Натисніть «Назад» ще раз, щоб вийти"),
  ).toBeVisible();
  expect(await exits()).toHaveLength(0);
  expect(await back()).toBe(true);
  expect(await exits()).toHaveLength(1);
});

test("TV: voice search through the app", async ({ page, context }) => {
  await bridge(context);
  await tmdb(context);
  await register(page);
  await page.goto("?tv=1#/search");
  await expect.poll(() => onScreen(page)).toBe("а");
  await press(page, "ArrowUp");
  expect(await onScreen(page)).toBe("Голосом");
  await press(page, "Enter");
  await expect(page).toHaveURL(/q=%D0%BC%D0%B0%D1%82%D1%80%D0%B8%D1%86%D1%8F/);
  await expect(
    page.getByRole("textbox", { name: "Пошук фільмів, серіалів та людей" }),
  ).toHaveAttribute("data-value", "матриця");
  await expect(page.getByText("Матриця").first()).toBeVisible();
  expect(await page.evaluate(() => (window as any).__calls)).toEqual([
    ["voice", "uk-UA"],
  ]);
});
