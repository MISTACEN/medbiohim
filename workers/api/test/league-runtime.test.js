/**
 * Поведенческие проверки недельного рейтинга без сети и без БД.
 *
 * Запускается настоящий Hono-роутер `src/routes/league.ts`, подменяются только
 * два внешних края: `requireAuth` (фиктивный пользователь) и `lib/supabase`
 * (сервисный клиент). Проверяется то, что не видно в текстовом контракте:
 * приоритет SQL-агрегации, честный fallback до применения миграции и то, что
 * пустой ответ RPC не превращается в лишний скан таблицы.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

import { Hono } from "hono";

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "student@example.com",
};

const AUTH_STUB = `
export async function requireAuth(c, next) {
  const state = globalThis.__MBH_LEAGUE__;
  c.set("user", state.user);
  c.set("accessToken", "fake-access-token");
  c.set("supabase", state.service);
  await next();
}
export async function requireAdmin(c, next) { return requireAuth(c, next); }
export async function optionalAuth(c, next) { return requireAuth(c, next); }
`;

const SUPABASE_STUB = `
export function createServiceClient() { return globalThis.__MBH_LEAGUE__.service; }
export function createClient() { return null; }
export function isConfigured() { return true; }
`;

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        /* fall through to the real resolver */
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/middleware/auth.ts")) {
      return { format: "module", source: AUTH_STUB, shortCircuit: true };
    }
    if (url.endsWith("/lib/supabase.ts")) {
      return { format: "module", source: SUPABASE_STUB, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
test.after(() => hooks.deregister());

/** Сервисный клиент: только те цепочки, которые реально использует маршрут. */
function fakeService({ rpc, events = [], users = [] }) {
  const state = { user: USER, rpcCalls: [], queries: [], rpc, events, users };
  state.service = {
    rpc(name, args) {
      state.rpcCalls.push({ name, args });
      const result =
        typeof state.rpc === "function"
          ? state.rpc(name, args)
          : { data: null, error: { code: "42883", message: "function does not exist" } };
      return Promise.resolve(result);
    },
    from(table) {
      const query = {
        select() { return query; },
        gte() { return query; },
        in() { return query; },
        limit() { return query; },
        then(resolve, reject) {
          state.queries.push({ table });
          if (table === "activity_events") {
            return Promise.resolve({ data: state.events, error: null }).then(resolve, reject);
          }
          if (table === "users") {
            return Promise.resolve({ data: state.users, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return state;
}

async function composeApp(state) {
  globalThis.__MBH_LEAGUE__ = state;
  const { default: league } = await import("../src/routes/league.ts");
  const app = new Hono();
  app.route("/api/v1/league", league);
  return app;
}

test("лига: SQL-агрегация — приоритетный путь, таблицы не сканируются", async () => {
  const state = fakeService({
    rpc: () => ({
      data: [
        { user_id: USER.id, name: "Аня", points: 300 },
        { user_id: "user-2", name: "Борис", points: 15 },
      ],
      error: null,
    }),
  });
  const app = await composeApp(state);

  const response = await app.request("/api/v1/league", {}, {});
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.my.points, 300);
  assert.equal(body.data.my.rank, 1);
  assert.equal(body.data.my.league, "Платина");
  assert.deepEqual(body.data.top.map((row) => row.name), ["Аня", "Борис"]);
  assert.equal(body.data.top[0].is_me, true);
  assert.equal(body.data.total, 2);

  assert.equal(state.rpcCalls.length, 1);
  assert.equal(state.rpcCalls[0].name, "medbiohim_week_leaderboard");
  assert.ok(state.rpcCalls[0].args.p_week_start, "окно недели передаётся аргументом");
  assert.deepEqual(state.queries, [], "при работающем RPC события в память не тянутся");
});

test("лига: без миграции — fallback в воркере, очки и имена те же", async () => {
  const state = fakeService({
    rpc: () => ({ data: null, error: { code: "42883", message: "function does not exist" } }),
    events: [
      { user_id: USER.id, kind: "test_finished" },
      { user_id: USER.id, kind: "homework_marked" },
      { user_id: "user-2", kind: "srs_review" },
      { user_id: USER.id, kind: "unknown_kind" },
    ],
    users: [
      { id: USER.id, display_name: "Аня", full_name: "Анна" },
      { id: "user-2", display_name: null, full_name: "Борис" },
    ],
  });
  const app = await composeApp(state);

  const response = await app.request("/api/v1/league", {}, {});
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.data.my.points, 15, "10 за тест + 5 за ДЗ, неизвестные события не считаются");
  assert.equal(body.data.my.rank, 1);
  assert.equal(body.data.my.league, "Бронза");
  assert.equal(body.data.top[1].name, "Борис");
  assert.equal(body.data.top[1].points, 2);

  const tables = state.queries.map((query) => query.table);
  assert.deepEqual(tables, ["activity_events", "users"], "fallback читает события и имена");
});

test("лига: пустой ответ RPC — это «событий нет», а не повод сканировать БД", async () => {
  const state = fakeService({ rpc: () => ({ data: [], error: null }) });
  const app = await composeApp(state);

  const response = await app.request("/api/v1/league", {}, {});
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.data.my.points, 0);
  assert.equal(body.data.my.rank, null);
  assert.deepEqual(body.data.top, []);
  assert.equal(body.data.total, 0);
  assert.deepEqual(state.queries, []);
});
