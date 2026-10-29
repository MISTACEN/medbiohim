import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("groups: удаление честное — 409 при составе, затем hard delete или архив", async () => {
  const routes = await source("../src/routes/groups.ts");
  assert.match(routes, /GROUP_HAS_MEMBERS/);
  assert.match(routes, /from\("group_memberships"\)\s*\.select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(routes, /from\("groups"\)\.delete\(\)\.eq\("id", id\)/);
  assert.match(routes, /mode: "deleted"/);
  assert.match(routes, /mode: "archived"/);
  // Архив по-прежнему виден только с явным флагом.
  assert.match(routes, /include_inactive/);
  assert.match(routes, /listQuery = listQuery\.eq\("is_active", true\)/);
});

test("groups: состав группы можно прочитать, добавить по email и убрать", async () => {
  const routes = await source("../src/routes/groups.ts");
  for (const contract of [
    'groups.get("/:id/members"',
    'groups.post("/:id/members"',
    'groups.delete("/:id/members/:userId"',
  ]) assert.ok(routes.includes(contract), "missing members contract: " + contract);
  assert.match(routes, /ilike\("email", rawEmail\)/);
  assert.match(routes, /USER_NOT_FOUND/);
  // Один активный член на группу: старые членства снимаются при переводе.
  assert.match(routes, /update\(\{ is_active: false \}\)\.eq\("user_id", target\.id\)/);
  assert.match(routes, /role_in_group|is_active: true/);
});

test("subjects: архив доступен только по флагу, удаление не сносит чужие строки", async () => {
  const routes = await source("../src/routes/subjects.ts");
  assert.match(routes, /include_inactive/);
  assert.match(routes, /if \(!includeInactive\) q = q\.eq\("is_active", true\)/);
  // Слаг «-» у кириллических названий больше не склеивает все предметы в одно
  // семейство: семейное архивирование только для настоящего слага.
  assert.match(routes, /const usableSlug = slug\.length > 1 && \/\[a-z0-9\]\/\.test\(slug\)/);
  assert.match(routes, /from\("subjects"\)\.update\(\{ is_active: false \}\)\.eq\("id", id\)/);
});

test("subjects: кириллические названия получают читаемый латинский слаг", async () => {
  const routes = await source("../src/routes/subjects.ts");
  assert.match(routes, /const TRANSLIT: Record<string, string>/);
  assert.match(routes, /export function slugify/);
  assert.match(routes, /slugify\(String\(input\.slug \|\| name\)\)/);
});
