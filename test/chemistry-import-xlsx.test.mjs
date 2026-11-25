import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import * as XLSX from "xlsx";

const ROOT = resolve(import.meta.dirname, "..");
const DIR = resolve(ROOT, "data/chemistry/import");
const files = existsSync(DIR)
  ? readdirSync(DIR).filter((name) => name.endsWith(".xlsx")).sort()
  : [];

function workbookOf(file) {
  return XLSX.read(new Uint8Array(readFileSync(resolve(DIR, file))), { type: "array" });
}

function sheet(file, name) {
  const workbook = workbookOf(file);
  return XLSX.utils.sheet_to_json(workbook.Sheets[name] || {});
}

test("XLSX-батчи собраны и укладываются в лимит 500 строк", () => {
  assert.equal(files.length, 3);
  for (const file of files) {
    const workbook = workbookOf(file);
    const rows = Object.keys(workbook.Sheets).reduce(
      (sum, name) => sum + XLSX.utils.sheet_to_json(workbook.Sheets[name]).length,
      0,
    );
    assert.ok(rows <= 500, `${file}: ${rows} строк`);
  }
});

test("состав совпадает с разбором сборника", () => {
  const manifest = JSON.parse(readFileSync(resolve(DIR, "manifest.json"), "utf8"));
  assert.equal(manifest.totals.exported.questions, 577);
  assert.equal(manifest.totals.exported.tests, 18);
  assert.equal(manifest.totals.skippedMatch, 207);
  assert.equal(manifest.totals.skippedUnkeyed, 29);
  assert.equal(manifest.totals.questionsInSource, 813);
});

test("у каждого вопроса есть ключ, тип и непустой ответ", () => {
  const keys = new Set();
  for (const file of files) {
    for (const row of sheet(file, "questions")) {
      assert.match(String(row.question_key), /^chem-part1-\d+_\d+-\d{3}$/);
      assert.ok(!keys.has(row.question_key), `дубль ключа ${row.question_key}`);
      keys.add(row.question_key);
      assert.ok(["mcq", "open"].includes(row.type), `тип ${row.type}`);
      assert.ok(String(row.answer || "").trim(), `пустой ответ ${row.question_key}`);
      assert.equal(row.subject_key, "chemistry_organic_physical");
      assert.equal(row.is_published, false);
    }
  }
  assert.equal(keys.size, 577);
});

test("варианты mcq — валидный JSON с ровно одним или несколькими верными", () => {
  for (const file of files) {
    for (const row of sheet(file, "questions")) {
      const options = JSON.parse(row.options);
      assert.ok(Array.isArray(options), row.question_key);
      if (row.type === "open") {
        assert.equal(options.length, 0);
        continue;
      }
      assert.ok(options.length >= 2, `${row.question_key}: ${options.length} вариантов`);
      assert.ok(options.some((option) => option.correct === true), row.question_key);
      assert.ok(options.every((option) => typeof option.label === "string"));
      assert.ok(options.some((option) => option.label === row.answer) || row.answer.includes(";") || row.answer.includes("→"));
    }
  }
});

test("соответствия не попали в файлы и перечислены в отчёте", () => {
  const dedupe = JSON.parse(readFileSync(resolve(DIR, "dedupe.json"), "utf8"));
  assert.equal(dedupe.skippedMatch.length, 207);
  const matchKeys = new Set(dedupe.skippedMatch.map((item) => item.stem));
  for (const file of files) {
    for (const row of sheet(file, "questions")) {
      assert.ok(!matchKeys.has(row.text), `соответствие в файле: ${row.question_key}`);
    }
  }
});
