import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// «На вечер» on the TV (src/tv/TvTonight.tsx): remote only, 960×540.
test.use({ viewport: { width: 960, height: 540 } });

const API = "https://umbra-api.test";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function register(page: Page) {
  await page.goto("?tv=1#/login");
  await page.getByRole("button", { name: "Войти по email и паролю" }).click();
  await page
    .getByRole("button", { name: "Нет аккаунта — зарегистрироваться" })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill("Sofa");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`evening-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
}

const onScreen = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-focused]")]
      .map((e) => e.textContent?.trim() ?? "")
      .join(" | "),
  );

async function press(page: Page, ...keys: string[]) {
  for (const key of keys) await page.keyboard.press(key);
}

const film = (id: number, title: string) => ({
  id,
  title,
  release_date: "2020-05-01",
  poster_path: null,
  backdrop_path: null,
  vote_average: 7,
  vote_count: 900,
  genre_ids: [35],
  popularity: 50,
  overview: `${title}: сюжет.`,
});

async function tmdb(context: BrowserContext) {
  const page = (results: unknown[]) => ({
    page: 1,
    total_pages: 1,
    total_results: results.length,
    results,
  });
  await context.route("https://api.themoviedb.org/**", (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("query") || "";
    const n = query.match(/^Film (\d+)$/);
    if (url.pathname === "/3/search/movie" && n)
      return route.fulfill({
        json: page([film(1000 + Number(n[1]), `Фильм ${n[1]}`)]),
      });
    if (url.pathname === "/3/search/movie" && query === "Knives Out")
      return route.fulfill({ json: page([film(546554, "Достать ножи")]) });
    // "Only on my services" is on by default: one film is on Netflix.
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
    if (url.pathname.startsWith("/3/genre/"))
      return route.fulfill({
        json: {
          genres: [
            { id: 35, name: "комедия" },
            { id: 18, name: "драма" },
          ],
        },
      });
    if (url.pathname === "/3/discover/movie")
      return route.fulfill({
        json: page([
          film(501, "Мальчишник в Вегасе"),
          film(502, "Тихая комедия"),
        ]),
      });
    return route.fulfill({ json: page([]) });
  });
}

test("TV evening with Claude: questions fly into the trail, picks are dealt, «Не то» brings a new one", async ({
  page,
  context,
}) => {
  const asked: Array<{ stage: string; steps: unknown[] }> = [];
  await context.route(`${API}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    if (url.pathname === "/health")
      return route.fulfill({
        headers: cors,
        json: { ok: true, services: { ai: true } },
      });
    if (url.pathname === "/ai/tonight") {
      const body = JSON.parse(request.postData() || "{}");
      asked.push(body);
      if (body.stage === "pick")
        return route.fulfill({
          headers: cors,
          json: {
            taste: "Тебе нравятся детективы с иронией.",
            intro: "",
            picks: [
              ...Array.from({ length: 6 }, (_, i) => ({
                title: `Фильм ${i + 1}`,
                original_title: `Film ${i + 1}`,
                year: 2020,
                type: "movie",
                reason: `Причина ${i + 1}.`,
              })),
              {
                title: "Достать ножи",
                original_title: "Knives Out",
                year: 2020,
                type: "movie",
                reason: "Детектив с юмором.",
              },
            ],
          },
        });
      const n = body.steps.length;
      return route.fulfill({
        headers: cors,
        json: {
          question: `Вопрос Claude ${n + 1}`,
          options: [
            { label: `Ответ ${n + 1}`, hint: "подсказка" },
            { label: "Неважно", hint: "" },
          ],
          allow_custom: true,
        },
      });
    }
    return route.fulfill({ status: 404, headers: cors, json: {} });
  });
  await tmdb(context);
  await register(page);

  await page.goto("?tv=1#/tonight");
  await expect(page.locator('[data-screen="/tonight"]')).toBeVisible();
  await expect.poll(() => onScreen(page)).toContain("С Claude");
  await press(page, "Enter");

  // Four questions; each answer joins the trail at the top.
  for (let n = 1; n <= 4; n++) {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `Вопрос Claude ${n}`,
    );
    for (let k = 1; k < n; k++)
      await expect(page.getByText(`Ответ ${k}`, { exact: true })).toBeVisible();
    await expect.poll(() => onScreen(page)).toContain(`Ответ ${n}`);
    await press(page, "Enter");
  }

  // The picks: the focused one fills the screen with Claude's reason.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Фильм 1", {
    timeout: 15_000,
  });
  await expect(
    page.getByText("Тебе нравятся детективы с иронией."),
  ).toBeVisible();
  await expect(page.getByText("Причина 1.")).toBeVisible();
  expect(asked.map((a) => a.stage)).toEqual([
    "ask",
    "ask",
    "ask",
    "ask",
    "pick",
  ]);
  await press(page, "ArrowRight");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Фильм 2");

  // Down to the buttons of that pick: «Не то» sends it away, a new one comes.
  await press(page, "ArrowDown");
  expect(await onScreen(page)).toContain("Подробнее");
  await press(page, "ArrowRight", "ArrowRight", "ArrowRight");
  expect(await onScreen(page)).toContain("Не то");
  await press(page, "Enter");
  await expect(page.getByText("Достать ножи").first()).toBeVisible();
  await expect(
    page.locator(
      '[data-lane="picks"] .tv-deal, [data-lane="picks"] .tv-dismiss',
    ),
  ).toHaveCount(6);
  await expect(page.getByText("Фильм 2", { exact: true })).toHaveCount(0);

  // «Хочу посмотреть» puts the focused pick on the shelf.
  await press(page, "ArrowUp");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
    "Фильм 2",
  );
  // Its buttons start from the first again.
  await press(page, "ArrowDown");
  expect(await onScreen(page)).toBe("Подробнее");
  await press(page, "ArrowRight", "Enter");
  await expect(page.getByText("✓ В «Хочу посмотреть»")).toBeVisible();

  // «Смотрел» asks for a score right away, starting from 5.
  const seen = await page.getByRole("heading", { level: 1 }).textContent();
  await press(page, "ArrowRight");
  expect(await onScreen(page)).toBe("✓ Смотрел");
  await press(page, "Enter");
  await expect(page.getByText(`Как тебе «${seen}»?`)).toBeVisible();
  expect(await onScreen(page)).toBe("5");
  await press(page, "ArrowRight", "ArrowRight", "ArrowRight");
  expect(await onScreen(page)).toBe("8");
  await press(page, "Enter");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(seen!);

  // More: the next round goes to Claude with what was shown.
  await press(page, "ArrowDown", "ArrowDown");
  expect(await onScreen(page)).toBe("Ещё варианты");
  await press(page, "Enter");
  await expect.poll(() => asked.length).toBe(6);
  expect(asked[5].stage).toBe("pick");
  expect(JSON.stringify(asked[5].steps)).toContain('"verdict":"disliked"');
  expect(JSON.stringify(asked[5].steps)).toContain(
    '"verdict":"seen","rating":8',
  );
});

test("TV quick evening: four questions, Back goes to the previous one, picks are shown", async ({
  page,
  context,
}) => {
  await context.route(`${API}/**`, (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({
          headers: cors,
          json: { ok: true, services: { ai: false } },
        }),
  );
  await tmdb(context);
  await register(page);
  await page.goto("?tv=1#/tonight");
  await expect.poll(() => onScreen(page)).toContain("Быстрый подбор");
  await press(page, "Enter");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Какое настроение?",
  );
  await press(page, "Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Фильм или сериал?",
  );
  await expect(page.getByText("Посмеяться", { exact: true })).toBeVisible();
  // The remote's Back: the previous question.
  expect(await page.evaluate(() => (window as any).umbraTvBack())).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Какое настроение?",
  );
  // Посмеяться, «Неважно» for the format, alone, «Неважно» for the age.
  for (const [q, right] of [
    ["Какое настроение?", 0],
    ["Фильм или сериал?", 3],
    ["С кем смотришь?", 0],
    ["Свежее или проверенное?", 2],
  ] as const) {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(q);
    await expect.poll(() => onScreen(page)).not.toBe("");
    for (let k = 0; k < right; k++) await press(page, "ArrowRight");
    await press(page, "Enter");
  }
  await expect(page.getByText("Изменить ответы")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Мальчишник в Вегасе",
  );
  await expect(page.getByText("есть на Netflix")).toBeVisible();
  expect(await page.evaluate(() => (window as any).umbraTvBack())).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Что посмотреть вечером?",
  );
});
