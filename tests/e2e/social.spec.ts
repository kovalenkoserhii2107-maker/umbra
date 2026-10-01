import { test, expect, type BrowserContext, type Page } from "@playwright/test";
const film = {
  id: 101,
  title: "Test Film",
  release_date: "2026-01-01",
  overview: "A test film",
  credits: { cast: [], crew: [] },
  videos: { results: [] },
  "watch/providers": { results: {} },
  external_ids: {},
};
const show = {
  id: 202,
  name: "Test Show",
  first_air_date: "2025-01-01",
  overview: "A test show",
  credits: { cast: [], crew: [] },
  videos: { results: [] },
  "watch/providers": { results: {} },
  external_ids: { imdb_id: "tt0000202" },
  genres: [{ id: 18, name: "Драма" }],
  episode_run_time: [40],
  seasons: [{ id: 1, name: "S1", season_number: 1, episode_count: 3 }],
  last_episode_to_air: {
    season_number: 1,
    episode_number: 3,
    air_date: "2025-01-15",
  },
};
const episodes = [1, 2, 3].map((n) => ({
  id: 9000 + n,
  name: `Episode ${n}`,
  episode_number: n,
  season_number: 1,
  air_date: "2025-01-01",
}));
const rich = {
  id: 303,
  title: "Стражи Галактики. Часть 2",
  original_title: "Guardians of the Galaxy Vol. 2",
  original_language: "en",
  release_date: "2017-04-19",
  runtime: 136,
  status: "Released",
  vote_average: 7.6,
  vote_count: 21000,
  overview: "Стражи пытаются удержать команду вместе.",
  genres: [{ id: 28, name: "боевик" }],
  budget: 200000000,
  revenue: 863756051,
  homepage: "https://example.com/gotg2",
  production_companies: [{ id: 420, name: "Marvel Studios" }],
  production_countries: [
    { iso_3166_1: "US", name: "United States of America" },
  ],
  spoken_languages: [{ iso_639_1: "en" }],
  belongs_to_collection: { id: 10, name: "Стражи Галактики" },
  external_ids: { imdb_id: "tt3896198", wikidata_id: "Q20001199" },
  credits: {
    cast: [],
    crew: [
      { id: 1, name: "James Gunn", job: "Director", profile_path: null },
      {
        id: 2,
        name: "Tyler Bates",
        job: "Original Music Composer",
        profile_path: null,
      },
    ],
  },
  videos: {
    results: [
      {
        key: "vid-en",
        site: "YouTube",
        type: "Trailer",
        name: "Trailer",
        official: true,
        iso_639_1: "en",
      },
      {
        key: "vid-ru",
        site: "YouTube",
        type: "Trailer",
        name: "Трейлер",
        official: true,
        iso_639_1: "ru",
      },
      {
        key: "vid-bts",
        site: "YouTube",
        type: "Featurette",
        name: "Making of",
        official: true,
        iso_639_1: "en",
      },
    ],
  },
  images: {
    backdrops: [
      { file_path: "/s1.jpg", iso_639_1: null },
      { file_path: "/s2.jpg", iso_639_1: null },
    ],
  },
  release_dates: {
    results: [
      {
        iso_3166_1: "UA",
        release_dates: [
          {
            release_date: "2017-05-04T00:00:00.000Z",
            type: 3,
            certification: "16+",
          },
          {
            release_date: "2017-08-22T00:00:00.000Z",
            type: 4,
            certification: "",
          },
        ],
      },
    ],
  },
  "watch/providers": {
    results: {
      UA: {
        link: "https://www.themoviedb.org/movie/303/watch?locale=UA",
        flatrate: [
          {
            provider_id: 337,
            provider_name: "Disney Plus",
            logo_path: "/d.jpg",
          },
        ],
        rent: [
          { provider_id: 2, provider_name: "Apple TV", logo_path: "/a.jpg" },
        ],
      },
    },
  },
  recommendations: {
    page: 1,
    total_pages: 1,
    total_results: 1,
    results: [{ id: 305, title: "Мстители: Война бесконечности" }],
  },
  similar: { page: 1, total_pages: 1, total_results: 0, results: [] },
};

async function catalog(context: BrowserContext) {
  await context.route("https://api.themoviedb.org/**", (route) => {
    const url = route.request().url();
    if (url.includes("/movie/101?")) return route.fulfill({ json: film });
    if (/\/tv\/202\/season\/1\?/.test(url))
      return route.fulfill({
        json: { episodes, name: "S1", season_number: 1 },
      });
    if (url.includes("/tv/202/season/")) return route.fulfill({ json: {} });
    if (url.includes("/tv/202?")) return route.fulfill({ json: show });
    if (url.includes("/movie/303/reviews"))
      return route.fulfill({
        json: {
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [
            {
              id: "r1",
              author: "critic42",
              author_details: { rating: 8 },
              content: "A fun, heartfelt sequel.",
              created_at: "2017-05-06T00:00:00Z",
              url: "https://www.themoviedb.org/review/r1",
            },
          ],
        },
      });
    if (url.includes("/movie/303?")) return route.fulfill({ json: rich });
    if (/\/person\/1\?/.test(url))
      return route.fulfill({
        json: url.includes("language=en-US")
          ? { biography: "James Gunn is an American filmmaker." }
          : {
              id: 1,
              name: "James Gunn",
              gender: 2,
              biography: "",
              birthday: "1966-08-05",
              place_of_birth: "St. Louis, Missouri, USA",
              known_for_department: "Directing",
              external_ids: { imdb_id: "nm0348181" },
              combined_credits: {
                cast: [],
                crew: [
                  {
                    id: 303,
                    title: "Стражи Галактики. Часть 2",
                    media_type: "movie",
                    release_date: "2017-04-19",
                    job: "Director",
                    department: "Directing",
                    vote_count: 21000,
                  },
                  {
                    id: 303,
                    title: "Стражи Галактики. Часть 2",
                    media_type: "movie",
                    release_date: "2017-04-19",
                    job: "Screenplay",
                    department: "Writing",
                    vote_count: 21000,
                  },
                  {
                    id: 301,
                    title: "Стражи Галактики",
                    media_type: "movie",
                    release_date: "2014-07-30",
                    job: "Director",
                    department: "Directing",
                    vote_count: 27000,
                  },
                ],
              },
            },
      });
    if (url.includes("/collection/10?"))
      return route.fulfill({
        json: {
          id: 10,
          name: "Стражи Галактики (Коллекция)",
          parts: [
            { id: 301, title: "Стражи Галактики", release_date: "2014-07-30" },
            rich,
            {
              id: 304,
              title: "Стражи Галактики. Часть 3",
              release_date: "2023-05-03",
            },
          ],
        },
      });
    if (url.includes("/movie/now_playing"))
      return route.fulfill({
        json: {
          page: 1,
          results: [{ ...film, poster_path: "/p.jpg" }],
          total_pages: 1,
          total_results: 1,
        },
      });
    return route.fulfill({
      json: { page: 1, results: [], total_pages: 1, total_results: 0 },
    });
  });
  await context.route(
    /https:\/\/(api.agregarr.org|imdb-top250.mmdju.workers.dev|query.wikidata.org)\//,
    (route) => route.fulfill({ json: [] }),
  );
  await context.route("https://www.omdbapi.com/**", (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).searchParams.get("apikey") === "demo-key"
          ? {
              Response: "True",
              Ratings: [
                { Source: "Rotten Tomatoes", Value: "93%" },
                { Source: "Metacritic", Value: "79/100" },
              ],
              Metascore: "79",
              Awards: "Nominated for 1 Oscar. 15 wins & 62 nominations total",
              BoxOffice: "$389,813,101",
              Rated: "PG-13",
              imdbVotes: "828,114",
              imdbRating: "7.6",
            }
          : { Response: "False", Error: "Invalid API key!" },
    }),
  );
  await context.route("https://image.tmdb.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="342" height="513"><rect width="342" height="513" fill="#333"/></svg>',
    }),
  );
}
async function register(page: Page, name: string) {
  await page.goto("#/login");
  await page
    .getByRole("button", { name: "Нет аккаунта — зарегистрироваться" })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill(name);
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${name.toLowerCase()}-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
}

test("friends invite, accept and see each other's ratings without notes", async ({
  browser,
}) => {
  const one = await browser.newContext();
  const two = await browser.newContext();
  await catalog(one);
  await catalog(two);
  const a = await one.newPage();
  const b = await two.newPage();
  await register(a, "Anna");
  await register(b, "Boris");

  await a.goto("#/friends");
  await a.getByRole("button", { name: "Пригласить друга" }).click();
  const telegram = await a
    .getByRole("link", { name: /Telegram/ })
    .getAttribute("href");
  const invite = new URL(
    new URL(telegram!).searchParams.get("url")!,
  ).hash.slice(1);
  expect(invite).toMatch(/^\/friends\/invite\/.+/);
  await a.getByRole("button", { name: "Отмена" }).click();

  await b.goto(`#${invite}`);
  await expect(b.getByText("приглашает тебя в друзья")).toBeVisible();
  await expect(b.getByText("Anna", { exact: true })).toBeVisible();
  await b.getByRole("button", { name: "Добавить в друзья" }).click();
  await expect(b.getByText(/ещё не принял заявку/)).toBeVisible();

  await expect(a.getByText("Заявки в друзья")).toBeVisible();
  await a.getByRole("button", { name: "Принять", exact: true }).click();
  await expect(a.getByRole("link", { name: /Boris/ })).toBeVisible();

  await a.goto("#/title/movie/101");
  await a.getByRole("button", { name: "В просмотренные", exact: true }).click();
  await a.getByRole("radio", { name: "8 из 10" }).click();
  await a.getByLabel("Комментарий", { exact: true }).fill("Anna's secret note");
  await a.getByRole("button", { name: "Подтвердить", exact: true }).click();
  await expect(
    a.getByText("Все изменения сохранены", { exact: true }),
  ).toBeVisible();

  await expect
    .poll(
      async () => {
        await b.goto("#/title/movie/101");
        await b.reload();
        await b.getByRole("heading", { name: "Test Film" }).waitFor();
        await b.waitForTimeout(1500);
        return b.getByText("Оценки друзей").count();
      },
      { timeout: 20000 },
    )
    .toBe(1);
  await expect(b.getByText("8/10")).toBeVisible();
  // The friend's mark also shows on posters in the feeds.
  await b.goto("#/");
  await expect(b.getByLabel("Друзья: Anna: 8/10").first()).toBeVisible();
  await expect(b.getByText("Anna's secret note")).toHaveCount(0);
  await b.goto("#/friends");
  await b.getByRole("link", { name: /Anna/ }).click();
  await expect(b.getByText("Test Film")).toBeVisible();
  await expect(b.getByText("Anna's secret note")).toHaveCount(0);
  await one.close();
  await two.close();
});

test("series tracking, collection filters, stats and sharing", async ({
  page,
  context,
}) => {
  await catalog(context);
  await register(page, "Viewer");
  await page.goto("#/title/tv/202");
  const share = page.getByRole("button", { name: "Поделиться", exact: true });
  await share.click();
  await expect(page.getByRole("link", { name: /Telegram/ })).toHaveAttribute(
    "href",
    /t\.me\/share\/url\?url=.*title%2Ftv%2F202/,
  );
  // The sheet sits on the visible screen, not at the bottom of a long page.
  await page.setViewportSize({ width: 390, height: 500 });
  const sheet = await page
    .getByRole("dialog", { name: "Поделиться" })
    .boundingBox();
  expect(sheet!.y).toBeGreaterThanOrEqual(0);
  expect(sheet!.y + sheet!.height).toBeLessThanOrEqual(501);
  await page.getByRole("button", { name: "Отмена" }).click();
  await page.setViewportSize({ width: 1280, height: 720 });

  await expect(page.getByText("93%").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^Metascore.*: 79$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^Rotten Tomatoes.*: 93%$/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Смотрю", exact: true }).click();
  await page.getByRole("checkbox", { name: "S1E2 просмотрена" }).click();
  await expect(
    page.getByText("Просмотрено до S1E2 · дальше S1E3"),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "S1E1 просмотрена" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByText("Все изменения сохранены", { exact: true }),
  ).toBeVisible();

  await page.goto("#/");
  await expect(page.getByText("Продолжить смотреть")).toBeVisible();
  await expect(page.getByText("S1E3")).toBeVisible();
  await page.getByRole("button", { name: "✓ Просмотрено" }).click();
  await expect(page.getByText("новых серий нет")).toBeVisible();

  await page.goto("#/library");
  await page.getByRole("button", { name: /Смотрю · 1/ }).click();
  await expect(page).toHaveURL(/status=watching/);
  await expect(page.getByText(/смотрю · S1E3/i)).toBeVisible();
  await page.getByLabel("Тип").selectOption("movie");
  await expect(
    page.getByText("Под эти фильтры ничего не подходит."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await expect(page.getByText("Test Show")).toBeVisible();

  await page.goto("#/stats");
  await expect(page.getByRole("heading", { name: "Статистика" })).toBeVisible();
  await expect(page.getByText("≈2")).toBeVisible();
  await expect(page.getByText("Драма")).toBeVisible();
});

test("title card shows everything TMDB and OMDb return", async ({
  page,
  context,
}) => {
  await catalog(context);
  await register(page, "Cinephile");
  await page.goto("#/title/movie/303");
  await expect(
    page.getByRole("heading", { name: "Стражи Галактики. Часть 2" }),
  ).toBeVisible();
  await expect(
    page.getByText("Guardians of the Galaxy Vol. 2").first(),
  ).toBeVisible();
  await expect(page.getByText("16+", { exact: true })).toBeVisible();
  await expect(page.getByText("828 тыс.", { exact: true })).toBeVisible();
  await expect(page.getByText("93%").first()).toBeVisible();
  await expect(
    page.getByText("«Оскар»: 1 номинация · всего 15 наград и 62 номинации"),
  ).toBeVisible();
  await expect(page.getByText("По подписке")).toBeVisible();
  await expect(page.getByText("Аренда")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Все варианты ↗" }),
  ).toHaveAttribute("href", /watch\?locale=UA/);
  await expect(page.getByText("22 августа 2017")).toBeVisible();
  await expect(page.locator('iframe[src*="vid-ru"]')).toHaveCount(1);
  await expect(page.getByText("$200 млн")).toBeVisible();
  await expect(page.getByText("$864 млн")).toBeVisible();
  await expect(page.getByText("$390 млн")).toBeVisible();
  await expect(page.getByText("Marvel Studios")).toBeVisible();
  // Crew are photo cards with their roles, like the cast.
  await expect(
    page.getByRole("link", { name: /Tyler Bates.*композитор/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Стражи Галактики. Часть 3").first(),
  ).toBeVisible();
  await expect(page.getByText("A fun, heartfelt sequel.")).toBeVisible();
  await expect(
    page.getByText("Мстители: Война бесконечности").first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Wikidata ↗" })).toHaveAttribute(
    "href",
    /Q20001199/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".ui-evidence/title-rich-mobile.png",
    fullPage: true,
  });

  // A crew card opens the person's page with their info and filmography.
  await page.getByRole("link", { name: /James Gunn.*режиссёр/ }).click();
  await expect(page).toHaveURL(/#\/person\/1$/);
  await expect(page.getByRole("heading", { name: "James Gunn" })).toBeVisible();
  await expect(page.getByText("St. Louis, Missouri, USA")).toBeVisible();
  await expect(
    page.getByText("James Gunn is an American filmmaker."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Режиссёр · 2" })).toHaveClass(
    /bg-ink/,
  );
  await expect(page.getByText("режиссёр, сценарий")).toBeVisible();
  await expect(page.getByRole("link", { name: "IMDb ↗" })).toHaveAttribute(
    "href",
    /nm0348181/,
  );
  await page.screenshot({
    path: ".ui-evidence/person-mobile.png",
    fullPage: true,
  });
});
