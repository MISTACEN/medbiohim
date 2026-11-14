import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("tutor has two answer modes with fixed temperatures", async () => {
  const route = await source("../src/routes/ai.ts");
  assert.match(route, /MODE_TEMPERATURE: Record<ChatMode, number> = \{ precise: 0\.2, fast: 0\.5 \}/);
  assert.match(route, /value === "fast" \? "fast" : "precise"/);
  // Температура доезжает до провайдера, а не остаётся жёстко 0.25.
  assert.match(route, /fetch, \{ temperature \}\)/);
  assert.match(route, /workersAiComplete\(env, input, \{ temperature, maxTokens, timeoutMs \}\)/);
});

test("workers ai fallback retries with a smaller budget instead of failing", async () => {
  const route = await source("../src/routes/ai.ts");
  // Первый проход — 14 с, второй — быстрая модель на урезанном контексте, третий — 10 с.
  assert.match(route, /attempt\(messages, 900, 14000\)/);
  assert.match(route, /attempt\(compact, 300, 10000\)/);
  // Повтор только на таймаут/недоступность, ошибки содержания пробрасываются.
  assert.match(route, /code !== "TIMEOUT" && code !== "NOT_AVAILABLE"/);
  const lib = await source("../src/lib/workers-ai.ts");
  assert.match(lib, /const timeoutMs = Number\.isFinite\(options\.timeoutMs\)/);
  assert.match(lib, /Math\.max\(3000, Math\.min\(TIMEOUT_MS, Number\(options\.timeoutMs\)\)\)/);
});

test("fast mode skips the lecture corpus, precise mode requires it", async () => {
  const route = await source("../src/routes/ai.ts");
  // Решение вынесено в общий предикат: он учитывает и режим, и предмет,
  // и служебный срез /study (см. ai-rag-scope.test.js).
  assert.match(
    route,
    /if \(shouldUseLectureRag\(\{ mode, subjectSlug, contextScope: payload\.context_scope \}\)\) \{/,
  );
  assert.match(route, /shouldUseLectureRag\(\{ mode, subjectSlug: conversationSubject \}\)/);
});

test("exactly one system message is built so RAG and study context are not dropped", async () => {
  const route = await source("../src/routes/ai.ts");
  // generate() берёт только первый system-message — второй молча терялся.
  assert.match(route, /const system = messages\.find\(\(message\) => message\.role === "system"\)/);
  assert.match(route, /systemSections\.join\("\\n\\n"\)/);
  assert.match(route, /chatMessages\.filter\(\(message\) => message\.role !== "system"\)/);
});

test("citations carry the lecture id and a footnote number", async () => {
  const route = await source("../src/routes/ai.ts");
  assert.match(route, /export type LectureCitation = \{ n: number; title: string; lecture_id: string \| null; subject_slug: string \| null \}/);
  assert.match(route, /parts\.push\(`\[\$\{n\}\] Лекция «\$\{entry\.title\}»:/);
  assert.match(route, /citations\.push\(\{ n, title: entry\.title, lecture_id: entry\.id \|\| null/);
  // Модель обязана ссылаться на номера, а не выдумывать источники.
  assert.match(route, /ставь его номер в квадратных скобках/);
  assert.match(route, /Не ссылайся на номера, которых нет в списке/);
});

test("persistent chat stores the answer mode and sources", async () => {
  const route = await source("../src/routes/ai.ts");
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
  assert.match(provider, /function callAiCompletion\(cfg, messages, fetcher, temperature = 0\.25\)/);
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

  const tutor = await source("../../../src/app/tutor/page.tsx");
  assert.match(tutor, /\[\["precise","Точный"\],\["fast","Быстрый"\]\]/);
  assert.match(tutor, /aiSendMessage\(conversation\.id,q,provider,subjectSlug\|\|undefined,mode\)/);
});
