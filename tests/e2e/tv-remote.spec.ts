import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// «На телевизоре в Lampa»: the TV registers itself, the phone opens a title
// on it (worker/src/tvRemote.ts is mocked here; its own tests are in tests/worker).

const API = "https://umbra-api.test";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const film = {
  id: 438631,
  title: "Дюна",
  release_date: "2021-09-15",
  overview: "Пустынная планета.",
  credits: { cast: [], crew: [] },
  videos: { results: [] },
  "watch/providers": { results: {} },
  external_ids: {},
};

async function catalog(context: BrowserContext) {
  await context.route("https://api.themoviedb.org/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/movie/438631?")
        ? film
        : { page: 1, results: [], total_pages: 1, total_results: 0 },
    }),
  );
  await context.route(
    /https:\/\/(api.agregarr.org|imdb-top250.mmdju.workers.dev|query.wikidata.org|www.omdbapi.com)\//,
    (route) => route.fulfill({ json: [] }),
  );
}

/** The worker: records what reaches it. */
async function worker(
  context: BrowserContext,
  devices: unknown[] = [],
  answer: { status: number; json: unknown } = {
    status: 200,
    json: { sent: 1 },
  },
) {
  const calls: Array<{ path: string; auth: string | null; body: unknown }> = [];
  await context.route(`${API}/**`, (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    const path = new URL(request.url()).pathname;
    calls.push({
      path,
      auth: request.headers()["authorization"] ?? null,
      body: request.postDataJSON?.() ?? null,
    });
    if (path === "/tv/devices")
      return route.fulfill({ headers: cors, json: { devices } });
    if (path === "/tv/open")
      return route.fulfill({
        headers: cors,
        status: answer.status,
        json: answer.json,
      });
    if (path === "/tv/device" || path === "/tv/device/remove")
      return route.fulfill({ headers: cors, json: { devices: 1 } });
    return route.fulfill({
      headers: cors,
      json: { ok: true, services: { ai: false } },
    });
  });
  return calls;
}

async function register(page: Page, prefix = "") {
  await page.goto(`${prefix}#/login`);
  if (prefix)
    await page.getByRole("button", { name: "Войти по email и паролю" }).click();
  await page
    .getByRole("button", { name: "Нет аккаунта — зарегистрироваться" })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill("Viewer");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`remote-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
}

const SONY = {
  id: "a1b2c3d4e5f60718",
  device: "BRAVIA 4K VH21",
  lampa: true,
  background: true,
};
const BEDROOM = {
  id: "1122334455667788",
  device: "Xiaomi Bedroom",
  lampa: true,
  background: true,
};

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("opens the title in Lampa on the TV of the account", async ({
    page,
    context,
  }) => {
    await catalog(context);
    const calls = await worker(context, [SONY]);
    await register(page);
    await page.goto("#/title/movie/438631");
    await page.getByRole("button", { name: "На телевизоре в Lampa" }).click();
    await expect(page.getByText("Открываю на «BRAVIA 4K VH21».")).toBeVisible();
    const open = calls.find((c) => c.path === "/tv/open")!;
    expect(open.body).toEqual({ type: "movie", id: 438631 });
    expect(open.auth).toMatch(/^Bearer \S+/);
  });

  test("lets the user pick a target TV when multiple TVs are linked", async ({
    page,
    context,
  }) => {
    await catalog(context);
    const calls = await worker(context, [SONY, BEDROOM]);
    await register(page);
    await page.goto("#/title/movie/438631");
    const group = page.getByRole("group", { name: "Телевизор" });
    await group.getByRole("button", { name: "Xiaomi Bedroom" }).click();
    await page.getByRole("button", { name: "На телевизоре в Lampa" }).click();
    await expect(page.getByText("Открываю на «Xiaomi Bedroom».")).toBeVisible();
    const open = calls.find((c) => c.path === "/tv/open")!;
    expect(open.body).toEqual({
      type: "movie",
      id: 438631,
      device: "1122334455667788",
    });
  });

  test("says when the TV does not answer", async ({ page, context }) => {
    await catalog(context);
    await worker(context, [SONY], {
      status: 404,
      json: { error: "no_tv", message: "The TV is not reachable" },
    });
    await register(page);
    await page.goto("#/title/movie/438631");
    await page.getByRole("button", { name: "На телевизоре в Lampa" }).click();
    await expect(page.getByText(/Телевизор не отвечает/)).toBeVisible();
  });

  test("shows no button without a TV with Lampa", async ({ page, context }) => {
    await catalog(context);
    const calls = await worker(context, [{ ...SONY, lampa: false }]);
    await register(page);
    await page.goto("#/title/movie/438631");
    await expect(page.getByRole("heading", { name: "Дюна" })).toBeVisible();
    await expect
      .poll(() => calls.some((c) => c.path === "/tv/devices"))
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "На телевизоре в Lampa" }),
    ).toHaveCount(0);
  });
});

test.describe("TV", () => {
  test.use({ viewport: { width: 960, height: 540 } });

  test("registers itself once signed in and unregisters on sign-out", async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      let token = "";
      w.__setToken = (t: string) => {
        token = t;
        window.dispatchEvent(
          new CustomEvent("umbratv", {
            detail: { type: "remote", state: "token", text: "" },
          }),
        );
      };
      w.UmbraTV = {
        version: () => "test",
        installedApps: () => "{}",
        openExternal: () => undefined,
        launchApp: () => undefined,
        voiceAvailable: () => false,
        startVoice: () => undefined,
        stopVoice: () => undefined,
        remoteInfo: () =>
          JSON.stringify({
            token,
            id: "a1b2c3d4e5f60718",
            device: "BRAVIA 4K VH21",
            lampa: true,
            background: true,
          }),
      };
    });
    await catalog(context);
    const calls = await worker(context);
    await register(page, "?tv=1");
    // No token yet: nothing to register.
    await page.waitForTimeout(300);
    expect(calls.filter((c) => c.path === "/tv/device")).toHaveLength(0);

    await page.evaluate(() =>
      (window as any).__setToken("fcm-token-0123456789-abcdef"),
    );
    await expect
      .poll(() => calls.filter((c) => c.path === "/tv/device").length)
      .toBe(1);
    const sent = calls.find((c) => c.path === "/tv/device")!;
    expect(sent.body).toEqual({
      token: "fcm-token-0123456789-abcdef",
      id: "a1b2c3d4e5f60718",
      device: "BRAVIA 4K VH21",
      lampa: true,
      background: true,
    });
    expect(sent.auth).toMatch(/^Bearer \S+/);
    // The same again changes nothing.
    await page.evaluate(() =>
      (window as any).__setToken("fcm-token-0123456789-abcdef"),
    );
    await page.waitForTimeout(300);
    expect(calls.filter((c) => c.path === "/tv/device")).toHaveLength(1);

    // Signing out removes this TV from the account's remote list.
    await page.goto("?tv=1#/settings");
    await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
    await expect
      .poll(() => calls.filter((c) => c.path === "/tv/device/remove").length)
      .toBe(1);
    const removed = calls.find((c) => c.path === "/tv/device/remove")!;
    expect(removed.body).toEqual({ id: "a1b2c3d4e5f60718" });
    expect(removed.auth).toMatch(/^Bearer \S+/);
  });
});
