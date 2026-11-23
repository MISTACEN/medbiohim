/**
 * Result Bridge: приём результатов обработки от PdfMentor.
 *
 * Тесты читают исходники: они фиксируют решения, которые нельзя проверить без
 * живого PdfMentor, но легко потерять при рефакторинге — подпись, отказ от 404,
 * идемпотентность по версии и пределы на размер пуша.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

const RESULTS = "workers/api/src/routes/mentor/results.ts";
const MODEL = "workers/api/src/routes/mentor/model.ts";
const MIGRATION = "database/migrations/20261123_bridge_document_results.sql";

test("маршрут приёма результатов смонтирован в /mentor", async () => {
  const source = await read(RESULTS);
  assert.ok(source.includes('results.post("/results"'));
  const index = await read("workers/api/src/routes/mentor/index.ts");
  assert.ok(index.includes('mentor.route("/", results)'));
  assert.ok(index.includes('import results from "./results"'));
});

test("подпись та же, что у Document Bridge, и покрывает файл с пользователем", async () => {
  const source = await read(RESULTS);
  assert.ok(source.includes("documentBridgeCode(fileId, userId)"));
  assert.ok(source.includes("BRIDGE_TIMESTAMP_HEADER") && source.includes("BRIDGE_SIGNATURE_HEADER"));
  assert.ok(source.includes('fail("UNAUTHORIZED", "Подпись бриджа не принята", 401'));
  const model = await read(MODEL);
  assert.ok(model.includes("document:${fileId.toLowerCase()}:${userId.toLowerCase()}"));
});

test("неизвестный файл — это 200 со stored:false, а не 404", async () => {
  const source = await read(RESULTS);
  // PdfMentor трактует 404/405 как «эндпоинт не реализован» и перестаёт пушить,
  // поэтому отсутствие файла не должно выглядеть как отсутствие маршрута.
  assert.ok(!/fail\([^)]*,\s*404\b/.test(source), "маршрут не должен отвечать 404");
  assert.ok(!source.includes("status as 404"));
  assert.ok(source.includes("stored: false"));
  assert.ok(source.includes('reason: "NOT_FOUND"'));
});

test("повторный пуш версии перезаписывает результат", async () => {
  const source = await read(RESULTS);
  assert.ok(source.includes('from("bridge_document_results").upsert'));
  assert.ok(source.includes('onConflict: "file_id,user_id,version"'));
  const sql = await read(MIGRATION);
  assert.ok(sql.includes("constraint bridge_document_results_version_key unique (file_id, user_id, version)"));
});

test("тело пуша ограничено по размеру и полям", async () => {
  const source = await read(RESULTS);
  assert.ok(source.includes("const LIMITS = { pages: 2000, fragments: 5000, route: 200"));
  assert.ok(source.includes("asArray(raw, LIMITS.fragments)"));
  // Чужие ключи в jsonb не сохраняются: нормализация собирает объекты заново.
  assert.ok(source.includes("block_id: shortText(entry.block_id, 120)"));
  assert.ok(source.includes("est_minutes: Number.isFinite(minutes) ? minutes : null"));
});

test("маршрут уважает аварийный выключатель и лимит частоты", async () => {
  const source = await read(RESULTS);
  assert.ok(source.includes('c.env.MENTOR_ENABLED === "0"'));
  assert.ok(source.includes("rateLimit(c.env, `bridge:results:${userId}`, 120, 60)"));
});

test("таблица результатов закрыта для клиентов", async () => {
  const sql = await read(MIGRATION);
  assert.ok(sql.includes("create table if not exists public.bridge_document_results"));
  assert.ok(sql.includes("enable row level security"));
  assert.ok(sql.includes("revoke all on public.bridge_document_results from anon, authenticated"));
  assert.ok(sql.includes("references public.files(id) on delete cascade"));
});
