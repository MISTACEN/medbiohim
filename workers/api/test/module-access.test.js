/**
 * Централизованный доступ к разделам (концепция §5, Access Control).
 *
 * Проверяет:
 *  - миграцию: реестр разделов, индивидуальные/групповые разрешения, RLS,
 *    журнал, режимы open/restricted;
 *  - чистую логику разрешения: deny сильнее allow, групповые правила,
 *    срок действия, режим по умолчанию;
 *  - подключение gate к маршрутам и fail-open при отсутствии миграции.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(root, "..", "..");

async function read(rel) {
  return readFile(path.join(root, rel), "utf8");
}

test("миграция module_access: таблицы, RLS, журнал, seed разделов", async () => {
  const sql = await readFile(
    path.join(repoRoot, "supabase/migrations/20261106100000_module_access.sql"),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.app_modules/);
  assert.match(sql, /create table if not exists public\.user_module_access/);
  assert.match(sql, /create table if not exists public\.group_module_access/);
  assert.match(sql, /create table if not exists public\.access_audit_log/);
  assert.match(sql, /alter table public\.app_modules enable row level security/);
  assert.match(sql, /alter table public\.user_module_access enable row level security/);
  assert.match(sql, /alter table public\.group_module_access enable row level security/);
  assert.match(sql, /alter table public\.access_audit_log enable row level security/);
  assert.match(sql, /user_module_access_select_own_v1/);
  assert.match(sql, /check \(default_mode in \('open', 'restricted'\)\)/);
  assert.match(sql, /check \(mode in \('allow', 'deny'\)\)/);
  assert.match(sql, /revoke all on public\.group_module_access from anon, authenticated/);
  assert.match(sql, /grant all on public\.app_modules[^;]*to service_role/);
  // Существующие разделы стартуют открытыми: миграция не должна менять
  // поведение действующих пользователей.
  assert.match(sql, /'schedule',\s*'Расписание',\s*10, 'open'/);
  assert.match(sql, /'tutor',\s*'AI-тьютор',\s*140, 'open'/);
});

test("логика разрешения: deny > allow > групповое > режим по умолчанию", async () => {
  const { resolveAccess } = await import("../src/lib/module-access-rules.ts");
  const modules = [
    { key: "schedule", title: "Расписание", sort_order: 10, default_mode: "open", is_active: true },
    { key: "atlas", title: "Атлас", sort_order: 20, default_mode: "restricted", is_active: true },
    { key: "tutor", title: "AI-тьютор", sort_order: 30, default_mode: "open", is_active: true },
    { key: "old", title: "Отключён", sort_order: 40, default_mode: "open", is_active: false },
  ];
  const userGrants = {
    schedule: [{ id: "1", module_key: "schedule", mode: "deny", expires_at: null }],
    atlas: [{ id: "2", module_key: "atlas", mode: "allow", expires_at: null }],
  };
  const groupGrants = {
    atlas: [{ id: "3", module_key: "atlas", mode: "deny", expires_at: null }],
    tutor: [{ id: "4", module_key: "tutor", mode: "allow", expires_at: null }],
  };
  const access = resolveAccess(modules, userGrants, groupGrants);
  // Индивидуальный deny перекрывает всё.
  assert.equal(access.allowed.has("schedule"), false);
  // Индивидуальный allow сильнее группового deny.
  assert.equal(access.allowed.has("atlas"), true);
  // Restricted без выдачи закрыт, с групповым allow открыт.
  assert.equal(access.allowed.has("tutor"), true);
  // Open без выдач открыт.
  assert.equal(access.allowed.has("old"), false);
  const plain = resolveAccess(
    modules,
    {},
    {},
  );
  assert.equal(plain.allowed.has("schedule"), true);
  assert.equal(plain.allowed.has("atlas"), false);
});

test("просроченное разрешение не учитывается", async () => {
  const { resolveAccess } = await import("../src/lib/module-access-rules.ts");
  const past = new Date(Date.now() - 86400000).toISOString();
  const future = new Date(Date.now() + 86400000).toISOString();
  const modules = [
    { key: "atlas", title: "Атлас", sort_order: 1, default_mode: "restricted", is_active: true },
  ];
  const expired = resolveAccess(
    modules,
    { atlas: [{ id: "1", module_key: "atlas", mode: "allow", expires_at: past }] },
    {},
  );
  assert.equal(expired.allowed.has("atlas"), false);
  const active = resolveAccess(
    modules,
    { atlas: [{ id: "1", module_key: "atlas", mode: "allow", expires_at: future }] },
    {},
  );
  assert.equal(active.allowed.has("atlas"), true);
});

test("gate подключён к маршрутам разделов и fail-open без миграции", async () => {
  const index = await read("src/index.ts");
  for (const [key, mount] of [
    ["schedule", 'gatedModule("schedule", schedule)'],
    ["subjects", 'gatedModule("subjects", subjects)'],
    ["progress", 'gatedModule("progress", progress)'],
    ["community", 'gatedModule("community", community)'],
    ["search", 'gatedModule("search", search)'],
    ["library", 'gatedModule("library", materials)'],
    ["workshop", 'gatedModule("workshop", workshop, { denyRoles: ["teacher"] })'],
    ["academic", 'gatedModule("academic", academic)'],
    ["assignments", 'gatedModule("assignments", assignments)'],
    ["calculators", 'gatedModule("calculators", calculators)'],
    ["attestations", 'gatedModule("attestations", attestations)'],
    ["tutor", 'gatedModule("tutor", ai)'],
  ]) {
    assert.ok(index.includes(mount), `нет gate для ${key}: ${mount}`);
  }
  assert.match(index, /v1\.route\("\/access", access\)/);
  assert.match(index, /gated\.use\("\*", requireAuth\)/);
  // Мастерская — студенческое пространство: преподавателю закрыта технически.
  assert.match(index, /gatedModule\("workshop", workshop, \{ denyRoles: \["teacher"\] \}\)/);

  const lib = await read("src/lib/module-access.ts");
  assert.match(lib, /app_modules is not migrated yet; fail-open/);
  assert.match(lib, /service client unavailable; fail-open/);
  // Личные маршруты (заметки, закладки, ДЗ студентов) не режутся разделами.
  for (const personal of ["notes", "favorites", "homeworks", "my-questions", "my", "settings"]) {
    const line = index
      .split("\n")
      .find((row) => row.includes(`v1.route("/${personal}"`));
    assert.ok(line, `маршрут /${personal} должен быть смонтирован`);
    assert.ok(!line.includes("gatedModule"), `/${personal} не должен быть обёрнут в gatedModule`);
  }
});

test("staff получает полный реестр разделов, а не пустой список", async () => {
  // Регрессия: шорткат effectiveModuleAccess для admin возвращает пустой
  // список модулей — из-за этого Sidebar скрывал все разделы у админа.
  const route = await read("src/routes/access.ts");
  const myModules = route.slice(route.indexOf('"/my-modules"'), route.indexOf('"/admin/modules"'));
  assert.match(myModules, /isAdmin \|\| isTeacher/);
  assert.match(myModules, /loadModuleRegistry\(service\)/, "для staff реестр читается напрямую");
  const staffBranch = myModules.slice(
    myModules.indexOf("isAdmin || isTeacher) {"),
    myModules.indexOf("} else {"),
  );
  assert.doesNotMatch(staffBranch, /accessResult/, "staff-ветка не зависит от effectiveModuleAccess");
  assert.match(staffBranch, /registry\.modules/);
});

test("admin-поверхность доступа: выдача, отзыв, аудит — только admin", async () => {
  const route = await read("src/routes/access.ts");
  assert.match(route, /access\.get\("\/my-modules", requireAuth/);
  for (const adminRoute of [
    'access.get("/admin/modules", requireAdmin',
    'access.patch("/admin/modules/:key", requireAdmin',
    'access.get("/admin/grants", requireAdmin',
    'access.post("/admin/grants", requireAdmin',
    'access.delete("/admin/grants/:id", requireAdmin',
    'access.get("/admin/audit", requireAdmin',
  ]) {
    assert.ok(route.includes(adminRoute), `нет admin-маршрута: ${adminRoute}`);
  }
  assert.match(route, /audit\(/);
  // Клиенту не отдаётся каталог групповых правил или чужих прав.
  const myModules = route.slice(route.indexOf('"/my-modules"'), route.indexOf('"/admin/modules"'));
  assert.match(myModules, /items:\s*source/);
  assert.doesNotMatch(myModules, /group_module_access/);
});
