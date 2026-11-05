/**
 * Авторский предпросмотр теста (план §9.1, BACKLOG п.2).
 *
 * Контракт:
 *  - GET /tests/preview/:id доступен только teacher/admin (capability);
 *  - вопросы отдаются с эталонами (answer/answer_indexes), как view=bank;
 *  - предпросмотр не создаёт попыток и не пишет в статистику;
 *  - список тестов для предпросмотра — /teacher/tests (чтение).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

async function read(rel) {
  return readFile(path.join(root, rel), "utf8");
}

test("предпросмотр теста защищён capability и не создаёт попыток", async () => {
  const route = await read("src/routes/tests.ts");
  const start = route.indexOf('tests.get("/preview/:id"');
  const end = route.indexOf('tests.get("/:id"');
  assert.ok(start > -1, "маршрут /tests/preview/:id существует");
  assert.ok(end > start, "предпросмотр зарегистрирован до общего /:id");
  const body = route.slice(start, end);
  assert.match(body, /requireTeachingCapability\(c, "teacher\.content\.manage"\)/);
  assert.match(body, /answer_indexes/);
  assert.match(body, /answer_display/);
  assert.match(body, /author_preview/);
  // Никаких попыток: ни RPC старта, ни вставки в test_attempts.
  assert.doesNotMatch(body, /medbiohim_start_test_attempt/);
  assert.doesNotMatch(body, /from\("test_attempts"\)/);
  // Маршрут смонтирован в приложении.
  const index = await read("src/index.ts");
  assert.match(index, /v1\.route\("\/tests", tests\)/);
});

test("список тестов для предпросмотра — чтение только для teacher/admin", async () => {
  const route = await read("src/routes/teacher.ts");
  const match = route.match(/teacher\.get\("\/tests"[\s\S]*?\n\}\);/);
  assert.ok(match, "маршрут GET /teacher/tests существует");
  assert.match(match[0], /requireTeachingCapability\(c, "teacher\.content\.manage"\)/);
  assert.match(match[0], /is_published/, "только опубликованные тесты");
  assert.doesNotMatch(match[0], /\.insert\(|\.update\(|\.delete\(/);
});
