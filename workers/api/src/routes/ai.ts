import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { rateLimit } from "../lib/redis";

const ai = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type ProviderResult = { text: string; provider: string; model: string };

function configuredProviders(env: Env): string[] {
  const preferred = (env.AI_CHAT_PRIMARY_PROVIDER || "auto").toLowerCase();
  const order = ["groq", "openrouter", "mistral", "gemini", "openai"];
  const keys: Record<string, string | undefined> = {
    groq: env.GROQ_API_KEY,
    openrouter: env.OPENROUTER_API_KEY,
    mistral: env.MISTRAL_API_KEY,
    gemini: env.GEMINI_API_KEY,
    openai: env.OPENAI_API_KEY,
  };
  const available = order.filter((name) => Boolean(keys[name]?.trim()));
  if (preferred !== "auto" && keys[preferred]?.trim()) {
    return [preferred, ...available.filter((name) => name !== preferred)];
  }
  return available;
}

function providerModel(env: Env, provider: string): string {
  if (provider === "groq") return env.GROQ_MODEL || "llama-3.3-70b-versatile";
  if (provider === "openrouter") return env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  if (provider === "mistral") return env.MISTRAL_MODEL || "mistral-small-latest";
  if (provider === "gemini") return env.GEMINI_MODEL || "gemini-2.5-flash";
  return env.OPENAI_MODEL || "gpt-4o-mini";
}

async function callProvider(env: Env, provider: string, messages: ChatMessage[]): Promise<ProviderResult> {
  const model = providerModel(env, provider);
  if (provider === "gemini") {
    const key = env.GEMINI_API_KEY?.trim();
    if (!key) throw new Error("provider_not_configured");
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const contents = messages.filter((m) => m.role !== "system").map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents,
          generationConfig: { temperature: 0.35, maxOutputTokens: 1200 },
        }),
        signal: AbortSignal.timeout(60000),
      }
    );
    if (!response.ok) throw new Error(`provider_http_${response.status}`);
    const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) throw new Error("provider_empty_response");
    return { text, provider, model };
  }

  const key = provider === "groq" ? env.GROQ_API_KEY?.trim()
    : provider === "openrouter" ? env.OPENROUTER_API_KEY?.trim()
    : provider === "mistral" ? env.MISTRAL_API_KEY?.trim()
    : env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("provider_not_configured");
  const baseUrl = provider === "groq" ? (env.GROQ_BASE_URL || "https://api.groq.com/openai/v1")
    : provider === "openrouter" ? (env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1")
    : provider === "mistral" ? (env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1")
    : "https://api.openai.com/v1";
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(provider === "openrouter" ? { "HTTP-Referer": env.APP_ORIGIN || "https://medbiohim.vercel.app", "X-Title": "MEDBIOHIM" } : {}),
    },
    body: JSON.stringify({ model, messages, temperature: 0.35, max_tokens: 1200 }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  const data = await response.json() as { choices?: { message?: { content?: string | null } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("provider_empty_response");
  return { text, provider, model };
}

async function generate(env: Env, messages: ChatMessage[], requested?: string): Promise<ProviderResult> {
  const available = configuredProviders(env);
  if (!available.length) throw new Error("no_provider_configured");
  const explicit = requested && requested !== "auto" ? requested.toLowerCase() : null;
  const order = explicit ? available.filter((provider) => provider === explicit) : available;
  if (!order.length) throw new Error("requested_provider_not_configured");
  let lastError: unknown;
  for (const provider of order) {
    try {
      return await callProvider(env, provider, messages.slice(-42).map((message) => ({
        role: message.role,
        content: message.content.slice(0, 12000),
      })));
    } catch (error) {
      lastError = error;
      console.warn("[ai:provider-failed]", { provider, reason: error instanceof Error ? error.message : "unknown" });
      if (explicit) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("all_providers_failed");
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
  const env = c.env;
  const providers = [
    { id: "auto", name: "Автоматический выбор", available: configuredProviders(env).length > 0 },
    { id: "groq", name: "Groq", available: Boolean(env.GROQ_API_KEY?.trim()) },
    { id: "openrouter", name: "OpenRouter", available: Boolean(env.OPENROUTER_API_KEY?.trim()) },
    { id: "mistral", name: "Mistral", available: Boolean(env.MISTRAL_API_KEY?.trim()) },
    { id: "gemini", name: "Gemini", available: Boolean(env.GEMINI_API_KEY?.trim()) },
    { id: "openai", name: "OpenAI", available: Boolean(env.OPENAI_API_KEY?.trim()) },
  ];
  return c.json(ok({ providers }, requestId()));
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
    const status = reason === "no_provider_configured" || reason === "requested_provider_not_configured" ? 503 : 502;
    const { body, status: responseStatus } = fail(
      status === 503 ? "AI_NOT_CONFIGURED" : "AI_UPSTREAM",
      status === 503 ? "Не настроен доступный AI-провайдер" : "AI-провайдеры временно недоступны",
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
    const status = reason === "no_provider_configured" || reason === "requested_provider_not_configured" ? 503 : 502;
    const { body, status: responseStatus } = fail(status === 503 ? "AI_NOT_CONFIGURED" : "AI_UPSTREAM", status === 503 ? "Не настроен доступный AI-провайдер" : "AI-провайдеры временно недоступны", status, rid);
    return c.json(body, responseStatus as 502 | 503);
  }
});

export default ai;
