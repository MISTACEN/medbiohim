import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { scopeMode, shouldUseLectureRag } from "../src/lib/ai-scope.ts";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("RAG выключается без явного предмета", () => {
  assert.equal(shouldUseLectureRag({ mode: "precise" }), false);
  assert.equal(shouldUseLectureRag({ mode: "precise", subjectSlug: null }), false);
  assert.equal(shouldUseLectureRag({ mode: "precise", subjectSlug: "" }), false);
  assert.equal(shouldUseLectureRag({ mode: "precise", subjectSlug: "   " }), false);
});

test("RAG включается для предметного вопроса в точном режиме", () => {
  assert.equal(shouldUseLectureRag({ mode: "precise", subjectSlug: "physiology" }), true);
  // Режим по умолчанию — точный.
  assert.equal(shouldUseLectureRag({ subjectSlug: "histology" }), true);
  assert.equal(shouldUseLectureRag({ mode: "unknown", subjectSlug: "histology" }), true);
  // Пробелы вокруг слага не мешают.
  assert.equal(shouldUseLectureRag({ mode: "precise", subjectSlug: " physiology " }), true);
});

test("быстрый режим идёт без RAG даже с предметом", () => {
  assert.equal(shouldUseLectureRag({ mode: "fast", subjectSlug: "physiology" }), false);
});

test("служебные вызовы со срезом /study идут без RAG", () => {
  assert.equal(shouldUseLectureRag({ mode: "precise", subjectSlug: "physiology", contextScope: "study" }), false);
  assert.equal(shouldUseLectureRag({ mode: "precise", subjectSlug: "physiology", contextScope: " STUDY " }), false);
  // Другие срезы не отключают материалы.
  assert.equal(shouldUseLectureRag({ mode: "precise", subjectSlug: "physiology", contextScope: "tutor" }), true);
  assert.equal(shouldUseLectureRag({ mode: "precise", subjectSlug: "physiology", contextScope: null }), true);
});

test("нормализация режима: всё, кроме fast, — precise", () => {
  assert.equal(scopeMode("fast"), "fast");
  assert.equal(scopeMode("FAST"), "precise");
  assert.equal(scopeMode("precise"), "precise");
  assert.equal(scopeMode(undefined), "precise");
  assert.equal(scopeMode(null), "precise");
});

test("поиск по лекциям невозможен без предмета и в маршрутах", async () => {
  const ai = await source("../src/routes/ai.ts");
  // Оба места (чат и история) решают через общий предикат.
  const decisions = ai.match(/shouldUseLectureRag\(\{/g) || [];
  assert.ok(decisions.length >= 2, `shouldUseLectureRag применяется ${decisions.length} раз`);
  assert.doesNotMatch(ai, /if \(mode === "precise"\) \{\s*const lastQuestion/);
  assert.doesNotMatch(ai, /mode === "precise"\s*\n\s*\? await buildLectureContext/);
  // И сама функция не ищет по всему корпусу без предмета.
  assert.match(
    ai,
    /if \(!String\(subjectSlug \|\| ""\)\.trim\(\)\) return \{ block: "", sources: \[\], citations: \[\] \};/,
  );
  // Фильтр по предмету по-прежнему на месте.
  assert.match(ai, /lectureQuery = lectureQuery\.eq\("subject_slug", subjectSlug\);/);
});
