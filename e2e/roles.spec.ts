import { expect, test, type Page } from "@playwright/test";

/**
 * E2E на три роли (план, этап J).
 *
 * Тест требует тестовых аккаунтов и пропускается, если их нет:
 *   E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD
 *   E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD
 *   E2E_ADMIN_EMAIL   / E2E_ADMIN_PASSWORD
 *
 * Проверяется то, что нельзя доказать юнит-тестами: клиентский гейт кабинетов
 * и то, что роли не видят чужие пространства. Серверные 403 проверяются
 * отдельно в workers/api/test.
 */

type Credentials = { email?: string; password?: string };

const ACCOUNTS: Record<"student" | "teacher" | "admin", Credentials> = {
  student: { email: process.env.E2E_STUDENT_EMAIL, password: process.env.E2E_STUDENT_PASSWORD },
  teacher: { email: process.env.E2E_TEACHER_EMAIL, password: process.env.E2E_TEACHER_PASSWORD },
  admin: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD },
};

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /войти/i }).first().click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

function missing(role: keyof typeof ACCOUNTS): boolean {
  const account = ACCOUNTS[role];
  return !account.email || !account.password;
}

test.describe("Роли: студент", () => {
  test.skip(missing("student"), "нет E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD");

  test("студент не входит в кабинет преподавателя и админку", async ({ page }) => {
    await signIn(page, ACCOUNTS.student.email!, ACCOUNTS.student.password!);

    await page.goto("/teacher");
    await expect(page.getByRole("heading", { name: "Только для преподавателей" })).toBeVisible();

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Доступ только для администратора" })).toBeVisible();
  });
});

test.describe("Роли: преподаватель", () => {
  test.skip(missing("teacher"), "нет E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD");

  test("преподаватель видит свой кабинет, но не админку", async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher.email!, ACCOUNTS.teacher.password!);

    await page.goto("/teacher");
    await expect(page.getByRole("heading", { name: "Кабинет преподавателя" })).toBeVisible();
    await expect(page.getByText("Новых работ нет — всё проверено.")).toBeVisible();

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Доступ только для администратора" })).toBeVisible();
  });
});

test.describe("Роли: администратор", () => {
  test.skip(missing("admin"), "нет E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");

  test("администратор входит в админку и в кабинет преподавателя", async ({ page }) => {
    await signIn(page, ACCOUNTS.admin.email!, ACCOUNTS.admin.password!);

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "CMS Медбиохим" })).toBeVisible();

    await page.goto("/teacher");
    await expect(page.getByRole("heading", { name: "Кабинет преподавателя" })).toBeVisible();
  });
});
