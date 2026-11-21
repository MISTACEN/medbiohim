/**
 * Авторские домены (my-*): изоляция по автору серверная, teacherBlock на них
 * не вешается. Прод-баг 2026-11-22: teacherBlock на /my-questions рвал
 * спроектированный учительский поток (ImportTest → личный банк) с отказом
 * «студенческие разделы недоступны». Гвардейцы:
 *  - my-lectures / my-tools / my-questions смонтированы через authorOnly;
 *  - авторский скоуп внутри подтверждён (author_id/created_by фильтры);
 *  - настоящий студенческий домен (attendance) по-прежнему studentOnly.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const indexSource = await readFile(
  path.resolve(import.meta.dirname, "..", "src", "index.ts"),
  "utf8",
);

test("my-lectures / my-tools / my-questions — authorOnly, не studentOnly", () => {
  assert.match(indexSource, /v1\.route\("\/my-lectures", authorOnly\(myLectures\)\)/);
  assert.match(indexSource, /v1\.route\("\/my-tools", authorOnly\(myTools\)\)/);
  assert.match(indexSource, /v1\.route\("\/my-questions", authorOnly\(myQuestions\)\)/);
  assert.doesNotMatch(indexSource, /studentOnly\(myLectures\)|studentOnly\(myTools\)|studentOnly\(myQuestions\)/);
});

test("настоящие студенческие домены остаются studentOnly", () => {
  for (const domain of ["/dashboard", "/groups", "/homeworks", "/lesson-plan", "/curriculum", "/attendance"]) {
    assert.match(indexSource, new RegExp(`v1\\.route\\("${domain.replace("/", "\\/")}", studentOnly\\(`), `${domain} закрыт для teacher`);
  }
});

test("внутри authorOnly-доменов авторский скоуп на сервере", async () => {
  const questions = await readFile(path.resolve(import.meta.dirname, "..", "src", "routes", "my-questions.ts"), "utf8");
  assert.match(questions, /author_id: user\.id/, "запись помечается автором");
  assert.match(questions, /own\(item, user\.id\)/, "чтение/правка/удаление — только свои");
  const lectures = await readFile(path.resolve(import.meta.dirname, "..", "src", "routes", "my-lectures.ts"), "utf8");
  assert.match(lectures, /created_by: user\.id/, "лекции помечаются автором");
});
