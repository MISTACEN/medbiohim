import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("FA5: комментарии постов видны только участникам группы, правка — только своя", async () => {
  const routes = await source("../src/routes/community.ts");
  for (const contract of [
    'community.get("/posts/:id/comments"',
    'community.post("/posts/:id/comments"',
    'community.patch("/posts/:id/comments/:commentId"',
    'community.delete("/posts/:id/comments/:commentId"',
    'community.patch("/posts/:id"',
    'community.post("/posts/:id/report"',
    'community.get("/admin/reports"',
    'community.patch("/admin/reports/:id"',
  ]) assert.ok(routes.includes(contract), "missing: " + contract);
  // Доступ к посту группы проверяется членством, как в ленте.
  assert.match(routes, /assertPostAccess/);
  assert.match(routes, /assertGroupMember/);
  // Правка/удаление комментария — только автор (user_id из JWT).
  assert.match(routes, /\.eq\("user_id", user\.id\)/);
  // Комментарий удаляется мягко (is_deleted), жалоба одного студента — одна.
  assert.match(routes, /is_deleted: true/);
  assert.match(routes, /ALREADY_REPORTED/);
  // Модерские роуты за requireAdmin.
  assert.match(routes, /requireAdmin/);
});

test("миграция FA5: RLS комментариев и жалоб соответствует паттерну", async () => {
  const migration = await source("../../../database/migrations/20261030_community_comments_reports.sql");
  assert.match(migration, /create table if not exists public\.community_comments/);
  assert.match(migration, /char_length\(body\) between 1 and 2000/);
  assert.match(migration, /community_comments_insert_own[\s\S]{0,160}user_id = auth\.uid\(\)/);
  assert.match(migration, /create table if not exists public\.community_reports/);
  assert.match(migration, /unique \(post_id, reporter_user_id\)/);
  // Жалобы читает и закрывает только админ.
  assert.match(migration, /community_reports_select_admin[\s\S]{0,200}has_app_role/);
  assert.match(migration, /community_reports_update_admin/);
});
