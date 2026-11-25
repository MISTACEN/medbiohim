import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const examList = JSON.parse(readFileSync(new URL("src/data/preparations-exam-list-2026-11.json", root), "utf8"));
const mapping = JSON.parse(readFileSync(new URL("data/preparations-bonus-2026-11.json", root), "utf8"));

const examItems = examList.sections.flatMap((section) =>
  section.items.map((item) => ({ ...item, section: section.title })),
);

test("exam list: 19 позиций первой диагностики", () => {
  assert.equal(examItems.length, 19);
  assert.equal(new Set(examItems.map((item) => item.exam)).size, 19);
  assert.equal(new Set(examItems.map((item) => item.slug)).size, 19);
});

test("mapping: каждая позиция либо сопоставлена, либо помечена отсутствующей", () => {
  const mapped = new Set(mapping.mapped.map((item) => item.exam));
  const missing = new Set(mapping.missing.map((item) => item.exam));
  assert.equal(mapped.size + missing.size, 19);
  for (const item of examItems) {
    assert.ok(mapped.has(item.exam) || missing.has(item.exam), `позиция ${item.exam} потеряна`);
    assert.ok(!(mapped.has(item.exam) && missing.has(item.exam)), `позиция ${item.exam} одновременно есть и отсутствует`);
  }
});

test("mapping: слаги совпадают с экзаменационным списком", () => {
  const byExam = new Map(examItems.map((item) => [item.exam, item]));
  for (const item of [...mapping.mapped, ...mapping.missing]) {
    const exam = byExam.get(item.exam);
    assert.ok(exam, `неизвестная позиция ${item.exam}`);
    assert.equal(item.slug, exam.slug, `слаг не совпадает для ${item.exam}`);
  }
});

test("mapping: 42 файла распределены без повторов", () => {
  const files = mapping.mapped.flatMap((item) => [item.labelPhoto, ...item.shots]);
  assert.equal(files.length, 42);
  assert.equal(new Set(files).size, 42);
  for (const file of files) {
    assert.match(file, /^photo_\d+_2026-11-25_17-24-02\.jpg$/);
  }
});

test("mapping: у каждой сопоставленной позиции есть этикетка", () => {
  for (const item of mapping.mapped) {
    assert.ok(item.labelPhoto, `у ${item.exam} нет фото этикетки`);
    assert.ok(["label", "handwritten-label"].includes(item.confidence));
  }
});
