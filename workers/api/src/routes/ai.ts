import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { rateLimit } from "../lib/redis";
// @ts-ignore Shared JavaScript AI provider implementation bundled by Wrangler.
import { generateAiCompletion, getAiProviderStatus } from "../../../../integrations/cloudflare-api/src/ai-chat.js";

const ai = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type ProviderResult = { text: string; provider: string; model: string };

async function generate(env: Env, messages: ChatMessage[], requested?: string): Promise<ProviderResult> {
  const system = messages.find((message) => message.role === "system");
  const context = [...(system ? [system] : []), ...messages.filter((message) => message.role !== "system").slice(-23)];
  const result = await generateAiCompletion(env, context.map((message) => ({
    role: message.role,
    content: message.content.slice(0, 12000),
  })), requested || "auto");
  return { text: result.content, provider: result.provider, model: result.model };
}

function normalizeConversationProvider(value: unknown): "auto" | "gemini" | "gigachat" {
  // Current Supabase migration constrains ai_conversations.provider to these values.
  return value === "gemini" || value === "gigachat" ? value : "auto";
}

function systemPrompt(subjectSlug?: string | null): string {
  return "Ты — AI-тьютор платформы «Медбиохим». Отвечай по-русски, понятно студенту медицинского вуза. Объясняй последовательно, не выдумывай факты. Если вопрос учебный — выделяй ключевые понятия, механизм и короткий вывод."
    + (subjectSlug ? ` Текущий предмет: ${subjectSlug}.` : "");
}

ai.get("/providers", requireAuth, async (c) => {
  return c.json(ok(getAiProviderStatus(c.env), requestId()));
});

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

ai.post("/conversations", requireAuth, async (c) => {
  const rid = requestId();
  let payload: { title?: string; provider?: string; subject_slug?: string | null } = {};
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const title = String(payload.title || "Новый чат").replace(/\s+/g, " ").trim().slice(0, 80) || "Новый чат";
  const provider = normalizeConversationProvider(payload.provider);
  const { data, error } = await c.get("supabase")
    .from("ai_conversations")
    .insert({ user_id: c.get("user").id, title, provider, subject_slug: payload.subject_slug || null })
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

  let payload: { content?: string; provider?: string; subject_slug?: string } = {};
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

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(payload.subject_slug || conversation.subject_slug) },
    ...(history || []).reverse().filter((item) => item.role === "user" || item.role === "assistant")
      .map((item) => ({ role: item.role as "user" | "assistant", content: String(item.content || "") })),
    { role: "user", content },
  ];

  let generated: ProviderResult;
  try {
    generated = await generate(c.env, messages, payload.provider || (conversation.provider === "auto" ? undefined : conversation.provider));
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
      metadata: { mode: "api" },
    })
    .select("id,role,content,provider,model,metadata,created_at")
    .single();
  if (assistantInsertError || !assistantMessage) {
    console.error("[ai:save-assistant-message]", assistantInsertError?.message);
    const { body, status } = fail("AI_DB_UNAVAILABLE", "Не удалось сохранить ответ AI", 503, rid);
    return c.json(body, status as 503);
  }

  const title = conversation.title === "Новый чат"
    ? content.replace(/\s+/g, " ").trim().slice(0, 80)
    : conversation.title;
  // Database currently only permits auto/gemini/gigachat for the conversation provider field.
  await supabase.from("ai_conversations").update({
    title,
    provider: normalizeConversationProvider(conversation.provider),
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

// Compatibility endpoint used by lightweight clients.
ai.post("/chat", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const rl = await rateLimit(c.env, `ai:chat:${user.id}`, 30, 300);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Лимит AI-запросов исчерпан", 429, rid);
    return c.json(body, status as 429);
  }
  let payload: { messages?: { role?: string; content?: string }[]; model?: string; provider?: string } = {};
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    const { body, status } = fail("VALIDATION", "Нужен messages[]", 400, rid);
    return c.json(body, status as 400);
  }
  const messages: ChatMessage[] = payload.messages.slice(-40).map((message) => ({
    role: message.role === "assistant" || message.role === "system" ? message.role : "user",
    content: String(message.content || "").slice(0, 12000),
  }));
  try {
    const result = await generate(c.env, messages, payload.provider);
    return c.json(ok({ message: { role: "assistant", content: result.text }, provider: result.provider, model: result.model }, rid));
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
