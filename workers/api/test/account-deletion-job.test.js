// SA6: cron-исполнение удаления аккаунтов. Проверяем поведение процесса на
// подставленном клиенте: без сети и без БД, но с реальной логикой.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Исходники Worker'а используют относительные импорты без расширения папок,
// которые bare Node не принимает. Хук — только обвязка загрузчика.
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
    if (url.endsWith(".json")) {
      const text = readFileSync(fileURLToPath(url), "utf8");
      return { format: "module", source: `export default ${text};`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
test.after(() => hooks.deregister());

// Хуки должны быть зарегистрированы до загрузки исходников Worker'а, поэтому
// импорт динамический: статический import разрешается раньше тела модуля.
const {
  DELETION_SWEEP_LIMIT,
  runAccountDeletionSweep,
  serviceRoleConfigured,
} = await import("../src/jobs/account-deletion.ts");

const ENV = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon" };
const WITH_KEY = { ...ENV, SUPABASE_SERVICE_KEY: "service-key" };

/** Клиент-двойник: фиксирует вызовы и отдаёт заранее заданные ответы. */
function fakeClient({ due = [], rpcError = null, deleteErrors = {}, markError = null } = {}) {
  const calls = { rpc: [], deleted: [] };
  return {
    calls,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (name === "medbiohim_due_account_deletions") {
        return rpcError ? { data: null, error: rpcError } : { data: due, error: null };
      }
      if (name === "medbiohim_mark_account_deletion_executed") {
        return { data: null, error: markError };
      }
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
    auth: {
      admin: {
        deleteUser: async (id) => {
          calls.deleted.push(id);
          const error = deleteErrors[id] ?? null;
          return { error };
        },
      },
    },
  };
}

test("без служебного ключа процесс не запускается и честно говорит почему", async () => {
  const logs = [];
  // Реальный путь: ключа нет → createServiceClient отдаёт null.
  const result = await runAccountDeletionSweep(ENV, { log: (m) => logs.push(m) });
  assert.deepEqual(result, { found: 0, deleted: 0, failed: 0, skipped: true, reason: "service_role_missing" });
  assert.match(logs.join(" "), /service_role/);

  // И подставленный пустой клиент тоже не должен приводить к «успеху».
  const empty = await runAccountDeletionSweep(ENV, { createClient: () => null });
  assert.equal(empty.skipped, true);
});

test("serviceRoleConfigured понимает все три имени секрета и игнорирует пустые", () => {
  assert.equal(serviceRoleConfigured(ENV), false);
  assert.equal(serviceRoleConfigured({ ...ENV, SUPABASE_SERVICE_KEY: "   " }), false);
  assert.equal(serviceRoleConfigured({ ...ENV, SUPABASE_SERVICE_KEY: "k" }), true);
  assert.equal(serviceRoleConfigured({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: "k" }), true);
  assert.equal(serviceRoleConfigured({ ...ENV, SUPABASE_SECRET_KEY: "k" }), true);
});

test("недоступный RPC (миграция не применена) — это пропуск, а не успех", async () => {
  const client = fakeClient({ rpcError: { code: "PGRST202", message: "could not find the function" } });
  const result = await runAccountDeletionSweep(WITH_KEY, { createClient: () => client });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "rpc_unavailable");
  assert.equal(client.calls.deleted.length, 0);
});

test("пустая очередь: ничего не удаляем и не притворяемся, что работали", async () => {
  const client = fakeClient({ due: [] });
  const result = await runAccountDeletionSweep(WITH_KEY, { createClient: () => client });
  assert.deepEqual(result, { found: 0, deleted: 0, failed: 0, skipped: false });
  assert.equal(client.calls.deleted.length, 0);
});

test("удаляет всех due-пользователей и просит у БД ровно limit", async () => {
  const client = fakeClient({
    due: [
      { request_id: "req-1", user_id: "user-1" },
      { request_id: "req-2", user_id: "user-2" },
    ],
  });
  const result = await runAccountDeletionSweep(WITH_KEY, { createClient: () => client, limit: 5 });
  assert.deepEqual(result, { found: 2, deleted: 2, failed: 0, skipped: false });
  assert.deepEqual(client.calls.deleted, ["user-1", "user-2"]);
  assert.deepEqual(client.calls.rpc[0], {
    name: "medbiohim_due_account_deletions",
    args: { p_limit: 5 },
  });
  // После удаления помечаем исполнение: строка могла остаться, если аккаунта уже не было.
  assert.deepEqual(
    client.calls.rpc.slice(1).map((c) => c.args),
    [{ p_request_id: "req-1" }, { p_request_id: "req-2" }],
  );
});

test("ошибка одного аккаунта не останавливает остальные и попадает в счётчик", async () => {
  const client = fakeClient({
    due: [
      { request_id: "req-1", user_id: "user-1" },
      { request_id: "req-2", user_id: "user-2" },
    ],
    deleteErrors: { "user-1": { status: 500, message: "Internal error" } },
  });
  const logs = [];
  const result = await runAccountDeletionSweep(WITH_KEY, {
    createClient: () => client,
    log: (m, payload) => logs.push([m, payload]),
  });
  assert.deepEqual(result, { found: 2, deleted: 1, failed: 1, skipped: false });
  assert.deepEqual(client.calls.deleted, ["user-1", "user-2"]);
  assert.match(JSON.stringify(logs), /user-1/);
});

test("уже отсутствующий пользователь считается удалённым и помечается, а не висит вечно", async () => {
  const client = fakeClient({
    due: [{ request_id: "req-9", user_id: "user-9" }],
    deleteErrors: { "user-9": { status: 404, message: "User not found" } },
  });
  const result = await runAccountDeletionSweep(WITH_KEY, { createClient: () => client });
  assert.deepEqual(result, { found: 1, deleted: 1, failed: 0, skipped: false });
  assert.deepEqual(client.calls.rpc.at(-1), {
    name: "medbiohim_mark_account_deletion_executed",
    args: { p_request_id: "req-9" },
  });
});

test("запись без user_id не удаляется вслепую", async () => {
  const client = fakeClient({ due: [{ request_id: "req-x" }, { user_id: "user-2", request_id: "req-2" }] });
  const result = await runAccountDeletionSweep(WITH_KEY, { createClient: () => client });
  assert.deepEqual(result, { found: 2, deleted: 1, failed: 1, skipped: false });
  assert.deepEqual(client.calls.deleted, ["user-2"]);
});

test("по умолчанию берём не больше DELETION_SWEEP_LIMIT записей", async () => {
  const client = fakeClient({ due: [] });
  await runAccountDeletionSweep(WITH_KEY, { createClient: () => client });
  assert.deepEqual(client.calls.rpc[0].args, { p_limit: DELETION_SWEEP_LIMIT });
});

test("cron подключён: scheduled-обработчик, триггер и админ-запуск на месте", async () => {
  const index = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.match(index, /async scheduled\(/, "в воркере есть scheduled-обработчик");
  assert.match(index, /runAccountDeletionSweep\(/, "обработчик вызывает процесс удаления");

  const wrangler = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(wrangler, /\[triggers\]/, "cron-триггер объявлен");
  assert.match(wrangler, /crons\s*=\s*\[/, "список cron-выражений задан");

  const route = await readFile(new URL("../src/routes/admin-account.ts", import.meta.url), "utf8");
  assert.match(route, /requireAuth/, "ручной запуск требует авторизации");
  assert.match(route, /includes\("admin"\)/, "и только роли admin");
  assert.match(route, /SWEEP_NOT_CONFIGURED/, "без service_role честный 503");
  assert.match(route, /dry_run/, "есть безопасная проверка без удаления");
  assert.match(route, /Math\.min\(Math\.floor\(rawLimit\), DELETION_SWEEP_LIMIT\)/, "лимит ограничен сверху");

  // Пользователь должен видеть, произойдёт ли удаление на самом деле.
  const exportRoute = await readFile(new URL("../src/routes/export.ts", import.meta.url), "utf8");
  assert.match(exportRoute, /withExecution\(/, "статус удаления несёт флаг конфигурации");
  assert.match(exportRoute, /execution_configured/, "флаг назван явно");
});
