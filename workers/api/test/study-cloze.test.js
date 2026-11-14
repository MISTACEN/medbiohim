import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("cloze candidates are filtered by literal quotes from the lecture", async () => {
  const { validateClozeItems } = await import("../src/lib/cloze-text.ts");
  const body = "Мембранный потенциал покоя зависит от концентрации ионов калия внутри клетки.";
  const literal = {
    before: "Мембранный потенциал покоя зависит от",
    answer: "концентрации ионов калия",
    after: "внутри клетки",
  };
  // Дословная цитата проходит, пересказ — нет, дубликат термина — тоже.
  assert.equal(validateClozeItems([literal], body).length, 1);
  assert.equal(
    validateClozeItems([{ before: "Мембранный потенциал", answer: "зависит от солей", after: "внутри клетки" }], body).length,
    0,
  );
  assert.equal(validateClozeItems([literal, literal], body).length, 1);
  // Однобуквенные «термины» и пункты сверх лимита отбрасываются.
  assert.equal(validateClozeItems([{ before: "зависит от", answer: "к", after: "внутри клетки" }], body).length, 0);
  const terms = Array.from({ length: 17 }, (_, i) => `Терм${i}азот`);
  const longBody = terms.map((term) => `${term} связан с мембраной клетки.`).join(" ");
  const many = terms.map((term) => ({ before: "", answer: term, after: "связан с мембраной" }));
  assert.equal(validateClozeItems(many, longBody).length, 15, "пунктов не больше пятнадцати");
});

test("cloze keeps a quote cut mid-word and still rejects invention", async () => {
  const { validateClozeItems } = await import("../src/lib/cloze-text.ts");
  const body = "При раздражении мембраны развивается гиперполяризация мембраны и снижается возбудимость.";
  // Модель (и 160-символьная обрезка контекста) разрезает слово: before
  // заканчивается на «гиперполяри», answer — его продолжение «зация».
  const cut = { before: "При раздражении мембраны развивается гиперполяри", answer: "зация", after: "мембраны и снижается" };
  const items = validateClozeItems([cut], body);
  assert.equal(items.length, 1, "дословная цитата, разрезанная посреди слова, не должна выбрасываться");
  assert.equal(items[0].answer, "зация");
  // Пересказ на том же месте по-прежнему не проходит.
  assert.equal(
    validateClozeItems([{ before: "При раздражении мембраны развивается гиперполяри", answer: "деполяризация", after: "мембраны и снижается" }], body).length,
    0,
  );
});

test("cloze cache key carries a version", async () => {
  const clozeText = await source("../src/lib/cloze-text.ts");
  // Без версии после правки промпта/валидации отдавались бы старые пункты.
  assert.match(clozeText, /export const CLOZE_CACHE_VERSION = "v1";/);
  assert.match(clozeText, /export const CLOZE_CACHE_PREFIX = `cloze:\$\{CLOZE_CACHE_VERSION\}:`;/);
  // Оба чтения кэша и запись идут через префикс с версией.
  const lectures = await source("../src/routes/lectures.ts");
  assert.equal((lectures.match(/CLOZE_CACHE_PREFIX \+ id/g) || []).length, 3);
});

test("cloze accepts text lecture ids (lec-…), not only UUIDs", async () => {
  const lectures = await source("../src/routes/lectures.ts");
  // Регрессия живого E2E: UUID-проверка отбрасывала все 85 лекций и давала 404.
  assert.match(lectures, /const LECTURE_ID = \/\^\[A-Za-z0-9\]\[A-Za-z0-9_-\]\{0,63\}\$\//);
  assert.match(lectures, /function loadLectureForCloze[\s\S]{0,160}if \(!LECTURE_ID\.test\(id\)\) return null;/);
  assert.doesNotMatch(lectures, /function loadLectureForCloze[\s\S]{0,200}\/\^\[0-9a-f-\]\{36\}\$\//);
});

test("deterministic bold-term cloze runs before any AI call", async () => {
  const lectures = await source("../src/routes/lectures.ts");
  const clozeText = await source("../src/lib/cloze-text.ts");
  assert.match(clozeText, /export function extractBoldClozeItems/);
  assert.match(lectures, /import \{ CLOZE_CACHE_PREFIX, extractBoldClozeItems, validateClozeItems \} from "\.\.\/lib\/cloze-text"/);
  assert.match(lectures, /let items = validateClozeItems\(extractBoldClozeItems\(text\)/);
  assert.match(lectures, /let provider = "markdown";/);
  // ИИ — только если разметки не хватило на четыре пункта.
  assert.match(lectures, /if \(items\.length < 4\) \{\s*const prompt = buildPrompt\(14000/);
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
