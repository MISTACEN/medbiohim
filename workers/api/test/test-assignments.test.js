/**
 * Назначения тестов преподавателем (кабинет 8.20–8.24).
 *
 * Контракт:
 *  - POST /teacher/test-assignments: capability teacher.content.manage,
 *    группы только из области преподавателя (loadTeacherScope), студенты —
 *    из назначенных или групп области;
 *  - вопросы не копируются: назначение ссылается на tests.id;
 *  - GET со сводкой (прошли/ожидают/средний процент) — teacher.results.view;
 *  - DELETE — только автор назначения или admin;
 *  - студент видит назначения через GET /tests/assignments (группа/персонально);
 *  - миграция: RLS, ссылки на tests/groups/users, настройки прохождения.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(root, "..", "..");

async function read(rel) {
  return readFile(path.join(root, rel), "utf8");
}

test("миграция test_assignments: таблицы, RLS, настройки, без копирования вопросов", async () => {
  const sql = await readFile(
    path.join(repoRoot, "supabase/migrations/20261107090000_test_assignments.sql"),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.test_assignments/);
  assert.match(sql, /create table if not exists public\.test_assignment_students/);
  assert.match(sql, /alter table public\.test_assignments enable row level security/);
  assert.match(sql, /test_assignments_select_teacher_or_group_v1/);
  assert.match(sql, /test_assignment_students_select_own_v1/);
  assert.match(sql, /references public\.tests\(id\)/, "ссылка на существующий тест");
  assert.match(sql, /references public\.groups\(id\)/);
  assert.match(sql, /grant all on public\.test_assignments[^;]*to service_role/);
  assert.match(sql, /revoke all on public\.test_assignments from anon/);
});

test("преподаватель назначает только в своей области и по capability", async () => {
  const route = await read("src/routes/teacher.ts");
  const post = route.match(/teacher\.post\("\/test-assignments"[\s\S]*?\n\}\);/);
  assert.ok(post, "POST /teacher/test-assignments существует");
  assert.match(post[0], /requireTeachingCapability\(c, "teacher\.content\.manage"\)/);
  assert.match(post[0], /loadTeacherScope/);
  assert.match(post[0], /не входит в вашу область/);
  assert.match(post[0], /is_published !== true/, "только опубликованные тесты");
  assert.match(post[0], /from\("test_assignments"\)/);
  assert.match(post[0], /createServiceClient/, "запись через service client");
  assert.doesNotMatch(post[0], /from\("questions"\)/, "вопросы не копируются");
});

test("сводка по назначениям — чтение по results.view, удаление только своего", async () => {
  const route = await read("src/routes/teacher.ts");
  const list = route.match(/teacher\.get\("\/test-assignments"[\s\S]*?\n\}\);\n\n\/\*\* Отменить/);
  assert.ok(list, "GET /teacher/test-assignments существует");
  assert.match(list[0], /requireTeachingCapability\(c, "teacher\.results\.view"\)/);
  assert.match(list[0], /avg_percent/);
  assert.match(list[0], /from\("test_attempts"\)/, "статистика из существующих попыток");
  assert.match(list[0], /test_assignment_students/);

  const del = route.match(/teacher\.delete\("\/test-assignments\/:id"[\s\S]*?\n\}\);/);
  assert.ok(del, "DELETE существует");
  assert.match(del[0], /eq\("teacher_id", c\.get\("user"\)\.id\)/, "не автор удалить не может");
});

test("студент видит назначения своей группы и персональные", async () => {
  const tests = await read("src/routes/tests.ts");
  const route = tests.match(/tests\.get\("\/assignments"[\s\S]*?\n\}\);/);
  assert.ok(route, "GET /tests/assignments существует");
  assert.match(route[0], /group_memberships/);
  assert.match(route[0], /test_assignment_students\.student_id/);
  assert.match(route[0], /tests!inner/, "только опубликованные тесты");
  // Маршрут зарегистрирован до /:id, чтобы не перехватывался общим паттерном.
  const idxAssignments = tests.indexOf('tests.get("/assignments"');
  const idxGeneric = tests.indexOf('tests.get("/:id"');
  assert.ok(idxAssignments > -1 && idxGeneric > idxAssignments, "/assignments до /:id");
});
