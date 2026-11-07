import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { createServiceClient } from "../lib/supabase";
import { MODULE_ACCESS_SQL, RESULT_DETAIL_SQL, TEACHER_ASSIGNMENTS_SQL, TEACHER_CATALOG_SQL, TEST_ASSIGNMENTS_SQL } from "../generated/migrations";
import { splitSqlStatements } from "../lib/migration-sql";

/**
 * ОДНОРАЗОВЫЙ бутстрап миграций (удалить после применения).
 *
 * Рабочая станция агента не имеет доступа к Supabase (нет токена Management
 * API и DATABASE_URL), а сервисные ключи живут только в секретах Worker.
 * Этот маршрут позволяет применить миграции через сам Worker: запрос валиден,
 * только если владелец задал секрет MIGRATION_BOOTSTRAP_SECRET и передал его
 * в заголовке. Секрет известен только тому, кто его установил при деплое.
 *
 * ЖИЗНЕННЫЙ ЦИКЛ: применить миграции → проверить → удалить файл и маршрут →
 * redeploy → `wrangler secret delete MIGRATION_BOOTSTRAP_SECRET`.
 */
const bootstrap = new Hono<{ Bindings: Env }>();

function error(c: any, rid: string, status: number, code: string, message: string) {
  const { body, status: responseStatus } = fail(code, message, status, rid);
  return c.json(body, responseStatus as any);
}

/** Секрет должен быть задан и совпадать; без секрета маршрут отвечает 404. */
function authorized(c: any): boolean {
  const expected = String(c.env.MIGRATION_BOOTSTRAP_SECRET || "").trim();
  if (!expected) return false;
  const provided = String(c.req.header("X-Bootstrap-Secret") || "");
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

bootstrap.get("/migrate", async (c) => {
  const rid = requestId();
  if (!authorized(c)) return error(c, rid, 404, "NOT_FOUND", "Not found");
  return c.json(ok({
    ready: true,
    migrations: [
      { name: "20261105090000_teacher_assignments", bytes: TEACHER_ASSIGNMENTS_SQL.length },
      { name: "20261106100000_module_access", bytes: MODULE_ACCESS_SQL.length },
      { name: "20261107090000_test_assignments", bytes: TEST_ASSIGNMENTS_SQL.length },
      { name: "20261106120000_teacher_catalog", bytes: TEACHER_CATALOG_SQL.length },
      { name: "20261107130000_result_detail_levels", bytes: RESULT_DETAIL_SQL.length },
    ],
    note: "POST /bootstrap/migrate с X-Bootstrap-Secret применит миграции. POST /bootstrap/sql — SELECT-диагностика.",
  }, rid));
});

/**
 * SELECT-диагностика прод-базы (только чтение, только один оператор).
 * Используется агентом для расследования багов на живых данных; запись
 * через этот маршрут невозможна — запрос обязан начинаться с SELECT/WITH.
 */
bootstrap.post("/sql", async (c) => {
  const rid = requestId();
  if (!authorized(c)) return error(c, rid, 404, "NOT_FOUND", "Not found");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const sql = String(input?.sql || "").trim();
  if (!sql) return error(c, rid, 422, "VALIDATION_ERROR", "sql required");
  if (!/^(select|with)\b/i.test(sql)) {
    return error(c, rid, 422, "SELECT_ONLY", "Разрешены только SELECT/WITH запросы");
  }
  if (sql.length > 20000) return error(c, rid, 422, "VALIDATION_ERROR", "sql too large");
  const svc = createServiceClient(c.env);
  if (!svc) return error(c, rid, 503, "SERVICE_ROLE_REQUIRED", "Сервисный ключ не сконфигурирован");
  try {
    const { data, error: rpcError } = await svc.rpc("admin_exec_sql", { query: sql });
    if (rpcError) return error(c, rid, 500, "SQL_FAILED", rpcError.message);
    return c.json(ok({ result: data }, rid));
  } catch (sqlError) {
    console.error("[bootstrap:sql]", sqlError);
    return error(c, rid, 503, "BOOTSTRAP_FAILED", String((sqlError as Error).message || sqlError));
  }
});

bootstrap.post("/migrate", async (c) => {
  const rid = requestId();
  if (!authorized(c)) return error(c, rid, 404, "NOT_FOUND", "Not found");
  const svc = createServiceClient(c.env);
  if (!svc) return error(c, rid, 503, "SERVICE_ROLE_REQUIRED", "Сервисный ключ не сконфигурирован");
  const files = [
    { name: "20261105090000_teacher_assignments", sql: TEACHER_ASSIGNMENTS_SQL },
    { name: "20261106100000_module_access", sql: MODULE_ACCESS_SQL },
    { name: "20261107090000_test_assignments", sql: TEST_ASSIGNMENTS_SQL },
    { name: "20261106120000_teacher_catalog", sql: TEACHER_CATALOG_SQL },
    { name: "20261107130000_result_detail_levels", sql: RESULT_DETAIL_SQL },
  ];
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  // Лимит subrequests на одну инвокацию (~50): за раз исполняем батч,
  // продолжение — следующим вызовом с курсором from.
  const requestedFile = String(input?.file || "");
  const startIndex = Math.max(0, Number(input?.from) || 0);
  const batch = Math.min(Math.max(Number(input?.batch) || 25, 1), 40);
  const fileIndex = Math.max(0, files.findIndex((file) => file.name === requestedFile));
  const file = files[fileIndex];
  if (requestedFile && !file) return error(c, rid, 422, "VALIDATION_ERROR", "Неизвестное имя миграции");
  const statements = splitSqlStatements(file.sql);
  const applied: number[] = [];
  try {
    let index = startIndex;
    for (; index < statements.length && applied.length < batch; index += 1) {
      const { error: rpcError } = await svc.rpc("admin_exec_sql", { query: statements[index] });
      if (rpcError) {
        return error(c, rid, 500, "MIGRATION_FAILED",
          `${file.name} @ statement ${index + 1}: ${rpcError.message}`);
      }
      applied.push(index + 1);
    }
    const done = index >= statements.length;
    const nextFile = done && fileIndex + 1 < files.length ? files[fileIndex + 1].name : null;
    return c.json(ok({
      file: file.name,
      applied: applied.length,
      statements: applied,
      next_from: done ? 0 : index,
      done,
      next_file: nextFile,
      hint: done
        ? (nextFile ? `POST { "file": "${nextFile}", "from": 0 }` : "Все миграции применены")
        : `POST { "file": "${file.name}", "from": ${index} }`,
    }, rid), 200);
  } catch (bootstrapError) {
    console.error("[bootstrap:migrate]", bootstrapError);
    return error(c, rid, 503, "BOOTSTRAP_FAILED", String((bootstrapError as Error).message || bootstrapError));
  }
});

export default bootstrap;
