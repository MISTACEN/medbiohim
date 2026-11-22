import test from "node:test";
import { readPageWithDomain } from "./page-source.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readAiDomain } from "./ai-source.js";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("tutor has two answer modes with fixed temperatures", async () => {
  const route = await readAiDomain();
  assert.match(route, /MODE_TEMPERATURE: Record<ChatMode, number> = \{ precise: 0\.2, fast: 0\.5 \}/);
  assert.match(route, /value === "fast" \? "fast" : "precise"/);
  // Температура доезжает до провайдера, а не остаётся жёстко 0.25.
  assert.match(route, /fetch, \{ temperature\b/);
  assert.match(route, /workersAiComplete\(env, input, \{ temperature, maxTokens, timeoutMs \}\)/);
});

test("workers ai fallback retries with a smaller budget instead of failing", async () => {
  const route = await readAiDomain();
  // Первый проход — 10 с, второй — быстрая модель на урезанном контексте, третий — 6 с.
  assert.match(route, /attempt\(messages, 900, 10000\)/);
  assert.match(route, /attempt\(compact, 300, 6000\)/);
  // Повтор только на таймаут/недоступность, ошибки содержания пробрасываются.
  assert.match(route, /code !== "TIMEOUT" && code !== "NOT_AVAILABLE"/);
  const lib = await source("../src/lib/workers-ai.ts");
  assert.match(lib, /const timeoutMs = Number\.isFinite\(options\.timeoutMs\)/);
  assert.match(lib, /Math\.max\(3000, Math\.min\(TIMEOUT_MS, Number\(options\.timeoutMs\)\)\)/);
});

test("fast mode skips the lecture corpus, precise mode requires it", async () => {
  const route = await readAiDomain();
  // Решение вынесено в общий предикат: он учитывает и режим, и предмет,
  // и служебный срез /study (см. ai-rag-scope.test.js).
  assert.match(
    route,
    /if \(shouldUseLectureRag\(\{ mode, subjectSlug, contextScope: payload\.context_scope \}\)\) \{/,
  );
  assert.match(route, /shouldUseLectureRag\(\{ mode, subjectSlug: conversationSubject \}\)/);
});

test("exactly one system message is built so RAG and study context are not dropped", async () => {
  const route = await readAiDomain();
  // generate() берёт только первый system-message — второй молча терялся.
  assert.match(route, /const system = messages\.find\(\(message\) => message\.role === "system"\)/);
  assert.match(route, /systemSections\.join\("\\n\\n"\)/);
  assert.match(route, /chatMessages\.filter\(\(message\) => message\.role !== "system"\)/);
});

test("citations carry the lecture id and a footnote number", async () => {
  const route = await readAiDomain();
  assert.match(route, /export type LectureCitation = \{ n: number; title: string; lecture_id: string \| null; subject_slug: string \| null \}/);
  assert.match(route, /parts\.push\(`\[\$\{n\}\] Лекция «\$\{entry\.title\}»:/);
  assert.match(route, /citations\.push\(\{ n, title: entry\.title, lecture_id: entry\.id \|\| null/);
  // Модель обязана ссылаться на номера, а не выдумывать источники.
  assert.match(route, /ставь его номер в квадратных скобках/);
  assert.match(route, /Не ссылайся на номера, которых нет в списке/);
});

test("persistent chat stores the answer mode and sources", async () => {
  const route = await readAiDomain();
  assert.match(route, /answer_mode: mode/);
  assert.match(route, /\.\.\.\(rag\.citations\.length \? \{ sources: rag\.citations \} : \{\}\)/);
});

test("provider caller accepts temperature but keeps 0.25 by default", async () => {
  const provider = await source("../../../integrations/cloudflare-api/src/ai-chat.js");
  assert.match(provider, /export async function generateAiCompletion\(env = \{\}, messages = \[\], preferredProvider = "auto", fetcher = fetch, options = \{\}\)/);
  assert.match(provider, /Number\.isFinite\(requestedTemperature\)/);
  assert.match(provider, /: 0\.25;/);
  assert.match(provider, /Math\.min\(1, Math\.max\(0, requestedTemperature\)\)/);
  // Дефолт остаётся прежним для всех остальных вызовов.
  assert.match(provider, /function callAiCompletion\(cfg, messages, fetcher, temperature = 0\.25, report = \(\) => \{\}, options = \{\}\)/);
});

test("tutor prompt forbids material excuses and key worship", async () => {
  const route = await readAiDomain();
  // Модель не оправдывается отсутствием материалов и не защищает ключ теста.
  assert.match(route, /Запрещены служебные жалобы на нехватку материалов/);
  // Вердикт по ключу обязателен — иначе модель молча защищает ошибочный ответ.
  assert.match(route, /Разбор начинай с одного из трёх вердиктов/);
  assert.match(route, /Оба ответа неверны/);
  assert.match(route, /В ключе ошибка: ваш ответ вернее/);
  assert.match(route, /не сообщай о нехватке материалов и не отказывайся от ответа/);
  // Проверка себя и markdown-оформление — часть системного промпта.
  assert.match(route, /Перед ответом проверь себя/);
  assert.match(route, /Оформляй ответ markdown-ом/);
});

test("explain renders markdown, course photos and follow-up questions", async () => {
  const explain = await source("../../../src/components/tests/ExplainWithAi.tsx");
  // Markdown-рендер вместо стены текста с сырыми ** … **.
  assert.match(explain, /mdToHtml/);
  assert.match(explain, /getTrainerImageUrl/);
  assert.match(explain, /Спросить по разбору/);
  assert.match(explain, /askFollowUp/);
  // Ключ больше не объявлен заранее верным («мой ответ (неверный)»).
  assert.doesNotMatch(explain, /Мой ответ \(неверный\)/);
  // Вердикт тройной, и ответ студента тоже не защищается.
  assert.match(explain, /Оба ответа неверны/);
  assert.match(explain, /Не защищай мой ответ/);
});

test("во время теста можно спросить ИИ, не получая готовый ответ", async () => {
  const explain = await source("../../../src/components/tests/ExplainWithAi.tsx");
  assert.match(explain, /clarify/);
  assert.match(explain, /Не называй правильный вариант и не подсказывай/);
  assert.match(explain, /Не понял вопрос — спросить ИИ/);
  for (const runner of [
    "../../../src/components/physiology/TestRunner.tsx",
    "../../../src/components/test-prep/AttemptRunner.tsx",
  ]) {
    const code = await source(runner);
    assert.match(code, /<ExplainWithAi\s+clarify|clarify\s+question=/, "нет кнопки «спросить ИИ» в " + runner);
  }
});

test("frontend renders sources and the explain-after-error button", async () => {
  const sources = await source("../../../src/components/ai/AnswerSources.tsx");
  assert.match(sources, /\/lectures\/\$\{encodeURIComponent\(source\.lecture_id\)\}/);
  assert.match(sources, /export function normalizeSources/);
  // Старый формат (массив строк-названий) не должен ломать рендер.
  assert.match(sources, /typeof entry === "string"/);

  const explain = await source("../../../src/components/tests/ExplainWithAi.tsx");
  assert.match(explain, /mode: "precise"/);
  assert.match(explain, /subjectSlug/);
  assert.match(explain, /Объяснить · ИИ/);

  const runner = await source("../../../src/components/physiology/TestRunner.tsx");
  assert.match(runner, /checked && !isCorrect\(picks, question\.answer\)/);
  assert.match(runner, /subjectSlug=\{subjectSlug\}/);

  const tutor = await readPageWithDomain("app/tutor/page.tsx");
  assert.match(tutor, /\[\["precise","Точный"\],\["fast","Быстрый"\]\]/);
  // Выбор модели: модель уходит в сообщение только для конкретного провайдера.
  assert.match(tutor, /aiSendMessage\(conversation\.id,q,provider,subjectSlug\|\|undefined,mode,/);
});
