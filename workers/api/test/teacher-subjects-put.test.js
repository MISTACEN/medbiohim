/**
 * PUT /teacher/subjects — контракт сохранения предметов преподавателя.
 *
 * Прод-баг (приёмка 2026-11-22): фронтовый teacherSetSubjects шлёт PUT,
 * обработчика не было — кнопка «Сохранить предметы» падала. Тест фиксирует
 * маршрут, admin-гейт, валидацию и атомарную замену через teacher_subjects.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(root, "..", "..");
const read = (rel) => readFile(path.join(root, rel), "utf8");

const CORE = "src/routes/teacher/core.ts";
const FRONT = path.join(repoRoot, "src", "lib", "api", "teacher.ts");
const ENDPOINTS = path.join(repoRoot, "src", "lib", "endpoints.ts");

test("PUT /teacher/subjects существует и только для админа", async () => {
  const core = await read(CORE);
  assert.ok(core.includes('teacher.put("/subjects"'), "маршрут PUT /subjects смонтирован");
  const putBlock = core.slice(core.indexOf('teacher.put("/subjects"'));
  assert.ok(putBlock.includes("requireAdmin"), "сохранение предметов — только админ");
  assert.ok(putBlock.includes("teacher_id"), "принимает teacher_id");
  assert.ok(putBlock.includes("subject_ids"), "принимает subject_ids");
});

test("валидация: uuid, лимит, существование пользователя и предметов", async () => {
  const core = await read(CORE);
  const putBlock = core.slice(core.indexOf('teacher.put("/subjects"'));
  assert.ok(putBlock.includes("UUID.test(teacherId)"), "teacher_id — uuid");
  assert.ok(putBlock.includes("Максимум 200 предметов"), "лимит 200");
  assert.ok(putBlock.includes('"users"'), "проверка существования учителя");
  assert.ok(putBlock.includes('"subjects"'), "проверка существования предметов");
  assert.ok(putBlock.includes("Некоторые предметы не найдены"), "опечатка id не проходит молча");
});

test("замена атомарная: delete по teacher_id, insert с created_by", async () => {
  const core = await read(CORE);
  const putBlock = core.slice(core.indexOf('teacher.put("/subjects"'));
  assert.ok(putBlock.includes('from("teacher_subjects")'), "пишет teacher_subjects");
  assert.ok(putBlock.includes(".delete()"), "старые строки удаляются");
  assert.ok(putBlock.includes("created_by: adminId"), "кто заменил — в аудите строки");
  assert.ok(putBlock.includes("items"), "в ответе — именованный список предметов");
});

test("фронт и сервер согласованы: PUT на тот же путь и тело", async () => {
  const front = await readFile(FRONT, "utf8");
  const endpoints = await readFile(ENDPOINTS, "utf8");
  const core = await read(CORE);
  assert.match(front, /method: "PUT"/, "клиент шлёт PUT");
  assert.match(endpoints, /subjects: \(query\?: string\): string => withQuery\("\/teacher\/subjects"/, "путь /teacher/subjects");
  assert.match(front, /teacher_id: teacherId/, "тело несёт teacher_id");
  assert.match(front, /subject_ids: subjectIds/, "тело несёт subject_ids");
  assert.ok(core.includes('teacher.put("/subjects"'), "сервер слушает тот же путь");
});

test("миграция teacher_subjects: таблица и RLS на месте", async () => {
  // DDL живёт в supabase/migrations (замороженный канон этой волны) —
  // сверяем, что таблица и её RLS действительно описаны в миграциях.
  const sql = await readFile(path.join(repoRoot, "supabase", "migrations", "20261106120000_teacher_catalog.sql"), "utf8");
  assert.match(sql, /create table[^;]*public.teacher_subjects/);
  assert.match(sql, /alter table public.teacher_subjects enable row level security/);
});
