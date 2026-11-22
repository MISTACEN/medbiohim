/**
 * Доступ к расписанию по группам: администратор без членства.
 *
 * Прод-симптом: у админа нет строк в `group_memberships`, поэтому маршрут
 * отдавал пустой список и страница показывала «0 занятий за семестр», хотя
 * группа выбрана. Админу разрешён явно запрошенный `group_id` (тот же объём,
 * что в /admin/schedule), студенту — только свои группы.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

import { Hono } from "hono";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "who@example.com" };
const GROUP = "a1000000-0000-4000-8000-000000000002";
const OTHER = "a1000000-0000-4000-8000-000000000009";
const SCHEDULE_ID = "b1000000-0000-4000-8000-000000000001";

const AUTH_STUB = `
export async function requireAuth(c, next) {
  const state = globalThis.__MBH_SCHEDULE__;
  c.set("user", state.user);
  c.set("accessToken", "fake-access-token");
  c.set("supabase", state.db);
  await next();
}
export async function requireAdmin(c, next) { return requireAuth(c, next); }
export async function optionalAuth(c, next) { return requireAuth(c, next); }
`;

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        /* fall through */
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/middleware/auth.ts")) {
      return { format: "module", source: AUTH_STUB, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
test.after(() => hooks.deregister());

function fakeDb({ memberships = [], roles = [], schedules = [], entries = [] }) {
  const state = { user: USER, queries: [] };
  const table = (name) => {
    const query = {
      name,
      select() { return query; },
      eq() { return query; },
      in() { return query; },
      gte() { return query; },
      lte() { return query; },
      order() { return query; },
      limit() { return query; },
      maybeSingle() { return query; },
      then(resolve, reject) {
        state.queries.push(name);
        const rows = { group_memberships: memberships, user_roles: roles, schedules, schedule_entries: entries }[name] ?? [];
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return query;
  };
  state.db = { from: table };
  return state;
}

async function composeApp(state) {
  globalThis.__MBH_SCHEDULE__ = state;
  const { default: schedule } = await import("../src/routes/schedule.ts");
  const app = new Hono();
  app.route("/api/v1/schedule", schedule);
  return app;
}

const membership = (groupId) => ({ group_id: groupId, groups: { id: groupId, name: "МБХ 201", is_active: true } });
const role = (code) => ({ roles: { code } });
const scheduleRow = { id: SCHEDULE_ID, group_id: GROUP, semester: 3, version: 1, is_active: true };
const entryRow = {
  id: "c1000000-0000-4000-8000-000000000001",
  date: "2026-11-16",
  start_time: "08:30:00",
  end_time: "10:10:00",
  subject_name: "Физиология",
  type: "lecture",
  schedule_id: SCHEDULE_ID,
  subjects: { id: "d1000000-0000-4000-8000-000000000001", name: "Физиология", slug: "physiology", color_hex: "#123456" },
};

test("расписание: админ без членства видит выбранную группу", async () => {
  const state = fakeDb({ roles: [role("admin")], schedules: [scheduleRow], entries: [entryRow] });
  const app = await composeApp(state);

  const response = await app.request(`/api/v1/schedule?group_id=${GROUP}`, {}, {});
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.data.items.length, 1, "админ получает занятия выбранной группы");
  assert.equal(body.data.items[0].subject_name, "Физиология");
  assert.equal(body.data.notice, undefined);
  assert.ok(state.queries.includes("schedules"), "схема группы действительно читается");
});

test("расписание: студент без членства по-прежнему получает пустой список с notice", async () => {
  const state = fakeDb({ roles: [role("student")], schedules: [scheduleRow], entries: [entryRow] });
  const app = await composeApp(state);

  const response = await app.request(`/api/v1/schedule?group_id=${GROUP}`, {}, {});
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.deepEqual(body.data.items, []);
  assert.equal(body.data.notice, "no_active_group");
});

test("расписание: студент чужой группы получает 403, своей — данные", async () => {
  const foreign = fakeDb({ memberships: [membership(OTHER)], roles: [role("student")], schedules: [scheduleRow], entries: [entryRow] });
  const appForeign = await composeApp(foreign);
  const denied = await appForeign.request(`/api/v1/schedule?group_id=${GROUP}`, {}, {});
  assert.equal(denied.status, 403);

  const own = fakeDb({ memberships: [membership(GROUP)], roles: [role("student")], schedules: [scheduleRow], entries: [entryRow] });
  const appOwn = await composeApp(own);
  const allowed = await appOwn.request(`/api/v1/schedule?group_id=${GROUP}`, {}, {});
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).data.items.length, 1);
});
