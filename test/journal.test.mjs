import test from "node:test";
import assert from "node:assert/strict";

const journal = await import(new URL("../src/lib/journal.ts", import.meta.url).href);

const OCR = [
  "Группа МБХ 201 · Гистология",
  "Иванов И. И.   5 4 5",
  "Петров П. П.   3 2",
  "Сидорова А. В. зачёт",
].join("\n");

test("Journal: остаётся только строка студента", () => {
  const result = journal.isolateStudentRow(OCR, "Иванов Иван Иванович");
  assert.equal(result.matched, true);
  assert.match(result.line, /Иванов/);
  assert.doesNotMatch(result.line, /Петров|Сидорова|Группа/);
  assert.deepEqual(result.grades, ["5", "4"]);
});

test("Journal: чужие фамилии не утекают даже при копировании", () => {
  const text = journal.redactToOwnRow(OCR, "Петров Пётр");
  assert.match(text, /Петров/);
  assert.doesNotMatch(text, /Иванов|Сидорова|МБХ/);
});

test("Journal: однофамилец без имени не считается совпадением", () => {
  const text = ["Иванов П. П. 4", "Иванов И. И. 5"].join("\n");
  const result = journal.isolateStudentRow(text, "Иванов Иван");
  assert.equal(result.candidates, 1);
  assert.match(result.line, /Иванов И\. И\./);
});

test("Journal: если строки нет — честный отказ, а не весь текст", () => {
  const result = journal.isolateStudentRow(OCR, "Кузнецов Кузьма");
  assert.equal(result.matched, false);
  assert.equal(result.line, null);
  assert.deepEqual(result.grades, []);
  assert.equal(journal.redactToOwnRow(OCR, ""), "");
});

test("Journal: даты и годы не превращаются в оценки", () => {
  const grades = journal.extractGrades("Иванов И. 12.10.2026 5 4 зачёт");
  assert.deepEqual(grades, ["5", "4", "зачёт"]);
});
