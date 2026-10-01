import { test, expect } from "@playwright/test";

test("settings show which game services the API worker has keys for", async ({
  page,
  context,
}) => {
  await context.route("https://umbra-api.test/health", (route) =>
    route.fulfill({
      json: {
        ok: true,
        services: {
          igdb: true,
          twitch: true,
          itad: false,
          opencritic: true,
          steam: false,
        },
      },
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.goto("#/login");
  await page
    .getByRole("button", { name: "Нет аккаунта — зарегистрироваться" })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill("Gamer");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`api-${Date.now()}@example.com`);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password-123");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/$/);
  await page.goto("#/settings");
  const section = page.locator("section", { hasText: "Игровой сервер" });
  await expect(section.getByText("✓ подключён")).toHaveCount(3);
  await expect(section.getByText("нет ключа")).toHaveCount(2);
  await expect(
    section.locator("li", { hasText: "IsThereAnyDeal" }),
  ).toContainText("нет ключа");
});
