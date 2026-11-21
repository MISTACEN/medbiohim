/**
 * Document Bridge: подпись, перепроверка прав, поток и аудит.
 *
 * Тесты читают исходники: они фиксируют решения по безопасности, которые нельзя
 * проверить без Supabase и PdfMentor, но легко потерять при рефакторинге.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (relative) => readFile(path.join(ROOT, relative), "utf8");

const DOCUMENTS = "workers/api/src/routes/mentor/documents.ts";
const MODEL = "workers/api/src/routes/mentor/model.ts";
const MIGRATION = "database/migrations/20261120_bridge_document_reads.sql";

test("bridge отдаёт проверку доступа и поток файла", async () => {
  const source = await read(DOCUMENTS);
  assert.ok(source.includes('documents.post("/documents/access"'));
  assert.ok(source.includes('documents.get("/documents/:id/content"'));
  assert.ok(source.includes('c.env.MENTOR_ENABLED === "0"'), "аварийный выключатель сохраняется");
});

test("метаданные файла читаются из реальных колонок files", async () => {
  const source = await read(DOCUMENTS);
  // В `files` нет колонок `name`, `version`, `checksum`: имя — `original_name`,
  // хеш — `sha256`. Ошибка в списке колонок даёт 503 только в проде.
  assert.ok(source.includes('"id,original_name,mime_type,size_bytes,object_key,specialty_slug,sha256,status"'));
  assert.ok(!source.includes('select("id,name,'), "колонки name в files нет");
  assert.ok(!source.includes(",version,checksum"), "версия/checksum живут не в files");
  assert.ok(source.includes("name: file.original_name ?? null"));
  assert.ok(source.includes("checksum: file.sha256 ?? null"));
});

test("подпись покрывает и файл, и пользователя", async () => {
  const model = await read(MODEL);
  assert.ok(model.includes("export function documentBridgeCode(fileId: string, userId: string)"));
  assert.ok(model.includes("document:${fileId.toLowerCase()}:${userId.toLowerCase()}"));
  assert.ok(model.includes("Префикс отличает его от SSO-кода"));

  const source = await read(DOCUMENTS);
  assert.ok(source.includes("documentBridgeCode(fileId, userId)"));
  assert.ok(source.includes("BRIDGE_TIMESTAMP_HEADER") && source.includes("BRIDGE_SIGNATURE_HEADER"));
  assert.ok(source.includes('fail("UNAUTHORIZED", "Подпись бриджа не принята", 401'));
});

test("права перепроверяются на каждом чтении, без редиректа на подписанный URL", async () => {
  const source = await read(DOCUMENTS);
  const content = source.slice(source.indexOf('documents.get("/documents/:id/content"'));
  assert.ok(content.includes("loadAccessibleFile(c.env, fileId, userId)"), "права проверяются заново");
  assert.ok(!content.includes("signedReadUrl"), "нельзя отдавать ссылку, живущую после отзыва");
  assert.ok(content.includes('"Cache-Control": "private, no-store"'));
  assert.ok(content.includes("bucket.get(key)"));
});

test("доступ без группы не выдаётся, а отказ в access — это allowed:false", async () => {
  const source = await read(DOCUMENTS);
  assert.ok(source.includes(".eq(\"specialty_slug\", specialty)"));
  assert.ok(source.includes(".eq(\"is_active\", true)"), "отзыв группы действует сразу");
  assert.ok(source.includes("allowed: false"));
  assert.ok(source.includes("storageKeyAllowed(key, userId)"));
});

test("каждое чтение пишется в аудит", async () => {
  const source = await read(DOCUMENTS);
  assert.ok(source.includes("from(\"bridge_document_reads\").insert"));
  assert.ok(source.includes('outcome: "allowed"'));
  // Причина отказа вычисляется из статуса, поэтому проверяем сами метки.
  assert.ok(source.includes('"forbidden"'));
  assert.ok(source.includes('"not_found"'));

  const sql = await read(MIGRATION);
  assert.ok(sql.includes("create table if not exists public.bridge_document_reads"));
  assert.ok(sql.includes("enable row level security"));
  assert.ok(sql.includes("revoke all on public.bridge_document_reads from anon, authenticated"));
  assert.ok(sql.includes("check (outcome in ('allowed', 'forbidden', 'not_found', 'error'))"));
});

test("маршруты смонтированы в /mentor и ограничены по частоте", async () => {
  const index = await read("workers/api/src/routes/mentor/index.ts");
  assert.ok(index.includes('mentor.route("/", documents)'));

  const source = await read(DOCUMENTS);
  assert.ok(source.includes("rateLimit(c.env, `bridge:access:${userId}`, 120, 60)"));
  assert.ok(source.includes("rateLimit(c.env, `bridge:content:${userId}`, 120, 60)"));
});
