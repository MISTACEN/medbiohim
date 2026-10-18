import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("canonical API mounts test-preparation handlers before test routes", async () => {
  const index = await source("../src/index.ts");
  assert.match(index, /import preparation from "\.\/routes\/preparation"/);
  assert.match(index, /v1\.route\("\/tests", preparation\);\s*v1\.route\("\/tests", tests\);/);
});

test("test lifecycle uses server RPCs and does not fall back to direct attempt insertion", async () => {
  const testsRoute = await source("../src/routes/tests.ts");
  assert.match(testsRoute, /medbiohim_start_test_attempt/);
  assert.match(testsRoute, /medbiohim_save_test_answer/);
  assert.match(testsRoute, /p_answer_text/);
  assert.match(testsRoute, /medbiohim_finish_test_attempt/);
  assert.doesNotMatch(testsRoute, /\.from\("test_attempts"\)\s*\.insert/);
  assert.match(testsRoute, /authoritative_answer/);
});

test("legacy preparation lifecycle routes are wired", async () => {
  const route = await source("../src/routes/preparation.ts");
  for (const contract of [
    'preparation.post("/:id/preparation/start"',
    'preparation.get("/preparation/:id"',
    'preparation.patch("/preparation/:id"',
    'preparation.post("/preparation/:id/finish"',
    'preparation.post("/preparation/:id/retry-grading"',
    'preparation.post("/preparation/:id/ai-review"',
  ]) assert.ok(route.includes(contract), `missing route contract: ${contract}`);
});

test("learning sessions use owner-scoped legacy table contract", async () => {
  const route = await source("../src/routes/sessions.ts");
  assert.match(route, /from\("learning_sessions"\)/);
  assert.match(route, /sessions\.get\("\/:id"/);
  assert.match(route, /sessions\.patch\("\/:id"/);
  assert.match(route, /\.eq\("user_id", user\.id\)/);
  assert.match(route, /PATCHABLE/);
});

test("training mutations validate before invoking protected RPCs", async () => {
  const route = await source("../src/routes/trainings.ts");
  assert.match(route, /histology_training_create/);
  assert.match(route, /histology_training_answer/);
  assert.match(route, /histology_training_complete/);
  assert.match(route, /histology_training_cancel/);
  assert.match(route, /Ответ слишком длинный/);
  assert.match(route, /Недопустимый статус тренировки/);
});


test("histology atlas proxies public Upstash Blob objects without requiring a private token", async () => {
  const trainers = await source("../src/routes/trainers.ts");
  assert.match(trainers, /UPSTASH_BLOB_PUBLIC_BASE_URL\s*\|\|\s*"https:\/\/b8a4f9f853fa\.blob\.upstash\.io"/);
  assert.match(trainers, /publicResponse\.ok && publicResponse\.body/);
  assert.match(trainers, /const bucket = getBlobBucket\(c\.env\);/);
  assert.doesNotMatch(trainers, /if \(!bucket\)\s*\{\s*const \{ body, status \} = fail\("NOT_CONFIGURED"/);
  assert.match(trainers, /histology\/\s*\+\s*stripped/);
  assert.match(trainers, /electronograms\/images\/\s*\+\s*base/);
});

test("materials proxy public Upstash Blob files and retain MIME metadata fallback", async () => {
  const materials = await source("../src/routes/materials.ts");
  const env = await source("../src/env.ts");
  const wrangler = await source("../wrangler.toml");
  assert.match(materials, /UPSTASH_BLOB_PUBLIC_BASE_URL\s*\|\|\s*"https:\/\/b8a4f9f853fa\.blob\.upstash\.io"/);
  assert.match(materials, /publicResponse\.ok && publicResponse\.body/);
  assert.match(materials, /declaredType \|\| upstreamType \|\| "application\/octet-stream"/);
  assert.match(materials, /materials-public-v1/);
  assert.match(env, /UPSTASH_BLOB_PUBLIC_BASE_URL\?: string/);
  assert.match(wrangler, /UPSTASH_BLOB_PUBLIC_BASE_URL = "https:\/\/b8a4f9f853fa\.blob\.upstash\.io"/);
});
