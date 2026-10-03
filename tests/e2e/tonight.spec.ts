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

test("Claude asks its own questions, picks titles and refines in a new round", async ({
  page,
  context,
}) => {
  const API = "https://umbra-api.test";
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
  const asked: Array<{
    auth: string;
    body: {
      stage: string;
      profile: string;
      steps: Array<Record<string, unknown>>;
    };
  }> = [];
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
      asked.push({ auth: (await request.allHeaders()).authorization, body });
      if (body.stage === "pick")
        return route.fulfill({
          headers: cors,
          json: {
            taste: "Тебе нравятся детективы с иронией.",
            intro: "Искал лёгкий детектив на вечер.",
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
                year: 2019,
                type: "movie",
                reason: "Детектив с юмором — как ты любишь.",
              },
              {
                title: "Пропавший фильм",
                original_title: "Missing Film",
                year: 2001,
                type: "movie",
                reason: "Не найдётся.",
              },
            ],
          },
        });
      let n = 0;
      for (const s of body.steps) n = "shown" in s ? 0 : n + 1;
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
  await context.route("https://api.themoviedb.org/**", (route) => {
    const url = new URL(route.request().url());
    const film = url.searchParams.get("query")?.match(/^Film (\d+)$/);
    if (url.pathname === "/3/search/movie" && film)
      return route.fulfill({
        json: {
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [
            {
              id: 1000 + Number(film[1]),
              title: `Фильм ${film[1]}`,
              release_date: "2020-05-01",
              poster_path: null,
              vote_average: 7,
              vote_count: 900,
              overview: "",
            },
          ],
        },
      });
    if (
      url.pathname === "/3/search/movie" &&
      url.searchParams.get("query") === "Knives Out"
    )
      return route.fulfill({
        json: {
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [
            {
              id: 546554,
              title: "Достать ножи",
              release_date: "2019-11-27",
              poster_path: null,
              vote_average: 7.8,
              vote_count: 12000,
              overview: "Детектив.",
            },
          ],
        },
      });
    return route.fulfill({
      json: { page: 1, total_pages: 1, total_results: 0, results: [] },
    });
  });

  await register(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("#/tonight");
  await expect(page.getByRole("tab", { name: "С Claude" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Начать" }).click();

  await expect(page.getByText("Вопрос Claude 1")).toBeVisible();
  await expect(page.getByText("вопрос 1 из 4")).toBeVisible();
  await page.screenshot({ path: ".ui-evidence/tonight-ai-question.png" });
  await page.getByRole("button", { name: /Ответ 1/ }).click();
  await page.getByRole("button", { name: /Ответ 2/ }).click();
  // Back shows the earlier question again without asking Claude.
  await expect(page.getByText("Вопрос Claude 3")).toBeVisible();
  const before = asked.length;
  await page.getByRole("button", { name: "← Назад" }).click();
  await expect(page.getByText("Вопрос Claude 2")).toBeVisible();
  expect(asked.length).toBe(before);
  await page.getByLabel("Свой ответ").fill("Что-то про ограбление");
  await page.getByRole("button", { name: "Ответить" }).click();
  await page.getByRole("button", { name: /Ответ 3/ }).click();
  await expect(page.getByText("вопрос 4 из 4")).toBeVisible();
  await page.getByRole("button", { name: /Неважно/ }).click();

  const card = page.locator("article", { hasText: "Достать ножи" });
  await expect(page.locator("article", { hasText: "Фильм 1" })).toContainText(
    "Причина 1.",
  );
  await expect(page.getByText("Искал лёгкий детектив на вечер.")).toBeVisible();
  await expect(page.getByText("Пропавший фильм")).toHaveCount(0);
  await page.screenshot({
    path: ".ui-evidence/tonight-ai-picks.png",
    fullPage: true,
  });

  const pick = asked.at(-1)!;
  expect(pick.auth).toMatch(/^Bearer .+/);
  expect(pick.body.stage).toBe("pick");
  expect(pick.body.profile).toContain("В библиотеке 0 тайтлов");
  expect(pick.body.steps).toEqual([
    { question: "Вопрос Claude 1", answer: "Ответ 1" },
    { question: "Вопрос Claude 2", answer: "Что-то про ограбление" },
    { question: "Вопрос Claude 3", answer: "Ответ 3" },
    { question: "Вопрос Claude 4", answer: "Неважно" },
  ]);

  await expect(
    page.getByText("Тебе нравятся детективы с иронией."),
  ).toBeVisible();
  // Six cards; Knives Out (the seventh pick) waits in reserve.
  await expect(page.locator("article")).toHaveCount(6);
  await expect(card).toHaveCount(0);

  // "Seen" adds the film to the collection, offers a rating and brings a new pick.
  const first = page.locator("article", { hasText: "Фильм 1" });
  await first.getByRole("button", { name: "✓ Смотрел" }).click();
  await expect(card).toBeVisible();
  const rate = page.getByRole("group", { name: "Оценка «Фильм 1»" });
  await rate.getByRole("button", { name: "8", exact: true }).click();
  await expect(page.getByText("В коллекции с оценкой 8/10")).toBeVisible();

  // A swipe to the left means "not that".
  const second = page.locator("article", { hasText: "Фильм 2" });
  const box = (await second.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(
      box.x + box.width / 2 - i * 20,
      box.y + box.height / 2,
    );
  await page.mouse.up();
  await expect(page.getByText("✕ Не то")).toBeVisible();
  await expect(page.locator("article")).toHaveCount(5);
  await page.screenshot({
    path: ".ui-evidence/tonight-ai-seen.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: /Уточнить ещё/ }).click();
  await expect(page.getByText("раунд 2 · вопрос 1 из 4")).toBeVisible();
  const shown = (
    asked.at(-1)!.body.steps.at(-1) as {
      shown: Array<{ title: string; verdict: string; rating: number | null }>;
    }
  ).shown;
  expect(shown.find((x) => x.title === "Фильм 1")).toMatchObject({
    verdict: "seen",
    rating: 8,
  });
  expect(shown.find((x) => x.title === "Фильм 2")).toMatchObject({
    verdict: "disliked",
  });
  expect(shown.find((x) => x.title === "Достать ножи")).toMatchObject({
    verdict: null,
  });

  // The film marked as seen is in the collection now.
  await page.goto("#/library");
  await expect(page.getByText("Фильм 1").first()).toBeVisible();
});
