/**
 * SA6 — поведенческие проверки роутов экспорта/удаления без сети и без БД.
 *
 * Здесь мы запускаем настоящий Hono-роутер из `src/routes/export.ts` и подменяем
 * только два внешних края:
 *   1. `requireAuth` — отдаёт фиктивного пользователя (вместо Supabase Auth);
 *   2. клиент Supabase — отвечает заранее заданными строками и ошибками.
 *
 * Всё остальное — реальный код роута: сборка документа, заголовки файла, разбор
 * ответов RPC и коды ошибок. Именно эти проверки ловят то, что не видит
 * текстовый контракт: «частично успешный» экспорт, потерянные фильтры по
 * владельцу, выдуманную дату вместо честного 503.
 *
 * node --test запускает каждый файл в отдельном процессе, поэтому подмена
 * `requireAuth` здесь не влияет на другие тесты Worker'а.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

import { Hono } from "hono";

const TEST_USER = {
  id: "user-1",
  email: "student@example.com",
  created_at: "2026-09-01T00:00:00+00:00",
  last_sign_in_at: "2026-10-29T08:00:00+00:00",
};

const AUTH_STUB = `
export async function requireAuth(c, next) {
  const state = globalThis.__MBH_SA6__;
  c.set("user", state.user);
  c.set("accessToken", "fake-access-token");
  c.set("supabase", state.supabase);
  await next();
}
export async function requireAdmin(c, next) { return requireAuth(c, next); }
export async function optionalAuth(c, next) { return requireAuth(c, next); }
export const __authStub = true;
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
    if (url.endsWith(".json")) {
      const text = readFileSync(fileURLToPath(url), "utf8");
      return { format: "module", source: `export default ${text};`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
test.after(() => hooks.deregister());

/* — Фейковый клиент Supabase: те же цепочки, что у PostgREST, но без сети — */

class FakeQuery {
  constructor(table, state) {
    this.table = table;
    this.state = state;
    this.filters = [];
    this.single = false;
  }
  select() { return this; }
  eq(column, value) { this.filters.push([column, value]); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.single = true; return this; }
  then(resolve, reject) {
    this.state.queries.push({ table: this.table, filters: this.filters, single: this.single });
    if (this.table === this.state.failTable) {
      return Promise.resolve({ data: null, error: { code: "PGRST100", message: "boom" } }).then(resolve, reject);
    }
    if (this.table === "users") {
      return Promise.resolve({
        data: {
          id: TEST_USER.id,
          email: TEST_USER.email,
          full_name: "Студент",
          display_name: null,
          avatar_url: null,
          avatar_key: "avatars/user-1.webp",
          course_number: 2,
          semester: 3,
        },
        error: null,
      }).then(resolve, reject);
    }
    const rowCount = this.state.rowCounts[this.table] ?? 1;
    return Promise.resolve({
      data: Array.from({ length: rowCount }, (_, index) => ({ id: `${this.table}-${index}`, owner: this.state.user.id })),
      error: null,
    }).then(resolve, reject);
  }
}

function fakeSupabase(overrides = {}) {
  const state = {
    user: TEST_USER,
    queries: [],
    rpcCalls: [],
    failTable: overrides.failTable || null,
    rowCounts: overrides.rowCounts || {},
    rpc: overrides.rpc || {},
  };
  state.supabase = {
    from(table) {
      return new FakeQuery(table, state);
    },
    rpc(name, args) {
      state.rpcCalls.push({ name, args });
      const handler = state.rpc[name];
      if (!handler) {
        return Promise.resolve({
          data: { status: "none", request_id: null, requested_at: null, scheduled_for: null, cancelled_at: null, executed_at: null, grace_days: 7, days_left: null, execution: "service_role_only", deletion_executed: false },
          error: null,
        });
      }
      return Promise.resolve(handler(args));
    },
  };
  return state;
}

async function composeApp(state) {
  globalThis.__MBH_SA6__ = state;
  const { default: account } = await import("../src/routes/export.ts");
  const app = new Hono();
  app.route("/api/v1/account", account);
  return app;
}

test("SA6 runtime: экспорт отдаёт файл и собирает только свои строки", async () => {
  const state = fakeSupabase();
  const app = await composeApp(state);

  const response = await app.request("/api/v1/account/export");
  assert.equal(response.status, 200);

  const disposition = response.headers.get("content-disposition") || "";
  assert.match(disposition, /^attachment; filename="medbiohim-export-\d{4}-\d{2}-\d{2}\.json"$/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type") || "", /application\/json/);

  const body = await response.json();
  assert.equal(body.ok, true);
  const document = body.data;
  assert.equal(document.schema, "medbiohim.account-export");
  assert.equal(document.schema_version, 1);
  assert.equal(document.account.user_id, TEST_USER.id);

  // Профиль: ключ файла аватара наружу не уходит, факт загрузки — виден.
  assert.equal("avatar_key" in document.profile, false);
  assert.equal(document.profile.has_uploaded_avatar, true);

  // Все разделы выгрузки присутствуют и имеют честные метаданные.
  const sections = {
    roles: document.data.roles,
    groups: document.data.groups,
    preferences: document.data.preferences,
    progress_subjects: document.data.progress.subjects,
    progress_topics: document.data.progress.topics,
    test_attempts: document.data.test_attempts,
    srs_cards: document.data.srs_cards,
    notes: document.data.notes,
    favorites: document.data.favorites,
    homework_submissions: document.data.homework_submissions,
    assignments: document.data.assignments,
    learning_sessions: document.data.learning_sessions,
    attendance: document.data.attendance,
    ai_conversations: document.data.ai_conversations,
    ai_messages: document.data.ai_messages,
    calendar_events: document.data.calendar_events,
    question_comments: document.data.question_comments,
  };
  for (const [name, section] of Object.entries(sections)) {
    assert.equal(section.count, 1, `раздел ${name} должен содержать одну строку из фейка`);
    assert.equal(section.truncated, false, `раздел ${name} не обрезан`);
    assert.ok(Number.isInteger(section.limit) && section.limit >= 1, `у раздела ${name} есть лимит`);
  }

  // Лимиты перечислены по разделам, чтобы файл сам объяснял возможную обрезку.
  assert.equal(document.limits.per_section_limits.favorites, 1000);
  assert.equal(document.limits.per_section_limits.srs_cards, 5000);
  assert.match(document.limits.note, /truncated=true/);

  // Поведенческая проверка приватности: каждый запрос к таблице ограничен владельцем.
  assert.ok(state.queries.length >= 18, `ожидалось ≥18 запросов к БД, было ${state.queries.length}`);
  for (const query of state.queries) {
    if (query.table === "users") {
      assert.deepEqual(query.filters, [["id", TEST_USER.id]], "профиль читается только по своему id");
      continue;
    }
    assert.deepEqual(
      query.filters.filter(([column]) => column === "user_id"),
      [["user_id", TEST_USER.id]],
      `запрос к ${query.table} не ограничен владельцем`
    );
  }
});

test("SA6 runtime: обрезка видна в файле, а ровно-по-лимиту не выдаётся за обрезку", async () => {
  const state = fakeSupabase();
  const app = await composeApp(state);

  // favorites: лимит 1000, фейк отдаёт 1001 строку — раздел должен быть помечен.
  state.rowCounts.favorites = 1001;
  const truncatedBody = await (await app.request("/api/v1/account/export")).json();
  assert.equal(truncatedBody.data.data.favorites.count, 1000);
  assert.equal(truncatedBody.data.data.favorites.truncated, true);
  assert.equal(truncatedBody.data.data.favorites.items.length, 1000);

  // notes: ровно по лимиту (1000) — данных больше нет, обрезки нет.
  state.rowCounts.notes = 1000;
  const exactBody = await (await app.request("/api/v1/account/export")).json();
  assert.equal(exactBody.data.data.notes.count, 1000);
  assert.equal(exactBody.data.data.notes.truncated, false);
});

test("SA6 runtime: сбой раздела даёт 503 и не отдаёт файл", async () => {  const state = fakeSupabase({ failTable: "notes" });
  const app = await composeApp(state);

  const response = await app.request("/api/v1/account/export");
  assert.equal(response.status, 503);
  // Файл не обещаем: иначе браузер сохранил бы «архив» без раздела.
  assert.equal(response.headers.get("content-disposition"), null);

  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "EXPORT_SECTION_UNAVAILABLE");
  assert.equal(body.error.details.section, "заметки");
  assert.match(body.error.message, /Не удалось собрать раздел «заметки»/);
  assert.equal(body.data, undefined);
});

test("SA6 runtime: статус удаления отдаёт дату из БД и прямо говорит, кто удаляет", async () => {
  const state = fakeSupabase({
    rpc: {
      medbiohim_account_deletion_status: () => ({
        data: {
          status: "scheduled",
          request_id: "req-1",
          requested_at: "2026-10-29T00:00:00+00:00",
          scheduled_for: "2026-11-05T00:00:00+00:00",
          cancelled_at: null,
          executed_at: null,
          grace_days: 7,
          days_left: 7,
          execution: "service_role_only",
          deletion_executed: false,
        },
        error: null,
      }),
    },
  });
  const app = await composeApp(state);

  const response = await app.request("/api/v1/account/deletion");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.status, "scheduled");
  assert.equal(body.data.scheduled_for, "2026-11-05T00:00:00+00:00");
  assert.equal(body.data.grace_days, 7);
  assert.equal(body.data.execution, "service_role_only");
  assert.match(body.data.message, /служебный процесс/);
});

test("SA6 runtime: запрос удаления сообщает срок из БД, а повтор — already_requested", async () => {
  let call = 0;
  const state = fakeSupabase({
    rpc: {
      medbiohim_request_account_deletion: () => {
        call += 1;
        return {
          data: {
            status: call === 1 ? "scheduled" : "already_requested",
            request_id: "req-1",
            requested_at: "2026-10-29T00:00:00+00:00",
            scheduled_for: "2026-11-05T00:00:00+00:00",
            cancelled_at: null,
            grace_days: 7,
            days_left: 7,
            execution: "service_role_only",
            deletion_executed: false,
          },
          error: null,
        };
      },
    },
  });
  const app = await composeApp(state);

  const created = await app.request("/api/v1/account/deletion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "  переезд  " }),
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.data.status, "scheduled");
  assert.equal(createdBody.data.grace_days, 7);
  assert.deepEqual(state.rpcCalls.at(-1), {
    name: "medbiohim_request_account_deletion",
    args: { p_reason: "переезд" },
  });

  const repeated = await app.request("/api/v1/account/deletion", { method: "POST" });
  assert.equal(repeated.status, 200, "повторный запрос не ошибка пользователя");
  const repeatedBody = await repeated.json();
  assert.equal(repeatedBody.data.status, "already_requested");
});

test("SA6 runtime: слишком длинная причина — 422 до обращения к БД", async () => {
  const state = fakeSupabase();
  const app = await composeApp(state);

  const response = await app.request("/api/v1/account/deletion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "я".repeat(1001) }),
  });
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(state.rpcCalls.length, 0, "валидация должна отсекать запрос до БД");
});

test("SA6 runtime: отмена без активного запроса — 409, а не «успешно отменено»", async () => {
  const state = fakeSupabase({
    rpc: {
      medbiohim_cancel_account_deletion: () => ({
        data: { status: "not_requested", cancelled: false, request_id: null, requested_at: null, scheduled_for: null, cancelled_at: null, grace_days: 7, days_left: null, execution: "service_role_only", deletion_executed: false },
        error: null,
      }),
    },
  });
  const app = await composeApp(state);

  const response = await app.request("/api/v1/account/deletion", { method: "DELETE" });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, "DELETION_NOT_REQUESTED");
  assert.match(body.error.message, /отменять нечего/);
});

test("SA6 runtime: отмена после исполнения — 409 с отдельным кодом", async () => {
  const state = fakeSupabase({
    rpc: {
      medbiohim_cancel_account_deletion: () => ({
        data: { status: "executed", cancelled: false, request_id: "req-1", executed_at: "2026-10-30T00:00:00+00:00", grace_days: 7, execution: "service_role_only", deletion_executed: true },
        error: null,
      }),
    },
  });
  const app = await composeApp(state);

  const response = await app.request("/api/v1/account/deletion", { method: "DELETE" });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, "DELETION_ALREADY_EXECUTED");
});

test("SA6 runtime: успешная отмена — 200 и правдивый статус", async () => {
  const state = fakeSupabase({
    rpc: {
      medbiohim_cancel_account_deletion: () => ({
        data: {
          status: "cancelled",
          cancelled: true,
          request_id: "req-1",
          requested_at: "2026-10-29T00:00:00+00:00",
          scheduled_for: "2026-11-05T00:00:00+00:00",
          cancelled_at: "2026-10-30T10:00:00+00:00",
          grace_days: 7,
          days_left: null,
          execution: "service_role_only",
          deletion_executed: false,
        },
        error: null,
      }),
    },
  });
  const app = await composeApp(state);

  const response = await app.request("/api/v1/account/deletion", { method: "DELETE" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.status, "cancelled");
  assert.equal(body.data.cancelled_at, "2026-10-30T10:00:00+00:00");
});

test("SA6 runtime: без миграции API отвечает 503 DELETION_NOT_CONFIGURED", async () => {
  const state = fakeSupabase({
    rpc: {
      medbiohim_account_deletion_status: () => ({
        data: null,
        error: { code: "PGRST202", message: "Could not find the function public.medbiohim_account_deletion_status" },
      }),
    },
  });
  const app = await composeApp(state);

  const response = await app.request("/api/v1/account/deletion");
  assert.equal(response.status, 503, "501 подменил бы legacy-upstream, поэтому честный код — 503");
  const body = await response.json();
  assert.equal(body.error.code, "DELETION_NOT_CONFIGURED");
  assert.match(body.error.message, /миграция 20261030_account_deletion\.sql/);
});

test("SA6 runtime: прочий сбой БД не выдаётся за «удаление недоступно из-за миграции»", async () => {
  const state = fakeSupabase({
    rpc: {
      medbiohim_account_deletion_status: () => ({ data: null, error: { code: "57P01", message: "connection reset" } }),
    },
  });
  const app = await composeApp(state);

  const response = await app.request("/api/v1/account/deletion");
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, "DELETION_UNAVAILABLE");
  assert.match(body.error.message, /временно недоступно/);
});
