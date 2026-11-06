/**
 * Одноразовый бутстрап миграций: чистый SQL-сплиттер и инертность маршрута.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

test("сплиттер не режет DO-блоки, строки и комментарии", async () => {
  const { splitSqlStatements } = await import("../src/lib/migration-sql.ts");
  const sql = [
    "-- комментарий с ; точкой",
    "create table t (id int); /* блок ; комментарий */",
    "insert into t values ('a;b''c');",
    "do $$",
    "begin",
    "  raise notice 'semi; inside';",
    "end $$;",
    "grant all on t to service_role;",
  ].join("\n");
  const statements = splitSqlStatements(sql);
  assert.equal(statements.length, 4, statements.join("\n---\n"));
  assert.match(statements[2], /do \$\$[\s\S]*end \$\$/);
  assert.match(statements[1], /'a;b''c'/);
});

test("реальные миграции делятся без потерь и покрывают оба файла", async () => {
  const { splitSqlStatements } = await import("../src/lib/migration-sql.ts");
  const { TEACHER_ASSIGNMENTS_SQL, MODULE_ACCESS_SQL } = await import("../src/generated/migrations.ts");
  const teacher = splitSqlStatements(TEACHER_ASSIGNMENTS_SQL);
  const modules = splitSqlStatements(MODULE_ACCESS_SQL);
  assert.ok(teacher.length >= 15, "teacher_assignments: >= 15 выражений");
  assert.ok(modules.length >= 20, "module_access: >= 20 выражений");
  assert.ok(modules.some((s) => s.includes("create table if not exists public.app_modules")), "создание реестра присутствует");
  assert.ok(modules.every((s) => !s.trim().startsWith("--")), "комментарий-only выражений нет");
  // Тела DO-блоков дошли целиком: политики внутри блоков не разрезаны.
  const policyBlock = teacher.find((statement) => statement.includes("teacher_assignments_insert_admin_v1"));
  assert.ok(policyBlock, "DO-блок политик сохранился одним выражением");
  assert.match(policyBlock, /end \$\$/);
});

test("маршрут бутстрапа смонтирован, инертен без секрета и помечен одноразовым", async () => {
  const index = await readFile(path.join(root, "src/index.ts"), "utf8");
  assert.match(index, /v1\.route\("\/bootstrap", bootstrapMigrate\)/);
  const route = await readFile(path.join(root, "src/routes/bootstrap-migrate.ts"), "utf8");
  assert.match(route, /MIGRATION_BOOTSTRAP_SECRET/);
  assert.match(route, /ОДНОРАЗОВЫЙ/);
  assert.match(route, /delete MIGRATION_BOOTSTRAP_SECRET/);
  // Без совпадения секрета — 404, ответ не раскрывает назначение маршрута.
  assert.match(route, /return error\(c, rid, 404, "NOT_FOUND", "Not found"\)/);
});
