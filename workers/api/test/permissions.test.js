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

test("homework: преподаватель видит сдачи только в своей области", async () => {
  const route = await source("../src/routes/homework.ts");
  assert.match(route, /import \{ loadTeacherScope, isWithinTeachingScope \} from "\.\.\/lib\/teacher-scope"/);
  assert.match(route, /const scope = await loadTeacherScope\(db, user\.id\)/);
  assert.match(route, /isWithinTeachingScope\(scope, \{/);
  assert.match(route, /Задание вне вашей области проверки/);
  // Роль teacher больше не открывает чужие задания по факту «staff».
  assert.doesNotMatch(route, /const isStaff = roles\.some\(/);
  assert.doesNotMatch(route, /STAFF_ROLES/);
});

test("workshop: преподаватель не получает capability и не обходит раздел", async () => {
  const permissions = await source("../src/lib/permissions.ts");
  const teacherBlock = permissions.slice(
    permissions.indexOf("const TEACHER_CAPABILITIES"),
    permissions.indexOf("const MODERATOR_CAPABILITIES"),
  );
  assert.ok(teacherBlock.length > 0, "TEACHER_CAPABILITIES block найдена");
  assert.doesNotMatch(teacherBlock, /"workshop\.publish"/);
  assert.match(teacherBlock, /"teacher\.content\.manage"/);

  const gate = await source("../src/lib/module-access.ts");
  assert.match(gate, /const STUDENT_ONLY_MODULE_KEYS = new Set\(\["workshop"\]\)/);
  assert.match(gate, /if \(roles\.includes\("teacher"\)\) \{/);
  assert.match(gate, /if \(!STUDENT_ONLY_MODULE_KEYS\.has\(moduleKey\)\) return next\(\)/);
  // Явный отказ, а не «провалился дальше и раздел с open его пустил».
  assert.match(gate, /Раздел доступен только студентам/);
  assert.match(gate, /MODULE_FORBIDDEN/);
});

test("admin: общий банк вопросов правит только admin и moderator", async () => {
  const route = await source("../src/routes/admin.ts");
  const start = route.indexOf('admin.put("/question-bank/:id"');
  assert.ok(start >= 0, "question-bank route существует");
  const slice = route.slice(start, route.indexOf('admin.post("/tests/build-variants"'));
  assert.match(slice, /await gate\(c, CONTENT_MODERATORS\)/);
  // Раньше здесь стоял дефолтный gate(c), который пропускал teacher.
  assert.doesNotMatch(slice, /await gate\(c\)\s*;/);
});

test("groups: преподаватель не видит каталог платформы со всеми группами", async () => {
  const route = await source("../src/routes/groups.ts");
  assert.match(route, /const MANAGERS = \["admin", "moderator"\]/);
  assert.doesNotMatch(route, /MANAGERS = \[[^\]]*"teacher"/);
  // Запись групп/членства остаётся только admin (requireAdmin).
  assert.match(route, /if \(!\(await requireAdmin\(c\)\)\) return;/);
});

test("admin: билеты, лекции и AI-генерация — только admin и moderator", async () => {
  const route = await source("../src/routes/admin.ts");
  const questions = route.slice(
    route.indexOf('admin.get("/questions"'),
    route.indexOf('admin.put("/question-bank/:id"'),
  );
  assert.match(questions, /await gate\(c, CONTENT_MODERATORS\)/);
  const lectures = route.slice(
    route.indexOf('admin.get("/lectures"'),
    route.indexOf('admin.post("/lectures/generate"'),
  );
  assert.match(lectures, /await gate\(c, CONTENT_MODERATORS\)/);
  const generate = route.slice(
    route.indexOf('admin.post("/lectures/generate"'),
    route.indexOf('admin.patch("/lectures/:id"'),
  );
  assert.match(generate, /await gate\(c, CONTENT_MODERATORS\)/);
});

test("admin: расписание и присутствие — только администратор платформы", async () => {
  const route = await source("../src/routes/admin.ts");
  const schedule = route.slice(
    route.indexOf('admin.get("/schedule"'),
    route.indexOf('admin.get("/schedule"') + 400,
  );
  assert.match(schedule, /await gate\(c, STRICT_ADMINS\)/);
  const presence = route.slice(
    route.indexOf('admin.get("/presence"'),
    route.indexOf('admin.get("/presence"') + 300,
  );
  assert.match(presence, /await gate\(c, STRICT_ADMINS\)/);
  assert.doesNotMatch(presence, /gate\(c, MANAGERS\)/);
});

test("admin-parity: сводка ДЗ со сдачами всех групп — только admin и moderator", async () => {
  const parity = await source("../src/routes/admin-parity.ts");
  const slice = parity.slice(
    parity.indexOf('parity.get("/homeworks"'),
    parity.indexOf('parity.post("/homeworks"'),
  );
  assert.match(slice, /gate\(c, CONTENT_MODERATORS\)/);
  assert.doesNotMatch(slice, /gate\(c, MANAGERS\)/);
});

test("admin-parity: преподаватель создаёт ДЗ только для назначенных групп", async () => {
  const parity = await source("../src/routes/admin-parity.ts");
  const slice = parity.slice(
    parity.indexOf('parity.post("/homeworks"'),
    parity.indexOf('parity.delete("/homeworks/:id"'),
  );
  assert.match(slice, /loadTeacherScope/);
  assert.match(slice, /Группа не входит в вашу область преподавания/);
  // Сдачи всех групп преподаватель не получает и здесь.
  assert.doesNotMatch(slice, /adminListHomeworks/);
});
