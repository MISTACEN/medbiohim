/**
 * Новые учебные механики (сентябрь 2026): рекомендации практики, сундук дня,
 * подкаст и шпаргалка лекции.
 *
 * Контракт по коду, а не по данным:
 *  - /tests/recommended зарегистрирован ДО общего /tests/:id, иначе «recommended»
 *    уходил бы в поиск теста по id и отдавал 404;
 *  - рекомендация опирается на user_topic_progress и проверку доступа к предмету;
 *  - сундук идемпотентен: награда пишется событием quest_chest, повтор гасится
 *    проверкой уже существующего события;
 *  - подкаст требует GEMINI_API_KEY и заворачивает PCM в WAV (браузеры L16 не
 *    проигрывают), квота считается как lecture_podcast;
 *  - шпаргалка кэшируется по хэшу тела лекции.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

async function read(rel) {
  return readFile(path.join(root, rel), "utf8");
}

test("рекомендации практики зарегистрированы до /tests/:id", async () => {
  const route = await read("src/routes/tests.ts");
  const recommended = route.indexOf('tests.get("/recommended"');
  const detail = route.indexOf('tests.get("/:id"');
  assert.ok(recommended > -1, "маршрут /tests/recommended существует");
  assert.ok(detail > recommended, "/tests/recommended объявлен раньше /tests/:id");
  const body = route.slice(recommended, detail);
  assert.match(body, /user_topic_progress/);
  assert.match(body, /accessibleSubjectIds/);
  assert.match(body, /reason: "NO_PROGRESS"/);
  assert.match(body, /reason: "NO_TESTS"/);
});

test("сундук дня идемпотентен и учтён в событиях", async () => {
  const route = await read("src/routes/study-prep.ts");
  assert.match(route, /studyPrep\.post\("\/quests\/chest"/);
  assert.match(route, /kind: "quest_chest"/);
  assert.match(route, /chest\.claimed/);
  const activity = await read("src/lib/activity.ts");
  assert.match(activity, /"quest_chest"/);
});

test("подкаст лекции: ключ, WAV и квота", async () => {
  const route = await read("src/routes/lectures.ts");
  const start = route.indexOf('lectures.post("/:id/podcast"');
  assert.ok(start > -1, "маршрут подкаста существует");
  const body = route.slice(start);
  assert.match(body, /GEMINI_API_KEY/);
  assert.match(body, /gemini-2\.5-flash-preview-tts/);
  assert.match(body, /pcmToWav/);
  assert.match(body, /lecture_podcast/);
});

test("шпаргалка лекции кэшируется по хэшу тела", async () => {
  const route = await read("src/routes/lectures.ts");
  const start = route.indexOf('lectures.post("/:id/cheatsheet"');
  assert.ok(start > -1, "маршрут шпаргалки существует");
  const body = route.slice(start, route.indexOf('lectures.post("/:id/podcast"'));
  assert.match(body, /cheatsheet:v1:/);
  assert.match(body, /clozeBodyHash/);
  assert.match(body, /lecture_cheatsheet/);
});
