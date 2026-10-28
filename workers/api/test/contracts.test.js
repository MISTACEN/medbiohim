import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("501 fallback replaces Hono's finalized response with the shadow response", async () => {
  const index = await source("../src/index.ts");
  assert.match(index, /c\.res\s*=\s*await c\.env\.MEDBIOHIM_UPSTREAM\.fetch\(legacyRequest\)/);
  assert.match(index, /c\.res\s*=\s*c\.json\(body, status as 502\)/);
});

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
  const imageRoute = trainers.slice(trainers.indexOf('trainers.get("/feed/:id/image"'));
  assert.ok(imageRoute.length > 0, "public trainer image route exists");
  assert.doesNotMatch(imageRoute, /trainers\.get\("\/feed\/:id\/image",\s*requireAuth/);
  assert.match(imageRoute, /createServiceClient\(c\.env\) \|\| createAnonClient\(c\.env\)/);
  assert.match(trainers, /const bucket = getBlobBucket\(c\.env\);/);
  assert.doesNotMatch(trainers, /if \(!bucket\)\s*\{\s*const \{ body, status \} = fail\("NOT_CONFIGURED"/);
  assert.match(trainers, /add\("histology\/" \+ stripped\)/);
  assert.match(trainers, /add\("electronograms\/images\/" \+ base\)/);
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

test("admin parity routes used by the frontend are mounted with safe table-backed handlers", async () => {
  const admin = await source("../src/routes/admin.ts");
  const parity = await source("../src/routes/admin-parity.ts");
  assert.match(admin, /admin\.route\("\/", adminParity\)/);
  for (const contract of [
    'parity.get("/community"',
    'parity.patch("/community/:id"',
    'parity.delete("/community/:id"',
    'parity.get("/homeworks"',
    'parity.post("/homeworks"',
    'parity.delete("/homeworks/:id"',
    'parity.get("/materials"',
    'parity.delete("/materials/:id"',
    'parity.get("/problem-center"',
    'parity.post("/problem-center/work"',
    'parity.patch("/problem-center/work/:id"',
    'parity.patch("/question-reports/:id"',
    'parity.put("/site"',
    'parity.post("/content/archive"',
    'parity.post("/content/move"',
    'parity.get("/db/audit"',
    'parity.post("/db/audit/:id/rollback"',
  ]) assert.ok(parity.includes(contract), "missing route contract: " + contract);
  assert.match(parity, /FILE_IN_USE/);
  assert.match(parity, /HOMEWORK_HAS_ACTIVITY/);
  assert.match(parity, /PINNING_NOT_SUPPORTED/);
  assert.match(parity, /\["low", "normal", "high", "urgent"\]/);
});

test("content importer returns the response fields expected by the admin UI", async () => {
  const admin = await source("../src/routes/admin.ts");
  assert.match(admin, /dry_run:\s*true,\s*valid:\s*true,\s*errors:\s*\[\]/);
  assert.match(admin, /created:\s*\{\s*tests:\s*mappedTests\.length/);
});

test("chemistry master catalog reads chemistry_master_documents and reports DB failures", async () => {
  const testsRoute = await source("../src/routes/tests.ts");
  // Каталог лежит в chemistry_master_documents; чтение несуществующей
  // chemistry_master месяцами маскировалось пустым ответом 200.
  assert.match(testsRoute, /\.from\("chemistry_master_documents"\)/);
  assert.doesNotMatch(testsRoute, /\.from\("chemistry_master"\)/);
  const chemistryRoute = testsRoute.slice(
    testsRoute.indexOf('tests.get("/chemistry-master"'),
    testsRoute.indexOf('tests.get("/attempts"')
  );
  assert.ok(chemistryRoute.length > 0, "chemistry-master route not found");
  assert.match(chemistryRoute, /DB_UNAVAILABLE/);
  assert.doesNotMatch(chemistryRoute, /ok\(\{\s*items:\s*\[\]\s*\}/);
  // Фильтры и пагинация из UI: q/kind/formula/page/limit + pagination в ответе.
  assert.match(chemistryRoute, /c\.req\.query\("q"\)/);
  assert.match(chemistryRoute, /c\.req\.query\("kind"\)/);
  assert.match(chemistryRoute, /c\.req\.query\("formula"\)/);
  assert.match(chemistryRoute, /pagination:\s*\{\s*total/);
  assert.match(chemistryRoute, /normalizeChemistryItem/);
});

test("curriculum map no longer masks database errors with an empty list", async () => {
  const testsRoute = await source("../src/routes/tests.ts");
  const mapRoute = testsRoute.slice(
    testsRoute.indexOf('tests.get("/curriculum-map"'),
    testsRoute.indexOf('tests.get("/chemistry-master"')
  );
  assert.ok(mapRoute.length > 0, "curriculum-map route not found");
  assert.match(mapRoute, /DB_UNAVAILABLE/);
  assert.doesNotMatch(mapRoute, /ok\(\{\s*items:\s*\[\]\s*\}/);
});

test("every admin-schedule handler is staff-gated (D3)", async () => {
  const route = await source("../src/routes/admin-schedule.ts");
  const handlers = [
    'adminSchedule.get("/schedule/versions/:scheduleId"',
    'adminSchedule.post("/schedule/save"',
    'adminSchedule.post("/schedule/rollback/:scheduleId/:targetVersion"',
    'adminSchedule.patch("/schedule/entries/:id"',
    'adminSchedule.delete("/schedule/entries/:id"',
    'adminSchedule.get("/schedule/analytics/:scheduleId"',
  ];
  for (const handler of handlers) {
    const start = route.indexOf(handler);
    assert.ok(start >= 0, "missing handler: " + handler);
    const body = route.slice(start, start + 900);
    assert.match(body, /isAdmin\(c\)/, "handler is not staff-gated: " + handler);
  }
});

test("assignment tracker is mounted and scoped to the caller only", async () => {
  const index = await source("../src/index.ts");
  assert.match(index, /import assignments from "\.\/routes\/assignments"/);
  assert.match(index, /v1\.route\("\/assignments", assignments\)/);

  const route = await source("../src/routes/assignments.ts");
  // Личные записи: таблица my_assignments, owner-only RLS, user_id из JWT.
  assert.match(route, /\.from\("my_assignments"\)/);
  assert.doesNotMatch(route, /site_content/);
  assert.match(route, /\.eq\("user_id", user\.id\)/);
  assert.doesNotMatch(route, /body\.user_id/);
  // Каждый хендлер требует авторизации.
  const handlers = ['assignments.get("/"', 'assignments.post("/"', 'assignments.patch("/:id"', 'assignments.delete("/:id"'];
  for (const handler of handlers) {
    const start = route.indexOf(handler);
    assert.ok(start >= 0, "missing handler: " + handler);
    const body = route.slice(start, start + 260);
    assert.match(body, /requireAuth/, "handler is not authenticated: " + handler);
  }
  // Статусы — закрытый список, а не произвольная строка из тела запроса.
  assert.match(route, /const STATUSES = new Set\(\["passed", "failed", "pending", "retake_needed"\]\)/);
});

test("imported sources table is the storage and legacy keys stay user-scoped", async () => {
  const route = await source("../src/routes/integrations.ts");
  assert.match(route, /\.from\("imported_sources"\)/);
  assert.match(route, /\.eq\("user_id", user\.id\)/);
  assert.match(route, /user_id: user\.id/);
  // Legacy-ключи site_content читаются только в своём префиксе.
  assert.match(route, /extimport:\$\{userId\}:/);
});

test("personal iCal import is user-scoped, SSRF-guarded and keeps manual topic links", async () => {
  const index = await source("../src/index.ts");
  assert.match(index, /import scheduleIcal from "\.\/routes\/schedule-ical"/);
  assert.match(index, /v1\.route\("\/schedule", schedule\);\s*v1\.route\("\/schedule", scheduleIcal\);/);

  const route = await source("../src/routes/schedule-ical.ts");
  // Личные события: своя таблица, owner-only, user_id только из JWT.
  assert.match(route, /\.from\("user_calendar_events"\)/);
  assert.doesNotMatch(route, /\.from\("schedule_entries"\)/);
  assert.match(route, /\.eq\("user_id", user\.id\)/);
  assert.doesNotMatch(route, /body\.user_id/);
  // Ссылка на фид не может указывать на внутреннюю сеть.
  assert.match(route, /assertPublicUrl/);
  assert.match(route, /169\.254\.169\.254/);
  // Ответ без событий — ошибка, а не пустой успех.
  assert.match(route, /NO_EVENTS/);
  // Повторная синхронизация не перезаписывает уже привязанную тему.
  assert.match(route, /topic_id: item\.topicId/);
  assert.match(route, /touched\.push\(base\)/);

  const handlers = ['ical.get("/ical"', 'ical.post("/ical"', 'ical.delete("/ical/:id"'];
  for (const handler of handlers) {
    const start = route.indexOf(handler);
    assert.ok(start >= 0, "missing handler: " + handler);
    assert.match(route.slice(start, start + 120), /requireAuth/, "handler is not authenticated: " + handler);
  }
});
