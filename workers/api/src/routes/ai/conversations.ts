/** Диалоги тьютора: список, создание, чтение, удаление и ход ответа. */
import { Hono } from "hono";

import type { Env } from "../../env";
import { ok, fail, requestId } from "../../lib/response";
import { requireAuth, type AuthVariables } from "../../middleware/auth";
import { logActivity } from "../../lib/activity";
import { rateLimit, getRedis } from "../../lib/redis";
import { shouldUseLectureRag } from "../../lib/ai-scope";

import { loadUserAiOverride } from "../../lib/user-ai-config";
import { aiDailyQuota, aiQuotaMessage, logAiQuotaRejection } from "../../lib/ai-usage";
import { formatAnswer } from "../../lib/ai-citations";

// Shared JavaScript AI provider implementation bundled by Wrangler.
// @ts-expect-error The integration module is plain JavaScript without type declarations.
import { resolveProviderModel } from "../../../../../integrations/cloudflare-api/src/ai-chat.js";
// Корпус «Подготовка к ЦНС» для RAG тьютора (только physiology, вне лекций).

const ai = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
import { MODE_TEMPERATURE, normalizeChatMode, trackedGeneration, normalizeConversationProvider, systemPrompt, buildLectureContext, readProviderProbes } from "./helpers";
import type { ChatMessage, ProviderResult, LectureCitation } from "./helpers";

ai.get("/conversations", requireAuth, async (c) => {
  const { data, error } = await c.get("supabase")
    .from("ai_conversations")
    .select("id,title,provider,model,subject_slug,created_at,updated_at")
    .eq("user_id", c.get("user").id)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[ai:list-conversations]", error.message);
    const { body, status } = fail("AI_DB_UNAVAILABLE", "Не удалось загрузить историю AI-чатов", 503, requestId());
    return c.json(body, status as 503);
  }
  return c.json(ok({ items: data || [] }, requestId()));
});

/**
 * Валидация выбранной студентом модели: живой список из кэша Redis
 * (ai:models:<id>, пишет /ai/providers), затем статический список провайдера.
 * Модель вне обоих списков → null (остаётся env-дефолт провайдера).
 */
async function validateConversationModel(c: any, providerId: string, requested: unknown): Promise<string | null> {
  if (!requested) return null;
  try {
    const redis = await getRedis(c.env);
    const cached = redis ? await redis.get(`ai:models:${providerId}`) : null;
    if (cached) {
      const parsed = JSON.parse(String(cached));
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.includes(String(requested)) ? String(requested) : null;
      }
    }
  } catch { /* без кэша — статика */ }
  return resolveProviderModel(c.env, providerId, requested);
}

ai.post("/conversations", requireAuth, async (c) => {
  const rid = requestId();
  let payload: { title?: string; provider?: string; model?: string; subject_slug?: string | null } = {};
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const title = String(payload.title || "Новый чат").replace(/\s+/g, " ").trim().slice(0, 80) || "Новый чат";
  const provider = normalizeConversationProvider(payload.provider);
  // Выбор модели сохраняем только для конкретного провайдера и только из его
  // списка (или настроенной на воркере модели) — иначе env-дефолт.
  const requestedModel = provider !== "auto" && provider !== "custom"
    ? await validateConversationModel(c, provider, payload.model)
    : null;
  const { data, error } = await c.get("supabase")
    .from("ai_conversations")
    .insert({
      user_id: c.get("user").id,
      title,
      provider,
      ...(requestedModel ? { model: requestedModel } : {}),
      subject_slug: payload.subject_slug || null,
    })
    .select("id,title,provider,model,subject_slug,created_at,updated_at")
    .single();
  if (error || !data) {
    console.error("[ai:create-conversation]", error?.message);
    const { body, status } = fail("AI_DB_UNAVAILABLE", "Не удалось создать AI-чат", 503, rid);
    return c.json(body, status as 503);
  }
  return c.json(ok({ conversation: data }, rid), 201);
});

ai.get("/conversations/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const { data: conversation, error } = await supabase
    .from("ai_conversations")
    .select("id,title,provider,model,subject_slug,metadata,created_at,updated_at")
    .eq("id", c.req.param("id"))
    .eq("user_id", c.get("user").id)
    .maybeSingle();
  if (error || !conversation) {
    const { body, status } = fail("NOT_FOUND", "AI-чат не найден", 404, rid);
    return c.json(body, status as 404);
  }
  const { data: messages, error: messageError } = await supabase
    .from("ai_messages")
    .select("id,role,content,provider,model,metadata,created_at")
    .eq("conversation_id", conversation.id)
    .eq("user_id", c.get("user").id)
    .order("created_at", { ascending: true });
  if (messageError) {
    const { body, status } = fail("AI_DB_UNAVAILABLE", "Не удалось загрузить сообщения", 503, rid);
    return c.json(body, status as 503);
  }
  return c.json(ok({ conversation, messages: messages || [] }, rid));
});

ai.delete("/conversations/:id", requireAuth, async (c) => {
  const rid = requestId();
  const { error } = await c.get("supabase")
    .from("ai_conversations")
    .delete()
    .eq("id", c.req.param("id"))
    .eq("user_id", c.get("user").id);
  if (error) {
    const { body, status } = fail("AI_DB_UNAVAILABLE", "Не удалось удалить AI-чат", 503, rid);
    return c.json(body, status as 503);
  }
  return c.json(ok({ deleted: true }, rid));
});

ai.post("/conversations/:id/messages", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const rl = await rateLimit(c.env, `ai:chat:${user.id}`, 30, 300);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много запросов к AI. Подождите несколько минут.", 429, rid);
    return c.json(body, status as 429);
  }
  // Минутный лимит выше сдерживает всплеск, суточный — общий расход на студента.
  const quota = await aiDailyQuota(c.env, "tutor_chat", user.id);
  if (!quota.allowed) {
    await logAiQuotaRejection(c.env, {
      route: "POST /ai/conversations/:id/messages",
      feature: "tutor_chat",
      userId: user.id,
      requestId: rid,
    });
    const { body, status } = fail("AI_DAILY_LIMIT", aiQuotaMessage(quota, "tutor_chat"), 429, rid);
    return c.json(body, status as 429);
  }

  let payload: { content?: string; provider?: string; model?: string; subject_slug?: string; mode?: string; images?: string[] } = {};
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const content = String(payload.content || "").trim();
  if (!content) {
    const { body, status } = fail("VALIDATION", "Сообщение не может быть пустым", 422, rid);
    return c.json(body, status as 422);
  }
  if (content.length > 12000) {
    const { body, status } = fail("VALIDATION", "Сообщение слишком длинное", 422, rid);
    return c.json(body, status as 422);
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("ai_conversations")
    .select("id,title,provider,subject_slug")
    .eq("id", c.req.param("id"))
    .eq("user_id", user.id)
    .maybeSingle();
  if (conversationError || !conversation) {
    const { body, status } = fail("NOT_FOUND", "AI-чат не найден", 404, rid);
    return c.json(body, status as 404);
  }

  const { data: history, error: historyError } = await supabase
    .from("ai_messages")
    .select("role,content")
    .eq("conversation_id", conversation.id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(40);
  if (historyError) {
    const { body, status } = fail("AI_DB_UNAVAILABLE", "Не удалось загрузить контекст чата", 503, rid);
    return c.json(body, status as 503);
  }

  // FA9/Фаза 2: фрагменты лекций курса в контекст — до сборки messages.
  // «Быстрый» режим идёт без RAG и с более свободной температурой.
  const mode = normalizeChatMode(payload.mode);
  const temperature = MODE_TEMPERATURE[mode];
  const conversationSubject = payload.subject_slug || conversation.subject_slug;
  const rag = shouldUseLectureRag({ mode, subjectSlug: conversationSubject })
    ? await buildLectureContext(supabase, conversationSubject, content)
    : { block: "", sources: [] as string[], citations: [] as LectureCitation[] };

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(payload.subject_slug || conversation.subject_slug) + rag.block },
    ...(history || []).reverse().filter((item) => item.role === "user" || item.role === "assistant")
      .map((item) => ({ role: item.role as "user" | "assistant", content: String(item.content || "") })),
    { role: "user", content },
  ];

  let generated: ProviderResult;
  try {
    // BYOM: конфиг пользователя подставляется, когда выбран «custom» или
    // включён приоритет своей модели; при отказе — платформенные провайдеры.
    const userOverride = await loadUserAiOverride(c.env, supabase, user.id);
    const requestedProvider = payload.provider === "custom"
      ? "custom"
      : normalizeConversationProvider(payload.provider || conversation.provider);
    const effectiveProvider = requestedProvider === "auto" && userOverride?.preferOwn ? "custom" : requestedProvider;
    // Выбранная студентом модель валидна только внутри списка своего провайдера.
    const requestedModel = effectiveProvider !== "auto" && effectiveProvider !== "custom"
      ? await validateConversationModel(c, effectiveProvider, payload.model)
      : null;
    // Фото (vision): data URL'ы до 4 МБ, максимум 4 на сообщение; видят
    // gemini/openai/groq/openrouter и BYOM — gigachat честно отклоняем.
    const VISION_PROVIDERS = new Set(["gemini", "openai", "groq", "openrouter", "custom"]);
    const rawImages = Array.isArray(payload.images) ? payload.images : [];
    const validImages = rawImages
      .filter((x) => typeof x === "string" && /^data:image\/[a-z0-9.+-]+;base64,/.test(x.slice(0, 64)) && x.length <= 5_600_000)
      .slice(0, 4);
    if (validImages.length && !VISION_PROVIDERS.has(effectiveProvider)) {
      const { body, status } = fail("NO_VISION", "Эта модель не видит картинки — переключитесь на Gemini, GPT или Свою модель", 422, rid);
      return c.json(body, status as 422);
    }
    // Провайдеры с недавними отказами (пробы) уходят в конец цепочки: auto
    // не должен ждать 403/429 заведомо больных upstream'ов.
    const unhealthy = Object.entries(await readProviderProbes(c.env))
      .filter(([, probe]) => probe && !probe.ok)
      .map(([id]) => id);
    generated = await trackedGeneration(
      c.env,
      messages,
      effectiveProvider,
      temperature,
      {
        route: "POST /ai/conversations/:id/messages",
        feature: "tutor_chat",
        userId: user.id,
        subjectSlug: conversationSubject,
        requestId: rid,
        metadata: { mode },
      },
      userOverride ?? undefined,
      requestedModel ?? undefined,
      unhealthy,
      validImages,
    );
    // Модель не поставила сносок — гарантируем их сами (см. lib/ai-citations.ts).
    generated = { ...generated, text: formatAnswer(generated.text, rag.citations) };
    // Успешный ответ подтверждает модель: добавляем её в живой список
    // провайдера (кэш ai:models:<id>), чтобы выбор модели у всех был актуальным.
    try {
      if (generated.provider && generated.model && !String(generated.model).startsWith("@cf/")) {
        const redis = await getRedis(c.env);
        const key = `ai:models:${generated.provider}`;
        const cached = redis ? await redis.get(key) : null;
        const list = cached ? JSON.parse(String(cached)) : [];
        if (Array.isArray(list) && !list.includes(String(generated.model))) {
          list.push(String(generated.model));
          if (redis) await redis.set(key, JSON.stringify(list.slice(-40)), { ex: 6 * 3600 });
        }
      }
    } catch { /* кэш моделей — украшение */ }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    console.error("[ai:message-generation]", { reason });
    const reportedStatus = Number((error as any)?.status);
    const status = reportedStatus === 429 || reportedStatus === 503 ? reportedStatus
      : reason === "no_provider_configured" || reason === "requested_provider_not_configured" ? 503 : 502;
    const { body, status: responseStatus } = fail(
      String((error as any)?.code || (status === 503 ? "AI_NOT_CONFIGURED" : "AI_UPSTREAM")),
      error instanceof Error ? error.message : status === 503 ? "Не настроен доступный AI-провайдер" : "AI-провайдеры временно недоступны",
      status,
      rid
    );
    return c.json(body, responseStatus as 502 | 503);
  }

  const { data: userMessage, error: userInsertError } = await supabase
    .from("ai_messages")
    .insert({ conversation_id: conversation.id, user_id: user.id, role: "user", content })
    .select("id,role,content,created_at")
    .single();
  if (userInsertError || !userMessage) {
    console.error("[ai:save-user-message]", userInsertError?.message);
    const { body, status } = fail("AI_DB_UNAVAILABLE", "Ответ получен, но сообщение не удалось сохранить", 503, rid);
    return c.json(body, status as 503);
  }

  const { data: assistantMessage, error: assistantInsertError } = await supabase
    .from("ai_messages")
    .insert({
      conversation_id: conversation.id,
      user_id: user.id,
      role: "assistant",
      content: generated.text,
      provider: generated.provider,
      model: generated.model,
      metadata: {
        mode: "api",
        answer_mode: mode,
        ...(rag.citations.length ? { sources: rag.citations } : {}),
      },
    })
    .select("id,role,content,provider,model,metadata,created_at")
    .single();
  if (assistantInsertError || !assistantMessage) {
    console.error("[ai:save-assistant-message]", assistantInsertError?.message);
    const { body, status } = fail("AI_DB_UNAVAILABLE", "Не удалось сохранить ответ AI", 503, rid);
    return c.json(body, status as 503);
  }

  // Фаза 5: вопрос тьютора — событие ленты (сбой записи не ломает ответ).
  await logActivity(c.env, {
    userId: user.id,
    kind: "tutor_message",
    subjectSlug: payload.subject_slug || conversation.subject_slug,
    refId: conversation.id,
    payload: { mode, provider: generated.provider },
  });

  const title = conversation.title === "Новый чат"
    ? content.replace(/\s+/g, " ").trim().slice(0, 80)
    : conversation.title;
  // Провайдер чата обновляется выбранным в сообщении (после расширения CHECK
  // он сохраняется честно, без сброса на «Авто»), модель — фактически ответившей.
  await supabase.from("ai_conversations").update({
    title,
    provider: normalizeConversationProvider(payload.provider || conversation.provider),
    model: generated.model,
    subject_slug: payload.subject_slug || conversation.subject_slug,
    updated_at: new Date().toISOString(),
  }).eq("id", conversation.id).eq("user_id", user.id);

  return c.json(ok({
    conversation: { ...conversation, title, model: generated.model },
    user_message: userMessage,
    assistant_message: assistantMessage,
  }, rid));
});

export default ai;
