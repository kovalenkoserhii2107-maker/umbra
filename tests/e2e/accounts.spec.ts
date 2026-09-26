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
async function catalog(context: BrowserContext) {
  await context.route("https://api.themoviedb.org/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/movie/101?")
        ? film
        : { page: 1, results: [], total_pages: 1, total_results: 0 },
    }),
  );
  await context.route(
    /https:\/\/(api.agregarr.org|imdb-top250.mmdju.workers.dev)\//,
    (route) => route.fulfill({ json: [] }),
  );
  await context.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ body: "" }),
  );
}
async function register(page: Page, email: string) {
  await page.goto("#/login");
  await page
    .getByRole("button", { name: "Нет аккаунта — зарегистрироваться" })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill("Tester");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
}
async function login(page: Page, email: string) {
  await page.goto("#/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Войти по почте", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
}
test("two devices synchronize notes, ratings and deletions; a second account sees no data", async ({
  browser,
}) => {
  const device1 = await browser.newContext();
  const device2 = await browser.newContext();
  await catalog(device1);
  await catalog(device2);
  const a = await device1.newPage();
  const b = await device2.newPage();
  const email = `a-${Date.now()}@example.com`;
  await register(a, email);
  await login(b, email);
  await a.goto("#/title/movie/101");
  await a.getByRole("button", { name: "Хочу", exact: true }).click();
  await expect(
    a.getByText("Все изменения сохранены", { exact: true }),
  ).toBeVisible();
  await b.goto("#/library");
  await expect(b.getByText("Test Film", { exact: true })).toBeVisible();
  await a.getByRole("spinbutton").fill("8");
  await a
    .getByRole("textbox", { name: "Заметка", exact: true })
    .fill("My private note");
  await a.getByRole("textbox", { name: "Заметка", exact: true }).blur();
  await expect(b.getByText("My private note", { exact: true })).toBeVisible();
  await expect(b.getByText(/твоя 8\/10/)).toBeVisible();
  await device1.setOffline(true);
  await a
    .getByRole("textbox", { name: "Заметка", exact: true })
    .fill("Offline note");
  await a.getByRole("textbox", { name: "Заметка", exact: true }).blur();
  await expect(a.getByText(/Нет сети · изменения/)).toBeVisible();
  await device1.setOffline(false);
  await expect(b.getByText("Offline note", { exact: true })).toBeVisible();
  await a.reload();
  await expect(
    a.getByRole("textbox", { name: "Заметка", exact: true }),
  ).toHaveValue("Offline note");
  await a.getByRole("button", { name: "убрать", exact: true }).click();
  await expect(b.getByText("Полка пуста.", { exact: false })).toBeVisible();
  await b.reload();
  await expect(b.getByText("Test Film", { exact: true })).toHaveCount(0);
  await a.getByRole("button", { name: "Хочу", exact: true }).click();
  await expect(
    a.getByText("Все изменения сохранены", { exact: true }),
  ).toBeVisible();
  await a.goto("#/cabinet");
  await a
    .getByRole("button", { name: "Выйти из аккаунта", exact: true })
    .click();
  await register(a, `b-${Date.now()}@example.com`);
  await a.goto("#/library");
  await expect(a.getByText("Test Film", { exact: true })).toHaveCount(0);
  await a.goto("#/cabinet");
  await a
    .getByRole("button", { name: "Выйти из аккаунта", exact: true })
    .click();
  await login(a, email);
  await a.goto("#/library");
  await expect(a.getByText("Test Film", { exact: true })).toBeVisible();
  await device1.close();
  await device2.close();
});
test("cached legacy profile cannot unlock the cabinet or import a previous user library", async ({
  page,
  context,
}) => {
  await catalog(context);
  await page.addInitScript(() => {
    localStorage.setItem(
      "umbra.account",
      JSON.stringify({ sub: "old", name: "Old User" }),
    );
    localStorage.setItem(
      "umbra.library",
      JSON.stringify([{ id: 101, title: "Old Private Film" }]),
    );
  });
  await page.goto("#/cabinet");
  await expect(
    page.getByRole("heading", { name: "Вход в Umbra" }),
  ).toBeVisible();
  await expect(page.getByText("Old Private Film", { exact: true })).toHaveCount(
    0,
  );
});
test("production has one hashed entry and supports offline shell without clearing other caches", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await catalog(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/umbra/#/login");
  await page.evaluate(async () => {
    await caches.open("unrelated-app-test");
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Вход в Umbra" }),
  ).toBeVisible();
  const entries = await page
    .locator('script[type="module"][src]')
    .evaluateAll((scripts) => scripts.map((s) => s.getAttribute("src")));
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatch(/assets\/index-[\w-]+\.js$/);
  expect(await page.evaluate(() => caches.has("unrelated-app-test"))).toBe(
    true,
  );
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Вход в Umbra" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test("an installed PWA detects the next worker and activates it on demand", async ({
  browser,
}) => {
  const { readFile, writeFile } = await import("node:fs/promises");
  const original = await readFile("dist/sw.js", "utf8");
  const context = await browser.newContext();
  await catalog(context);
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:4173/umbra/#/login");
    await page.evaluate(() =>
      navigator.serviceWorker.ready.then(() => undefined),
    );
    await page.reload();
    await writeFile("dist/sw.js", original + "\n/* update lifecycle test */\n");
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/umbra/");
      await reg?.update();
    });
    await expect(
      page.getByText("Доступна новая версия Umbra", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Обновить", exact: true }).click();
    await expect(
      page.getByText("Доступна новая версия Umbra", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Вход в Umbra" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: ".ui-evidence/login-mobile.png",
      fullPage: true,
    });
  } finally {
    await writeFile("dist/sw.js", original);
    await context.close();
  }
});
