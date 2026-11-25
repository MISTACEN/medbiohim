/**
 * Импорт части 1 сборника по химии в Supabase (таблицы tests / questions /
 * test_questions) через PostgREST.
 *
 *   node --env-file=.env.local tools/chem/import_chemistry_to_db.mjs [--publish]
 *
 * Что импортируется:
 *   18 тестов (по темам 1.1–3.13) и 577 вопросов: 379 mcq с ключом и 198 open.
 *   207 заданий на соответствие и 29 mcq без ключа не импортируются — шаблон
 *   теста не умеет пары, а ключ без ответа недостоверен (см.
 *   docs/CHEMISTRY-PART1-IMPORT-2026-11-25.md).
 *
 * Скрипт идемпотентен: строки ищутся по source_key и обновляются, связи
 * test_questions добавляются только недостающие. Ключ берётся из окружения и
 * никогда не печатается.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const SUBJECT_ID = "67f64120-ceac-45bf-a0cf-55d07b5379cc";
// source — узкий enum в БД (manual/workshop/master/import); происхождение
// конкретного сборника хранится в source_key ("chem-part1-…").
const SOURCE = "chem-part1";
const SOURCE_KIND = "import";
const PUBLISH = process.argv.includes("--publish");

const baseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "";
if (!baseUrl || !serviceKey) {
  console.error("Нужны SUPABASE_URL и SUPABASE_SERVICE_KEY (запускайте с --env-file=.env.local)");
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function api(path, init = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${init.method || "GET"} ${path} → ${response.status}: ${text.slice(0, 400)}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const collection = JSON.parse(readFileSync(resolve(ROOT, "data/chemistry/part1-collection-2026-11.json"), "utf8"));

// Тема → topic_id по номеру («1.1 · …» в плане занятий).
const topics = await api(
  `topics?select=id,title,order_index,module_id&module_id=eq.3dfb946f-6b80-4b76-8755-7c858d6f7538`,
);
const topicByNumber = new Map();
for (const topic of topics) {
  const match = /^(\d+\.\d+)\s/.exec(topic.title || "");
  if (match) topicByNumber.set(match[1], topic);
}

const tests = [];
const questions = [];
const links = [];

for (const theme of collection.themes) {
  const key = theme.id || theme.theme || theme.key;
  const topic = topicByNumber.get(key);
  if (!topic) {
    console.warn(`тема ${key}: нет topic в плане занятий — тест пойдёт без темы`);
  }
  const testKey = `${SOURCE}-t${key.replace(".", "_")}`;
  tests.push({
    source_key: testKey,
    subject_id: SUBJECT_ID,
    module_id: topic?.module_id ?? null,
    topic_id: topic?.id ?? null,
    title: `Химия · часть 1 · ${key} ${theme.title ? `· ${theme.title}` : ""}`.trim(),
    order_index: tests.length + 1,
    max_attempts: null,
    time_limit_sec: null,
    is_published: PUBLISH,
    teacher_visible: true,
  });

  let position = 0;
  for (const question of theme.questions) {
    if (question.kind === "match") continue;
    const answerIndexes = Array.isArray(question.answerIndexes) ? question.answerIndexes : [];
    if (question.kind === "mcq" && answerIndexes.length === 0) continue;

    const options = question.kind === "mcq"
      ? question.options.map((label, index) => ({
          id: String.fromCharCode(97 + index),
          label,
          correct: answerIndexes.includes(index + 1),
        }))
      : [];
    const picked = answerIndexes.map((n) => question.options[n - 1]).filter(Boolean);
    const answer = picked.length
      ? picked.length === 1
        ? picked[0]
        : question.answerKind === "sequence"
          ? picked.join(" → ")
          : picked.join("; ")
      : String(question.answer || "");

    position += 1;
    questions.push({
      source_key: `${testKey}-q${String(position).padStart(3, "0")}`,
      source: SOURCE_KIND,
      subject_id: SUBJECT_ID,
      module_id: topic?.module_id ?? null,
      topic_id: topic?.id ?? null,
      type: question.kind === "open" ? "open" : "mcq",
      text: question.stem,
      answer,
      options,
      source_item_id: null,
      explanation: null,
      media: [],
      difficulty: null,
      is_published: PUBLISH,
      __test: testKey,
      __order: position,
    });
  }
}

// --- тесты ---------------------------------------------------------------
const existingTests = await api(`tests?select=id,source_key&source_key=like.${SOURCE}-*`);
const testIdByKey = new Map(existingTests.map((row) => [row.source_key, row.id]));
const newTests = tests.filter((test) => !testIdByKey.has(test.source_key));
if (newTests.length) {
  const created = await api("tests?select=id,source_key", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(newTests),
  });
  for (const row of created) testIdByKey.set(row.source_key, row.id);
}
const updates = tests.filter((test) => !newTests.some((n) => n.source_key === test.source_key));
for (const test of updates) {
  await api(`tests?id=eq.${testIdByKey.get(test.source_key)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    // is_published трогаем только по флагу --publish, иначе обычный перезапуск
    // снял бы уже опубликованные тесты с публикации.
    body: JSON.stringify({ ...test, source_key: undefined, is_published: PUBLISH ? true : undefined }),
  });
}
console.log(`тесты: создано ${newTests.length}, обновлено ${updates.length}, всего ${tests.length}`);

// --- вопросы -------------------------------------------------------------
const existingQuestions = await api(
  `questions?select=id,source_key&source=eq.${SOURCE_KIND}&source_key=like.${SOURCE}-*`,
);
const questionIdByKey = new Map(existingQuestions.map((row) => [row.source_key, row.id]));
const payload = questions.map(({ __test, __order, ...row }) => row);
const newQuestions = payload.filter((row) => !questionIdByKey.has(row.source_key));
for (const batch of chunks(newQuestions, 100)) {
  const created = await api("questions?select=id,source_key", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(batch),
  });
  for (const row of created) questionIdByKey.set(row.source_key, row.id);
}
console.log(`вопросы: создано ${newQuestions.length}, уже было ${existingQuestions.length}, всего ${payload.length}`);

// Повторный запуск с --publish должен опубликовать и уже существующие вопросы.
if (PUBLISH && payload.length) {
  await api(`questions?source=eq.${SOURCE_KIND}&source_key=like.${SOURCE}-*`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ is_published: true }),
  });
}

// --- связи тест ↔ вопрос -------------------------------------------------
const testIds = [...testIdByKey.values()];
const existingLinks = testIds.length
  ? await api(`test_questions?select=test_id,question_id&test_id=in.(${testIds.join(",")})`)
  : [];
const linkKey = (testId, questionId) => `${testId}:${questionId}`;
const linked = new Set(existingLinks.map((row) => linkKey(row.test_id, row.question_id)));
const newLinks = [];
for (const question of questions) {
  const testId = testIdByKey.get(question.__test);
  const questionId = questionIdByKey.get(question.source_key);
  if (!testId || !questionId) {
    console.warn(`нет связи для ${question.source_key}`);
    continue;
  }
  links.push({ test_id: testId, question_id: questionId, order_index: question.__order });
  if (!linked.has(linkKey(testId, questionId))) {
    newLinks.push({ test_id: testId, question_id: questionId, order_index: question.__order });
  }
}
for (const batch of chunks(newLinks, 200)) {
  await api("test_questions?on_conflict=test_id,question_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(batch),
  });
}
console.log(`связи: добавлено ${newLinks.length}, всего ${links.length}`);
console.log(PUBLISH ? "is_published = true (опубликовано)" : "is_published = false (черновик)");
