import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { createServiceClient } from "../lib/supabase";
import { MODULE_ACCESS_SQL, TEACHER_ASSIGNMENTS_SQL } from "../generated/migrations";
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
    ],
    note: "POST /bootstrap/migrate с X-Bootstrap-Secret применит миграции.",
  }, rid));
});

bootstrap.post("/migrate", async (c) => {
  const rid = requestId();
  if (!authorized(c)) return error(c, rid, 404, "NOT_FOUND", "Not found");
  const svc = createServiceClient(c.env);
  if (!svc) return error(c, rid, 503, "SERVICE_ROLE_REQUIRED", "Сервисный ключ не сконфигурирован");
  const files = [
    { name: "20261105090000_teacher_assignments", sql: TEACHER_ASSIGNMENTS_SQL },
    { name: "20261106100000_module_access", sql: MODULE_ACCESS_SQL },
  ];
  const applied: Array<{ statement: number; ok: true }> = [];
  try {
    for (const file of files) {
      const statements = splitSqlStatements(file.sql);
      for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];
        const { error: rpcError } = await svc.rpc("admin_exec_sql", { query: statement });
        if (rpcError) {
          return error(c, rid, 500, "MIGRATION_FAILED",
            `${file.name} @ statement ${index + 1}: ${rpcError.message}`);
        }
        applied.push({ statement: index + 1, ok: true });
      }
    }
    return c.json(ok({
      applied_files: files.map((file) => file.name),
      applied_statements: applied.length,
    }, rid), 200);
  } catch (bootstrapError) {
    console.error("[bootstrap:migrate]", bootstrapError);
    return error(c, rid, 503, "BOOTSTRAP_FAILED", String((bootstrapError as Error).message || bootstrapError));
  }
});

export default bootstrap;
