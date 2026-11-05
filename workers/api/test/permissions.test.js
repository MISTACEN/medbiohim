import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

/**
 * Контракт серверных полномочий (план §10).
 *
 * Тесты читают исходники, потому что Worker собирается esbuild'ом, а node
 * `--test` не транспилирует TypeScript. Это те же контрактные проверки,
 * которыми уже покрыты маршруты admin/contracts.
 */

test("worker permissions: teacher не получает административные capabilities", async () => {
  const lib = await source("../src/lib/permissions.ts");
  assert.match(lib, /ADMIN_CAPABILITIES/);
  assert.match(lib, /teacher: TEACHER_CAPABILITIES/);
  assert.match(lib, /"admin\.groups\.manage"/);
  assert.match(lib, /export function canAdminister/);
  assert.match(lib, /export async function requireAdmin/);
  assert.match(lib, /export async function requireCapability/);
});

test("groups: создание группы и членство — только admin", async () => {
  const route = await source("../src/routes/groups.ts");
  assert.match(route, /import \{ requireAdmin \} from "\.\.\/lib\/permissions"/);
  assert.match(route, /if \(!\(await requireAdmin\(c\)\)\) return;/);
  assert.doesNotMatch(route, /isManager/);
});

test("subjects: глобальный каталог меняет только admin", async () => {
  const route = await source("../src/routes/subjects.ts");
  assert.match(route, /import \{ callerRoles \} from "\.\.\/lib\/permissions"/);
  assert.match(route, /async function isCatalogAdmin/);
  assert.match(route, /roles\.includes\("admin"\)/);
  assert.doesNotMatch(route, /MANAGERS/);
});

test("submissions: проверка работы требует принадлежности задания преподавателю", async () => {
  const route = await source("../src/routes/submissions.ts");
  assert.match(route, /async function canReviewSubmission/);
  assert.match(route, /\.from\("homeworks"\)/);
  assert.match(route, /created_by/);
  assert.match(route, /вне вашей области проверки/);
});

test("schedule: разрушительные операции расписания — только admin", async () => {
  const route = await source("../src/routes/admin-schedule.ts");
  assert.match(route, /async function isAdmin\(c: any\): Promise<boolean>/);
  assert.match(route, /return roles\.includes\("admin"\);/);
  assert.match(route, /const allowed = await isAdmin\(c\);/);
  assert.match(route, /Записи расписания правит только администратор/);
  assert.match(route, /Записи расписания отменяет только администратор/);
  assert.match(route, /Аналитику расписания видит только администратор/);
});

test("admin overview: только администратор платформы", async () => {
  const route = await source("../src/routes/admin.ts");
  assert.match(
    route,
    /admin\.get\("\/overview", requireAuth, async \(c\) => \{[\s\S]*?if \(!await gate\(c, STRICT_ADMINS\)\) return;/,
  );
});
