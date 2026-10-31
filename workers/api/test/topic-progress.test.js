import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("plan-progress: темы + приватный прогресс одним ответом, без N+1", async () => {
  const routes = await source("../src/routes/subjects.ts");
  assert.ok(routes.includes('subjects.get("/:id/plan-progress"'), "plan-progress route missing");
  const start = routes.indexOf('subjects.get("/:id/plan-progress"');
  const next = routes.indexOf('subjects.post("/"', start);
  const body = routes.slice(start, next > start ? next : undefined);
  // Темы и модули предмета.
  assert.match(body, /\.from\("modules"\)/);
  assert.match(body, /\.from\("topics"\)/);
  // Прогресс — только свой: user_id из JWT, фильтр по своим темам.
  assert.match(body, /\.eq\("user_id", user\.id\)/);
  assert.match(body, /\.from\("topic_progress"\)/);
  // Счётчики материалов темы и привязанные занятия.
  assert.match(body, /\.from\("tests"\)/);
  assert.match(body, /\.from\("exam_questions"\)/);
  assert.match(body, /\.from\("schedule_entries"\)/);
  // Честная ошибка вместо тихого пустого ответа.
  assert.match(body, /DB_UNAVAILABLE/);
  // Сводка считается на сервере.
  assert.match(body, /summary/);
});

test("topic progress: PATCH не доверяет телу и валидирует статус", async () => {
  const routes = await source("../src/routes/topics.ts");
  // user_id только из JWT: body.user_id в коде не используется нигде.
  assert.ok(routes.includes("user_id: user.id"));
  assert.ok(!routes.includes("body.user_id"));
  assert.match(routes, /onConflict: "user_id,topic_id"/);
  // Белый список статусов и честные 422.
  assert.match(routes, /TOPIC_STATUSES/);
  assert.match(routes, /VALIDATION_ERROR/);
  // Тема должна существовать до upsert.
  assert.match(routes, /\.from\("topics"\)\.select\("id"\)\.eq\("id", topicId\)/);
  assert.match(routes, /NOT_FOUND/);
});

test("migration: приватность прогресса и связь расписания с темой", async () => {
  const migration = await source("../../../database/migrations/20261030_topic_progress.sql");
  assert.match(migration, /create table if not exists public\.topic_progress/);
  assert.match(migration, /unique \(user_id, topic_id\)/);
  // RLS owner-only на все операции.
  for (const action of ["select", "insert", "update", "delete"]) {
    assert.match(migration, new RegExp(`topic_progress_${action}_own[\\s\\S]{0,200}user_id = \\(select auth\\.uid\\(\\)\\)`));
  }
  // Занятие ссылается на тему; прогресс при удалении темы не каскадируется.
  assert.match(migration, /schedule_entries[\s\S]{0,120}topic_id uuid references public\.topics\(id\) on delete set null/);
});
