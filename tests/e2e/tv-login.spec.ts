import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// Calls to the API worker are mocked; Firebase is the local Auth emulator,
// which takes unsigned custom tokens and unsigned Google ID tokens.
const API = "https://umbra-api.test";

const b64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const unsigned = (claims: Record<string, unknown>) =>
  `${b64url({ alg: "none", typ: "JWT" })}.${b64url(claims)}.`;

/** What the worker hands the TV once the phone has approved. */
const customToken = (uid: string) =>
  unsigned({
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    uid,
    claims: { tv: true },
  });

/** The TV app's bridge; googleSignIn answers like the system account picker. */
async function tvApp(context: BrowserContext, google: "token" | "cancelled") {
  await context.addInitScript((answer) => {
    const send = (state: string, text: string) =>
      window.dispatchEvent(
        new CustomEvent("umbratv", { detail: { type: "google", state, text } }),
      );
    const b64 = (v: unknown) =>
      btoa(JSON.stringify(v))
        .replace(/=+$/, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    (window as unknown as Record<string, unknown>).UmbraTV = {
      version: () => "test",
      installedApps: () => "{}",
      openExternal: () => undefined,
      launchApp: () => undefined,
      voiceAvailable: () => false,
      startVoice: () => undefined,
      stopVoice: () => undefined,
      googleSignIn: () =>
        setTimeout(() => {
          if (answer === "cancelled") return send("error", "cancelled");
          const now = Math.floor(Date.now() / 1000);
          send(
            "token",
            `${b64({ alg: "none", typ: "JWT" })}.${b64({
              iss: "https://accounts.google.com",
              aud: "web-client",
              sub: "google-tv-1",
              email: "sofa@example.com",
              email_verified: true,
              name: "Sofa",
              iat: now,
              exp: now + 3600,
            })}.`,
          );
        }, 100),
    };
  }, google);
}

const focused = (page: Page) =>
  page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");

test.describe("TV sign-in screen", () => {
  test.use({ viewport: { width: 960, height: 540 } });

  test("shows a QR code and signs in once the phone approves", async ({
    page,
    context,
  }) => {
    await tvApp(context, "cancelled");
    let polls = 0;
    const devices: string[] = [];
    await context.route(`${API}/tv/code`, async (route) => {
      devices.push(JSON.parse(route.request().postData() || "{}").device);
      await route.fulfill({
        json: {
          code: "ABCDEFGH",
          secret: "s".repeat(43),
          expiresIn: 600,
          interval: 1,
        },
      });
    });
    await context.route(`${API}/tv/token`, async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body).toEqual({ code: "ABCDEFGH", secret: "s".repeat(43) });
      polls += 1;
      await route.fulfill({
        json:
          polls < 2
            ? { status: "pending" }
            : { status: "approved", token: customToken(`tv-${Date.now()}`) },
      });
    });

    await page.goto("?tv=1#/login");
    await expect(page.getByRole("img", { name: /QR-код/ })).toBeVisible();
    await expect(page.getByLabel("Код для входа", { exact: true })).toHaveText(
      "ABCD-EFGH",
    );
    expect(devices[0]).toBeTruthy();
    // Focus starts on Google; cancelling the picker changes nothing.
    await expect.poll(() => focused(page)).toContain("Войти через Google");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toHaveCount(0);

    // The phone approves (the mocked worker answers on the second poll).
    await expect(page).toHaveURL(/#\/$/, { timeout: 10_000 });
    expect(polls).toBeGreaterThanOrEqual(2);
  });

  test("a refused code is replaced and the TV says so", async ({
    page,
    context,
  }) => {
    await tvApp(context, "cancelled");
    // The phone refuses the first code; the TV then asks for another.
    let refused = false;
    await context.route(`${API}/tv/code`, (route) =>
      route.fulfill({
        json: {
          code: refused ? "JKMNPQRS" : "ABCDEFGH",
          secret: "s".repeat(43),
          expiresIn: 600,
          interval: 1,
        },
      }),
    );
    await context.route(`${API}/tv/token`, (route) => {
      const { code } = JSON.parse(route.request().postData() || "{}");
      if (code === "ABCDEFGH") refused = true;
      return route.fulfill({
        json: { status: code === "ABCDEFGH" ? "denied" : "pending" },
      });
    });
    await page.goto("?tv=1#/login");
    await expect(page.getByLabel("Код для входа", { exact: true })).toHaveText(
      "JKMN-PQRS",
      { timeout: 10_000 },
    );
    await expect(page.getByRole("status")).toHaveText(
      "Вход отклонён на телефоне. Вот новый код.",
    );
  });

  test("signs in with the Google account of the TV", async ({
    page,
    context,
  }) => {
    await tvApp(context, "token");
    await context.route(`${API}/tv/code`, (route) =>
      route.fulfill({
        json: {
          code: "ABCDEFGH",
          secret: "s".repeat(43),
          expiresIn: 600,
          interval: 1,
        },
      }),
    );
    await context.route(`${API}/tv/token`, (route) =>
      route.fulfill({ json: { status: "pending" } }),
    );
    await page.goto("?tv=1#/login");
    await expect.poll(() => focused(page)).toContain("Войти через Google");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/$/, { timeout: 10_000 });
    await page.goto("?tv=1#/settings");
    await expect(page.getByText("sofa@example.com").first()).toBeVisible();
  });
});

test("the phone approves or refuses a TV from the QR link", async ({
  page,
  context,
}) => {
  const answers: unknown[] = [];
  const auth: (string | null)[] = [];
  await context.route(`${API}/tv/code/ABCDEFGH`, (route) => {
    auth.push(route.request().headers()["authorization"] ?? null);
    return route.fulfill({
      json: {
        status: "pending",
        device: "BRAVIA 4K VH21",
        expiresAt: Date.now() + 500_000,
      },
    });
  });
  await context.route(`${API}/tv/code/JKMNPQRS`, (route) =>
    route.fulfill({
      status: 404,
      json: { error: "tv_code_expired", message: "gone" },
    }),
  );
  await context.route(`${API}/tv/confirm`, async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    answers.push(body);
    await route.fulfill({
      json: { status: body.approve ? "approved" : "denied" },
    });
  });

  // Not signed in yet: the link leads through sign-in and back.
  await page.goto("#/tv-link?code=ABCDEFGH");
  await expect(page).toHaveURL(/#\/login\?next=/);
  await page
    .getByRole("button", { name: "Нет аккаунта — зарегистрироваться" })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill("Phone");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`phone-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/tv-link\?code=ABCDEFGH/);

  await expect(page.getByText("Войти в Umbra на телевизоре?")).toBeVisible();
  await expect(page.getByText("BRAVIA 4K VH21")).toBeVisible();
  await expect(page.getByText("ABCD-EFGH")).toBeVisible();
  expect(auth[0]).toMatch(/^Bearer \S+/);
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Готово — телевизор входит в твой аккаунт.",
  );

  await page.goto("#/tv-link?code=abcd-efgh");
  await page.reload();
  await page.getByRole("button", { name: "Отказать" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Вход отклонён. Телевизор не получил доступ.",
  );
  expect(answers).toEqual([
    { code: "ABCDEFGH", approve: true },
    { code: "ABCDEFGH", approve: false },
  ]);

  // A stale code, then typing a new one by hand.
  await page.goto("#/tv-link?code=JKMNPQRS");
  await expect(page.getByRole("alert")).toContainText("Код устарел");
  await page.getByLabel("Код с экрана телевизора").fill("abcd-efgh");
  await page.getByRole("button", { name: "Дальше" }).click();
  await expect(page).toHaveURL(/#\/tv-link\?code=ABCDEFGH/);
  await expect(page.getByText("BRAVIA 4K VH21")).toBeVisible();
});
