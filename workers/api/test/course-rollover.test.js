// Пересчёт курса групп по cron: проверяем обвязку на подставленном клиенте —
// без сети и БД, но с реальной логикой запуска и отчёта.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Исходники Worker'а используют относительные импорты без расширения.
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

const { runCourseRollover } = await import("../src/jobs/course-rollover.ts");

const ENV = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon" };

function fakeClient({ data = { updated: 0 }, error = null } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name) => {
      calls.push(name);
      return { data, error };
    },
  };
}

test("без service_role пересчёт честно пропускается", async () => {
  const logs = [];
  const result = await runCourseRollover(ENV, { createClient: () => null, log: (m) => logs.push(m) });
  assert.deepEqual(result, { updated: 0, skipped: true, reason: "service_role_missing" });
  assert.ok(logs.some((line) => line.includes("service_role")));
});

test("cron вызывает единственную RPC и возвращает число обновлённых групп", async () => {
  const client = fakeClient({ data: { updated: 2 } });
  const result = await runCourseRollover(ENV, { createClient: () => client, log: () => {} });
  assert.deepEqual(result, { updated: 2, skipped: false });
  assert.deepEqual(client.calls, ["medbiohim_rollover_group_courses"]);
});

test("недоступная RPC не маскируется под успешный ноль", async () => {
  const result = await runCourseRollover(ENV, {
    createClient: () => fakeClient({ error: { message: "boom" } }),
    log: () => {},
  });
  assert.deepEqual(result, { updated: 0, skipped: true, reason: "rpc_unavailable" });
});

test("неожиданный ответ RPC не даёт NaN в отчёте", async () => {
  const result = await runCourseRollover(ENV, {
    createClient: () => fakeClient({ data: null }),
    log: () => {},
  });
  assert.deepEqual(result, { updated: 0, skipped: false });
});

test("scheduled-обработчик запускает пересчёт курса", async () => {
  const index = await readFile(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
  assert.match(index, /runCourseRollover\(env\)/);
});
