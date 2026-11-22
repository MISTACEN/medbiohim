/** Совместимый /chat и оценка устного ответа. */
import { Hono } from "hono";

import type { Env } from "../../env";
import { ok, fail, requestId } from "../../lib/response";
import { requireAuth, type AuthVariables } from "../../middleware/auth";

import { rateLimit } from "../../lib/redis";
import { shouldUseLectureRag } from "../../lib/ai-scope";

import { loadUserAiOverride } from "../../lib/user-ai-config";
import { aiDailyQuota, aiQuotaMessage, logAiQuotaRejection } from "../../lib/ai-usage";
import { formatAnswer } from "../../lib/ai-citations";

// Shared JavaScript AI provider implementation bundled by Wrangler.
// @ts-expect-error The integration module is plain JavaScript without type declarations.
import { generateAiCompletion } from "../../../../../integrations/cloudflare-api/src/ai-chat.js";
// Корпус «Подготовка к ЦНС» для RAG тьютора (только physiology, вне лекций).

const ai = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
import { MODE_TEMPERATURE, normalizeChatMode, parseOralVerdict, parseAnswerCheck, trackedGeneration, systemPrompt, buildLectureContext, selectAnswerImages } from "./helpers";
import type { ChatMessage, LectureCitation } from "./helpers";
import { buildStudyContext } from "./study-context";

ai.post("/chat", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const rl = await rateLimit(c.env, `ai:chat:${user.id}`, 30, 300);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Лимит AI-запросов исчерпан", 429, rid);
    return c.json(body, status as 429);
  }
  // Суточная квота: минута уже ограничена выше, здесь — расход за день.
  const quota = await aiDailyQuota(c.env, "tutor_chat", user.id);
  if (!quota.allowed) {
    await logAiQuotaRejection(c.env, {
      route: "POST /ai/chat",
      feature: "tutor_chat",
      userId: user.id,
      requestId: rid,
    });
    const { body, status } = fail("AI_DAILY_LIMIT", aiQuotaMessage(quota, "tutor_chat"), 429, rid);
    return c.json(body, status as 429);
  }
  let payload: { messages?: { role?: string; content?: string }[]; model?: string; provider?: string; context_scope?: string; mode?: string; subject_slug?: string } = {};
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    const { body, status } = fail("VALIDATION", "Нужен messages[]", 400, rid);
    return c.json(body, status as 400);
  }
  const mode = normalizeChatMode(payload.mode);
  const temperature = MODE_TEMPERATURE[mode];
  const subjectSlug = payload.subject_slug ? String(payload.subject_slug).slice(0, 80) : null;
  const chatMessages: ChatMessage[] = payload.messages.slice(-40).map((message) => ({
    role: message.role === "assistant" || message.role === "system" ? message.role : "user",
    content: String(message.content || "").slice(0, 12000),
  }));
  // Ровно один system-блок: провайдер получает только первый system-message,
  // поэтому учебный срез и материалы курса склеиваются в один текст.
  const systemSections: string[] = [systemPrompt(subjectSlug)];
  // Режим «study»: ассистент /study получает срез учебного состояния студента
  // как system-контекст. Срез собирается на каждый запрос и в историю не пишется.
  if (payload.context_scope === "study") {
    try {
      const snapshot = await buildStudyContext(c.get("supabase"), user.id);
      if (snapshot) {
        systemSections.push(
          "Ты — учебный ассистент студента. Ниже — актуальный срез его учебного состояния"
            + " (расписание, темы из планов предметов, ДЗ, слабые темы, очереди повторения). Используй его"
            + " для конкретных советов: что делать сегодня, к чему готовиться и в каком порядке."
            + " Посещение пары само собой — в планах нужны подготовительные действия: тема лекции"
            + " из плана предмета, ДЗ с описанием, повторение перед коллоквиумом или контрольной."
            + " Не выдумывай события, которых нет в данных.\n\n=== УЧЕБНЫЙ КОНТЕКСТ ===\n" + snapshot,
        );
      }
    } catch (contextError) {
      console.error("[ai:study-context]", contextError instanceof Error ? contextError.message : String(contextError));
    }
  }
  // RAG только для предметного вопроса в точном режиме: без subject_slug
  // материалы не подмешиваются, а служебный срез /study идёт без них всегда.
  let citations: LectureCitation[] = [];
  const lastQuestion = [...chatMessages].reverse().find((message) => message.role === "user")?.content || "";
  if (shouldUseLectureRag({ mode, subjectSlug, contextScope: payload.context_scope })) {
    const rag = await buildLectureContext(c.get("supabase"), subjectSlug, lastQuestion);
    if (rag.block) systemSections.push(rag.block);
    citations = rag.citations;
  }
  // Фото к ответу: реальные микропрепараты и электронограммы курса. Модель их
  // не рисует — она получает список названий и ссылается на настоящие снимки.
  // Подбор строгий: без совпадения названия препарата картинок нет.
  const answerImages = payload.context_scope === "study"
    ? []
    : await selectAnswerImages(c.get("supabase"), subjectSlug, lastQuestion);
  if (answerImages.length) {
    systemSections.push(
      "К ответу будут приложены изображения курса: "
        + answerImages.map((image, index) => `(${index + 1}) «${image.title}»`).join(", ")
        + ". Если они относятся к вопросу, сошлись на них по названию и объясни, что смотреть;"
        + " не описывай того, чего на снимке нет.",
    );
  }
  const messages: ChatMessage[] = [
    { role: "system", content: systemSections.join("\n\n") },
    ...chatMessages.filter((message) => message.role !== "system"),
  ];
  try {
    const userOverride = await loadUserAiOverride(c.env, c.get("supabase"), user.id);
    const chatRequested = payload.provider === "custom" || (!payload.provider && (userOverride as any)?.preferOwn)
      ? "custom"
      : payload.provider;
    const result = await trackedGeneration(c.env, messages, chatRequested, temperature, {
      route: "POST /ai/chat",
      feature: "tutor_chat",
      userId: user.id,
      subjectSlug,
      requestId: rid,
      metadata: { mode, context_scope: payload.context_scope ?? null },
    }, userOverride ?? undefined);
    // Явно запрошенный провайдер мог отказать: клиент должен видеть, что ответ
    // пришёл от другого, а не считать, что Mistral/GigaChat работает.
    const requested = String(payload.provider || "").trim().toLowerCase();
    const fellBackFrom = requested && requested !== "auto" && result.provider !== requested ? requested : null;
    return c.json(ok({
      message: { role: "assistant", content: formatAnswer(result.text, citations) },
      provider: result.provider,
      model: result.model,
      ...(fellBackFrom ? { fallback_from: fellBackFrom } : {}),
      mode,
      sources: citations,
      ...(answerImages.length ? { images: answerImages } : {}),
    }, rid));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    const reportedStatus = Number((error as any)?.status);
    const status = reportedStatus === 429 || reportedStatus === 503 ? reportedStatus
      : reason === "no_provider_configured" || reason === "requested_provider_not_configured" ? 503 : 502;
    const { body, status: responseStatus } = fail(String((error as any)?.code || (status === 503 ? "AI_NOT_CONFIGURED" : "AI_UPSTREAM")), error instanceof Error ? error.message : status === 503 ? "Не настроен доступный AI-провайдер" : "AI-провайдеры временно недоступны", status, rid);
    return c.json(body, responseStatus as 502 | 503);
  }
});

/**
 * Оценка устного ответа студента (roadmap 2.8): текст ответа (расшифровка речи
 * или набранный вручную) сравнивается с эталоном банка по критериям полноты,
 * точности и владения терминами. Ответ — строго JSON, чтобы фронт не парсил прозу.
 */
ai.post("/oral-evaluate", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const rl = await rateLimit(c.env, `ai:oral:${user.id}`, 20, 300);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много оценок подряд. Подождите пару минут.", 429, rid);
    return c.json(body, status as 429);
  }
  let payload: { question?: string; reference?: string; answer?: string } = {};
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const question = String(payload.question || "").slice(0, 800).trim();
  const reference = String(payload.reference || "").slice(0, 6000).trim();
  const answer = String(payload.answer || "").slice(0, 6000).trim();
  if (!question || !answer) {
    const { body, status } = fail("VALIDATION", "Нужны question и answer", 400, rid);
    return c.json(body, status as 400);
  }
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "Ты — строгий, но доброжелательный экзаменатор медицинского вуза.",
        "Студент ответил вслух (текст — расшифровка речи, возможны оговорки распознавания).",
        "Сравни ответ с эталоном и оцени: полнота, точность фактов, владение терминами.",
        "Не требуй дословного совпадения с эталоном: оценивай смысл, не форму.",
        "Оговорки распознавания речи (пропуски знаков, похожие слова) не снижают балл, если смысл ясен.",
        "Ответь СТРОГО в формате JSON без markdown-обёртки:",
        '{"score":0,"verdict":"…","missed":["пункт 1","пункт 2"],"mistakes":["…"],"follow_up":"уточняющий вопрос"}',
        'score — целое 0-10; verdict — одной фразой «Принято»/«Почти»/«Не принято» с кратким обоснованием;',
        'missed — важное из эталона, чего нет в ответе (пустой массив если всё названо);',
        'mistakes — фактические ошибки ответа; follow_up — уточняющий вопрос экзаменатора.',
        reference ? "\n=== ЭТАЛОН ===\n" + reference : "\n(Эталона нет: оценивай ответ сам по медицинским знаниям.)",
      ].join("\n"),
    },
    { role: "user", content: "Вопрос билета: " + question + "\n\nОтвет студента: " + answer },
  ];
  try {
    const result = await trackedGeneration(c.env, messages, "auto", 0.2, {
      route: "POST /ai/oral-evaluate",
      feature: "oral_exam",
      userId: user.id,
      requestId: rid,
    });
    const parsed = parseOralVerdict(result.text);
    if (!parsed) {
      const { body, status } = fail("AI_MALFORMED", "Экзаменатор вернул ответ не в том формате — попробуйте ещё раз", 502, rid);
      return c.json(body, status as 502);
    }
    return c.json(ok({ ...parsed, provider: result.provider, model: result.model }, rid));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    const reportedStatus = Number((error as any)?.status);
    const status = reportedStatus === 429 || reportedStatus === 503 ? reportedStatus
      : reason === "no_provider_configured" || reason === "requested_provider_not_configured" ? 503 : 502;
    const { body, status: responseStatus } = fail(String((error as any)?.code || (status === 503 ? "AI_NOT_CONFIGURED" : "AI_UPSTREAM")), error instanceof Error ? error.message : "ИИ-провайдеры временно недоступны", status, rid);
    return c.json(body, responseStatus as 502 | 503);
  }
});

/**
 * Второе мнение по тестовому вопросу (арбитр). Маленькая модель получает
 * только вопрос, ключ и выбор студента и отвечает строгим JSON. Смысл — не
 * переписать разбор, а дать независимый вердикт: если он расходится с
 * разбором, студент видит предупреждение, а не уверенное «ваш ответ вернее».
 *
 * Учёт — в общей фиче tutor_chat: отдельной строки в журнале ИИ нет, зато
 * суточная квота и статистика остаются в одной колонке без миграции.
 */
ai.post("/check-answer", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const rl = await rateLimit(c.env, `ai:check:${user.id}`, 40, 300);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много проверок подряд. Подождите пару минут.", 429, rid);
    return c.json(body, status as 429);
  }
  let payload: { question?: string; key?: string; chosen?: string; options?: unknown } = {};
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const question = String(payload.question || "").slice(0, 2000).trim();
  const key = String(payload.key || "").slice(0, 500).trim();
  const chosen = String(payload.chosen || "").slice(0, 500).trim();
  if (!question || !key || !chosen) {
    const { body, status } = fail("VALIDATION", "Нужны question, key и chosen", 400, rid);
    return c.json(body, status as 400);
  }
  const options = (Array.isArray(payload.options) ? payload.options : [])
    .map((option) => String(option || "").slice(0, 300)).filter(Boolean).slice(0, 8);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "Ты — независимый арбитр тестового вопроса по медицине.",
        "Тебе дают вопрос, ответ из ключа и ответ студента. Определи, какой вариант фактически верен",
        "по медицинским знаниям: не подстраивайся под ключ и не защищай студента.",
        "Если верного варианта нет ни в ключе, ни у студента — это вердикт both.",
        "Ответь СТРОГО в формате JSON без markdown-обёртки:",
        '{"correct":"вариант, который верен по механизму","verdict":"key|user|both","why":"одна фраза обоснования"}',
        "verdict: key — верен ключ; user — прав студент, а ключ ошибается; both — оба неверны.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "Вопрос: " + question,
        options.length ? "Варианты:\n" + options.map((option, index) => `${String.fromCharCode(65 + index)}) ${option}`).join("\n") : "",
        "Ответ в ключе: " + key,
        "Ответ студента: " + chosen,
      ].filter(Boolean).join("\n\n"),
    },
  ];
  try {
    const result = await trackedGeneration(c.env, messages, "auto", 0.1, {
      route: "POST /ai/check-answer",
      feature: "tutor_chat",
      userId: user.id,
      requestId: rid,
    });
    const parsed = parseAnswerCheck(result.text);
    if (!parsed) {
      const { body, status } = fail("AI_MALFORMED", "Арбитр вернул ответ не в том формате", 502, rid);
      return c.json(body, status as 502);
    }
    return c.json(ok({ ...parsed, provider: result.provider, model: result.model }, rid));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    const reportedStatus = Number((error as any)?.status);
    const status = reportedStatus === 429 || reportedStatus === 503 ? reportedStatus
      : reason === "no_provider_configured" || reason === "requested_provider_not_configured" ? 503 : 502;
    const { body, status: responseStatus } = fail(String((error as any)?.code || (status === 503 ? "AI_NOT_CONFIGURED" : "AI_UPSTREAM")), error instanceof Error ? error.message : status === 503 ? "Не настроен доступный AI-провайдер" : "AI-провайдеры временно недоступны", status, rid);
    return c.json(body, responseStatus as 502 | 503);
  }
});

export default ai;
