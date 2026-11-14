import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("cloze candidates are filtered by literal quotes from the lecture", async () => {
  const lectures = await source("../src/routes/lectures.ts");
  assert.match(lectures, /export function validateClozeItems/);
  // Пункт без дословной цитаты не публикуется.
  assert.match(lectures, /const needle = normalizeLoose\(before \+ " " \+ answer \+ " " \+ after\)/);
  assert.match(lectures, /haystack\.includes\(needle\)/);
  // Дубликаты терминов и служебные однобуквенные «термины» отбрасываются.
  assert.match(lectures, /if \(!key \|\| seen\.has\(key\)\) continue;/);
  assert.match(lectures, /answer\.length < 2/);
  assert.match(lectures, /items\.length >= 15/);
});

test("cloze accepts text lecture ids (lec-…), not only UUIDs", async () => {
  const lectures = await source("../src/routes/lectures.ts");
  // Регрессия живого E2E: UUID-проверка отбрасывала все 85 лекций и давала 404.
  assert.match(lectures, /const LECTURE_ID = \/\^\[A-Za-z0-9\]\[A-Za-z0-9_-\]\{0,63\}\$\//);
  assert.match(lectures, /function loadLectureForCloze[\s\S]{0,160}if \(!LECTURE_ID\.test\(id\)\) return null;/);
  assert.doesNotMatch(lectures, /function loadLectureForCloze[\s\S]{0,200}\/\^\[0-9a-f-\]\{36\}\$\//);
});

test("cloze falls back to Workers AI when external providers fail", async () => {
  const lectures = await source("../src/routes/lectures.ts");
  // Живой прод: все внешние провайдеры отказали, тьютор выжил на биндинге AI.
  assert.match(lectures, /async function generateClozeDraft/);
  assert.match(lectures, /if \(!workersAiConfigured\(env\)\) throw error;/);
  assert.match(lectures, /workersAiComplete\(\s*env,\s*\[\{ role: "user", content: compactPrompt \}\],\s*\{ temperature: 0\.2, maxTokens: 1200 \}/);
  assert.match(lectures, /buildPrompt\(6000, "6–10", 60\)/);
});

test("cloze generation is cached, rate-limited and honest about failure", async () => {
  const lectures = await source("../src/routes/lectures.ts");
  assert.match(lectures, /lectures\.get\("\/:id\/cloze", requireAuth/);
  assert.match(lectures, /lectures\.post\("\/:id\/cloze", requireAuth/);
  assert.match(lectures, /rateLimit\(c\.env, `lecture:cloze:\$\{user\.id\}`, 12, 600\)/);
  assert.match(lectures, /CLOZE_CACHE_PREFIX \+ id/);
  assert.match(lectures, /onConflict: "key"/);
  // Меньше четырёх дословных пунктов — честный отказ, а не подделка.
  assert.match(lectures, /"CLOZE_UNUSABLE"/);
  // Только опубликованная лекция; кэш пишется служебным клиентом.
  assert.match(lectures, /\.eq\("is_published", true\)/);
  assert.match(lectures, /createServiceClient/);
  // Ровно один system-free вызов с детерминированной температурой.
  assert.match(lectures, /\{ temperature: 0\.2 \}/);
});

test("SRS compression only moves cards earlier and stays owner-scoped", async () => {
  const route = await source("../src/routes/study-prep.ts");
  assert.match(route, /studyPrep\.post\("\/plan\/:id\/compress", requireAuth/);
  assert.match(route, /\.gt\("due_at", targetIso\)/);
  assert.match(route, /\.eq\("user_id", user\.id\)/);
  assert.match(route, /86400000/);
  assert.match(route, /предмета и тем — сжимать нечего/);
});

test("frontend wires the cloze page, endpoints and compression button", async () => {
  const endpoints = await source("../../../src/lib/endpoints.ts");
  assert.match(endpoints, /lectureCloze: \(id: string\): string => `\/lectures\/\$\{enc\(id\)\}\/cloze`/);
  assert.match(endpoints, /studyPrepCompress: \(id: string\): string => `\/study-prep\/plan\/\$\{enc\(id\)\}\/compress`/);

  const content = await source("../../../src/lib/api/content.ts");
  assert.match(content, /export async function generateLectureCloze/);

  const cloze = await source("../../../src/lib/study/cloze.ts");
  assert.match(cloze, /export function normalizeAnswer/);
  assert.match(cloze, /export function isClozeAnswerCorrect/);
  // Пустой ответ не может считаться верным.
  assert.match(cloze, /if \(!answer\) return false;/);

  const page = await source("../../../src/app/lectures/[id]/learn/page.tsx");
  assert.match(page, /isClozeAnswerCorrect\(/);
  assert.match(page, /srsAddCard\(/);
  assert.match(page, /Все ошибки/);

  const plan = await source("../../../src/components/study/PrepPlan.tsx");
  assert.match(plan, /compressStudyPlan\(current\.id\)/);
});
