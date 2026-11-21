import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Миграции 20261120_* применяются вручную на production, поэтому повторный
 * запуск не должен падать: `create table/index` — только с `if not exists`,
 * `create policy` — только после `drop policy if exists`. Тест читает SQL и не
 * требует базы, поэтому ловит регрессию до деплоя.
 */

const MIGRATIONS = path.resolve(import.meta.dirname, "../database/migrations");
const TARGET = /^20261120_.*\.sql$/;

const stripComments = (sql) => sql.replace(/--[^\n]*/g, "");

async function targetFiles() {
  const entries = await readdir(MIGRATIONS);
  return entries.filter((name) => TARGET.test(name)).sort();
}

test("каждая миграция 20261120 создаёт таблицы и индексы идемпотентно", async () => {
  const files = await targetFiles();
  assert.ok(files.length >= 3, "новые миграции на месте");

  const problems = [];
  for (const name of files) {
    const sql = stripComments(await readFile(path.join(MIGRATIONS, name), "utf8"));
    for (const match of sql.matchAll(/create\s+table\s+(?!if\s+not\s+exists)/gi)) {
      problems.push(`${name}: create table без if not exists (${match.index})`);
    }
    for (const match of sql.matchAll(/create\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists)/gi)) {
      problems.push(`${name}: create index без if not exists (${match.index})`);
    }
  }
  assert.deepEqual(problems, []);
});

test("каждая политика удаляется перед созданием — повторный запуск безопасен", async () => {
  const files = await targetFiles();
  const problems = [];
  for (const name of files) {
    const sql = stripComments(await readFile(path.join(MIGRATIONS, name), "utf8"));
    for (const match of sql.matchAll(/create\s+policy\s+([a-z0-9_]+)/gi)) {
      const policy = match[1];
      const drop = new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${policy}\\b`, "i");
      if (!drop.test(sql)) problems.push(`${name}: policy ${policy} без drop if exists`);
    }
  }
  assert.deepEqual(problems, []);
});

test("таблицы новых миграций включают RLS", async () => {
  const files = await targetFiles();
  const problems = [];
  for (const name of files) {
    const sql = stripComments(await readFile(path.join(MIGRATIONS, name), "utf8"));
    const tables = [...sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.([a-z0-9_]+)/gi)].map(
      (match) => match[1],
    );
    for (const table of tables) {
      const rls = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i");
      if (!rls.test(sql)) problems.push(`${name}: ${table} без enable row level security`);
    }
  }
  assert.deepEqual(problems, []);
});
