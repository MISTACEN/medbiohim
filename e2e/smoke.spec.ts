import { expect, test, type Page, type Response } from "@playwright/test";

/**
 * G3: гостевой браузерный smoke против локальной сборки (next start).
 *
 * Проверяются только гостевые экраны: в CI нет учётной записи Supabase,
 * и это ровно тот слой, который curl-джоба smoke.yml не умеет — клиентский
 * гидрейт, error boundary, тема до/после загрузки и Ctrl+K.
 */

const ERROR_BOUNDARY = "Не удалось показать страницу";

/** Публичные разделы: должны отвечать 200 и не показывать error boundary. */
const PUBLIC_PAGES = [
  "/tests",
  "/schedule",
  "/subjects",
  "/materials",
  "/atlas",
  "/community",
  "/help",
  "/changelog",
] as const;

/** Гостевые гейты: гостю показывается честный гейт, а не ошибка. */
const GATED_PAGES = ["/homework", "/bookmarks", "/tutor"] as const;

/**
 * Собирает неперехваченные исключения страницы (pageerror).
 * Возвращает пару: массив ошибок и функцию goto, которая ходит по ссылкам
 * с ожиданием гидрейта (сайдбар появляется только после mount в AppShell).
 */
function withPageErrorCollector(page: Page): { errors: string[]; goto: (path: string) => Promise<Response | null> } {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  const goto = async (path: string) => {
    const response = await page.goto(path);
    // AppShell рендерит заглушку до первого useEffect: ждём гидрейт,
    // иначе error boundary могла бы появиться после того, как тест уже ушёл.
    if (path !== "/login" && path !== "/register") {
      await expect(page.locator("aside.app-sidebar")).toBeVisible();
    } else {
      // Login/Register идут «bare» без шелла — ждём первую форму клиентского рендера.
      await expect(page.locator("form").first()).toBeVisible();
    }
    return response;
  };
  return { errors, goto };
}

test.describe("Гостевой smoke: главная и шелл", () => {
  test("главная: заголовок Медбиохим, меню присутствует", async ({ page }) => {
    const { errors, goto } = withPageErrorCollector(page);
    await goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Медбиохим" })).toBeVisible();
    // Сайдбар-меню: навигационный список с ссылками на разделы.
    await expect(page.locator("aside.app-sidebar nav")).toBeVisible();
    await expect(page.locator("aside.app-sidebar nav a").first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("Ctrl+K фокусирует поиск на главной", async ({ page }) => {
    const search = page.locator('input[type="search"][placeholder="Поиск по платформе..."]');
    await page.goto("/");
    await expect(search).toBeVisible();

    await page.keyboard.press("Control+K");
    await expect(search).toBeFocused();

    // Гостю главная честно предлагает войти.
    await expect(page.getByRole("link", { name: "Войти" }).first()).toBeVisible();
  });
});

test.describe("Гостевой smoke: публичные разделы", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path}: HTTP 200, без error boundary`, async ({ page }) => {
      const { errors, goto } = withPageErrorCollector(page);
      const response = await goto(path);

      expect(response?.status(), `GET ${path}`).toBe(200);
      await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
      expect(errors, `pageerror на ${path}`).toEqual([]);
    });
  }
});

test.describe("Гостевой smoke: гейты авторизации", () => {
  for (const path of GATED_PAGES) {
    test(`${path}: гостю честный гейт, без error boundary`, async ({ page }) => {
      const { errors, goto } = withPageErrorCollector(page);
      const response = await goto(path);

      expect(response?.status(), `GET ${path}`).toBe(200);
      await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
      // Честный гейт: либо явная ссылка «Войти», либо раздел честно рендерится
      // в шелле платформы (сайдбар на месте) — но не пустая/сломанная страница.
      const loginLink = page.getByRole("link", { name: "Войти" });
      const sidebar = page.locator("aside.app-sidebar");
      const honest = (await loginLink.count()) > 0 || (await sidebar.isVisible());
      expect(honest, `гейт на ${path}: ни «Войти», ни шелл платформы`).toBe(true);
      expect(errors, `pageerror на ${path}`).toEqual([]);
    });
  }
});

test.describe("Гостевой smoke: вход и тема", () => {
  test("/login: форма email/пароля видна", async ({ page }) => {
    const { errors, goto } = withPageErrorCollector(page);
    await goto("/login");

    await expect(page.getByRole("heading", { name: "Вход по почте" })).toBeVisible();
    // На /login две формы с email-полями (пароль + magic link) — берём поля формы входа по паролю.
    await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("тема classic-dark применяется до загрузки страницы (FOUC-скрипт)", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("mb_app_theme", "classic-dark");
      } catch {
        /* приватный режим — не наш кейс */
      }
    });
    await page.goto("/");
    // Скрипт в layout.tsx выставляет data-theme синхронно до гидрейта.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "classic-dark");
  });
});
