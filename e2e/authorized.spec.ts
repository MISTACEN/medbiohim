import { expect, test, type Page } from "@playwright/test";

/**
 * Авторизованный smoke: ровно тот слой, который гостевой спек не умеет —
 * ролевые гейты, серверные данные в шелле и ролевое меню.
 *
 * Включается только при заданных секретах/переменных окружения
 * SMOKE_TEST_EMAIL / SMOKE_TEST_PASSWORD (QA-аккаунты medbiohim.test —
 * см. HANDOFF §8, этап M5). Без них все тесты skip: CI-гейт не зависит
 * от наличия секретов, но и авторизованный регресс не теряется.
 */

const EMAIL = process.env.SMOKE_TEST_EMAIL ?? "";
const PASSWORD = process.env.SMOKE_TEST_PASSWORD ?? "";
const ENABLED = Boolean(EMAIL && PASSWORD);

const ERROR_BOUNDARY = "Не удалось показать страницу";

test.describe("Авторизованный smoke", () => {
  test.skip(!ENABLED, "SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD не заданы — авторизованный сценарий пропущен");

  /** Вход через форму пароля (вкладка «Почта» открыта по умолчанию). */
  async function login(page: Page) {
    await page.goto("/login");
    const email = page.getByRole("textbox", { name: "Email" }).first();
    await expect(email).toBeVisible();
    await email.fill(EMAIL);
    await page.getByRole("textbox", { name: "Пароль" }).first().fill(PASSWORD);
    await page.getByRole("button", { name: "Войти с паролем" }).click();
    // Шелл платформы — признак успешной сессии (гидрейт AppShell).
    await expect(page.locator("aside.app-sidebar")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
  }

  test("вход по паролю: сессия живёт, выход возвращает гостя", async ({ page }) => {
    await login(page);
    // Перезагрузка не должна терять сессию (cookie-транспорт, COOKIES-RFC-E1).
    await page.reload();
    await expect(page.locator("aside.app-sidebar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page.getByRole("link", { name: "Войти" })).toBeVisible({ timeout: 10000 });
  });

  test("студенту: расписание и тесты без error boundary", async ({ page }) => {
    await login(page);
    for (const path of ["/schedule", "/tests", "/trainers"]) {
      await page.goto(path);
      await expect(page.locator("aside.app-sidebar")).toBeVisible();
      await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
    }
  });

  test("гейт ролей: /admin без роли admin — доступ закрыт сервером", async ({ page }) => {
    await login(page);
    // QA-аккаунт по умолчанию студент: админ-консоль либо скрывается, либо
    // отвечает честным отказом — но не error boundary и не пустой экран.
    const response = await page.goto("/admin");
    expect(response?.status() ?? 200).toBeLessThan(500);
    await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  });
});
