import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../src/routes/study-prep.ts", import.meta.url), "utf8");

test("план подготовки строится по любому событию, сводка готовности — по аттестациям", () => {
  // prepReadinessForEvents умеет включать все виды событий, но по умолчанию
  // фильтрует по PREP_KINDS: сводка /academic/state не должна показывать
  // «готовность» к обычному занятию.
  assert.match(route, /options: \{ includeAllKinds\?: boolean \} = \{\}/);
  assert.match(route, /options\.includeAllKinds \|\| PREP_KINDS\.has\(String\(event\.event_kind \|\| ""\)\)/);
  // Оба маршрута плана (GET и POST) передают флаг: кнопка «Готовиться» есть у любого события.
  const calls = route.match(/prepReadinessForEvents\(db, \[event\], progress, \{ includeAllKinds: true \}\)/g) || [];
  assert.equal(calls.length, 2, `флаг передан в ${calls.length} маршрутах плана`);
});

test("темы плана берутся из curriculum_items по topic_id", () => {
  // Без связи topic_id готовность уходила в справочник тем (modules → topics).
  assert.match(route, /\.from\("curriculum_items"\)\s*\n\s*\.select\("subject_id,topic_id,title,planned_date,item_type"\)/);
  assert.match(route, /\.not\("topic_id", "is", null\)/);
  // Запасной путь справочника остаётся только на случай пустого плана.
  assert.match(route, /Запасной источник: темы предмета из справочника \(modules → topics\)/);
  assert.match(route, /if \(topics\.length < 2\) \{/);
});
