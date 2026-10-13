/**
 * Authenticated AI-chat metadata and history endpoints.
 * All database REST calls use the caller's JWT (never service_role) so Supabase RLS
 * remains the authority for conversation/message ownership.
 */
const SUPPORTED_PROVIDERS = ["auto", "openai", "groq", "gigachat", "gemini", "mistral", "openrouter"];

export class AiChatApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AiChatApiError";
    this.status = status;
    this.code = code;
  }
}

function cleanTitle(value) {
  const title = String(value ?? "").replace(/\s+/gu, " ").trim();
  return Array.from(title || "Новый чат").slice(0, 80).join("");
}

function normalizeProvider(value) {
  const provider = String(value ?? "auto").trim().toLowerCase();
  return SUPPORTED_PROVIDERS.includes(provider) ? provider : "auto";
}

function validateSubjectSlug(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new AiChatApiError(422, "VALIDATION_ERROR", "Некорректный предмет");
  const slug = value.trim();
  if (!slug) return null;
  if (slug.length > 120 || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
    throw new AiChatApiError(422, "VALIDATION_ERROR", "Некорректный предмет");
  }
  return slug;
}

export function getAiProviderStatus(env = {}) {
  const region = String(env.AI_BACKEND_REGION || "ru").trim().toLowerCase();
  const proxyReady = Boolean(env.GEMINI_VERCEL_PROXY_URL && env.GEMINI_VERCEL_PROXY_SECRET);
  const geminiBlocked = region === "ru" && !proxyReady;
  const providers = {
    openai: {
      configured: Boolean(env.OPENAI_API_KEY),
      model: env.OPENAI_MODEL || "gpt-4.1-mini",
      available: Boolean(env.OPENAI_API_KEY),
      reason: null,
    },
    groq: {
      configured: Boolean(env.GROQ_API_KEY),
      model: env.GROQ_MODEL || "openai/gpt-oss-20b",
      available: Boolean(env.GROQ_API_KEY),
      reason: null,
    },
    gigachat: {
      configured: Boolean(env.GIGACHAT_CREDENTIALS || env.GIGACHAT_ACCESS_TOKEN || env.LLM_PRIMARY_API_KEY),
      model: env.GIGACHAT_MODEL || "GigaChat-2-Max",
      available: Boolean(env.GIGACHAT_CREDENTIALS || env.GIGACHAT_ACCESS_TOKEN || env.LLM_PRIMARY_API_KEY),
      reason: null,
    },
    gemini: {
      configured: Boolean(env.GEMINI_API_KEY),
      model: env.GEMINI_MODEL || "gemini-3.6-flash",
      available: Boolean(env.GEMINI_API_KEY) && !geminiBlocked,
      reason: geminiBlocked
        ? "Gemini недоступен из региона backend (RU) без настроенного регионального прокси."
        : null,
    },
    mistral: {
      configured: Boolean(env.MISTRAL_API_KEY),
      model: env.MISTRAL_MODEL || "mistral-small-latest",
      available: Boolean(env.MISTRAL_API_KEY),
      reason: null,
    },
    openrouter: {
      configured: Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL),
      model: env.OPENROUTER_MODEL || "",
      available: Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL),
      reason: null,
    },
  };
  const configuredDefault = String(env.AI_CHAT_PRIMARY_PROVIDER || "groq").trim().toLowerCase();
  const defaultProvider = ["auto", ...Object.keys(providers)].includes(configuredDefault) ? configuredDefault : "auto";
  return { region, providers, default: defaultProvider };
}

function requireCaller(request, env, userId) {
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    throw new AiChatApiError(401, "UNAUTHORIZED", "Authentication required");
  }
  if (!userId || typeof userId !== "string") {
    throw new AiChatApiError(401, "UNAUTHORIZED", "Authentication required");
  }
  const key = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(String(env.SUPABASE_URL || ""));
  } catch {
    throw new AiChatApiError(503, "AI_DATA_UNAVAILABLE", "ИИ-сервис временно недоступен");
  }
  if (base.protocol !== "https:" || !base.hostname.endsWith(".supabase.co") || !key) {
    throw new AiChatApiError(503, "AI_DATA_UNAVAILABLE", "ИИ-сервис временно недоступен");
  }
  return { authorization, key, origin: base.origin };
}

async function rest(request, env, userId, table, params, options = {}, fetcher = fetch) {
  const caller = requireCaller(request, env, userId);
  const url = new URL(`/rest/v1/${table}`, caller.origin);
  url.search = params.toString();
  const headers = new Headers({
    apikey: caller.key,
    authorization: caller.authorization,
    accept: "application/json",
  });
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.prefer) headers.set("prefer", options.prefer);
  let response;
  try {
    response = await fetcher(url, {
      method: options.method || "GET",
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(7000),
    });
  } catch {
    throw new AiChatApiError(503, "AI_DATA_UNAVAILABLE", "ИИ-сервис временно недоступен");
  }
  if (response.status >= 300 && response.status < 400) {
    throw new AiChatApiError(503, "AI_DATA_UNAVAILABLE", "ИИ-сервис временно недоступен");
  }
  if (response.status === 401) {
    throw new AiChatApiError(401, "UNAUTHORIZED", "Authentication required");
  }
  if (response.status === 404 && options.allowNotFound) return [];
  if (!response.ok) {
    // Never return PostgREST error bodies: they can contain schema or private data.
    throw new AiChatApiError(503, "AI_DATA_UNAVAILABLE", "ИИ-сервис временно недоступен");
  }
  if (response.status === 204) return [];
  try {
    const value = await response.json();
    return Array.isArray(value) ? value : value && typeof value === "object" ? value : [];
  } catch {
    throw new AiChatApiError(503, "AI_DATA_UNAVAILABLE", "ИИ-сервис временно недоступен");
  }
}

function uuidOr404(value) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new AiChatApiError(404, "NOT_FOUND", "Ресурс ИИ-сервиса недоступен");
  }
  return id;
}

export async function listAiConversations(request, env, userId, fetcher = fetch) {
  const params = new URLSearchParams({
    select: "id,title,provider,model,subject_slug,created_at,updated_at",
    user_id: `eq.${userId}`,
    order: "updated_at.desc",
    limit: "100",
  });
  const items = await rest(request, env, userId, "ai_conversations", params, {}, fetcher);
  return { items: Array.isArray(items) ? items : [] };
}

export async function createAiConversation(request, env, userId, payload = {}, fetcher = fetch) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AiChatApiError(422, "VALIDATION_ERROR", "Некорректное тело запроса");
  }
  if (payload.title !== undefined && payload.title !== null && typeof payload.title !== "string") {
    throw new AiChatApiError(422, "VALIDATION_ERROR", "Некорректное название чата");
  }
  if (payload.provider !== undefined && payload.provider !== null && typeof payload.provider !== "string") {
    throw new AiChatApiError(422, "VALIDATION_ERROR", "Некорректный AI-провайдер");
  }
  const subjectSlug = validateSubjectSlug(payload.subject_slug);
  const row = {
    user_id: userId,
    title: cleanTitle(payload.title),
    provider: normalizeProvider(payload.provider),
    subject_slug: subjectSlug,
  };
  const params = new URLSearchParams({
    select: "id,title,provider,model,subject_slug,created_at,updated_at",
  });
  const rows = await rest(request, env, userId, "ai_conversations", params, {
    method: "POST",
    body: row,
    prefer: "return=representation",
  }, fetcher);
  if (!Array.isArray(rows) || !rows[0] || typeof rows[0].id !== "string") {
    throw new AiChatApiError(503, "AI_DATA_UNAVAILABLE", "ИИ-сервис временно недоступен");
  }
  return { conversation: rows[0] };
}

export async function getAiConversation(request, env, userId, conversationId, fetcher = fetch) {
  const id = uuidOr404(conversationId);
  const conversationParams = new URLSearchParams({
    select: "id,title,provider,model,subject_slug,metadata,created_at,updated_at",
    id: `eq.${id}`,
    user_id: `eq.${userId}`,
    limit: "1",
  });
  const conversations = await rest(request, env, userId, "ai_conversations", conversationParams, {}, fetcher);
  const conversation = Array.isArray(conversations) ? conversations[0] : null;
  if (!conversation) throw new AiChatApiError(404, "NOT_FOUND", "Ресурс ИИ-сервиса недоступен");

  const messageParams = new URLSearchParams({
    select: "id,role,content,provider,model,metadata,created_at",
    conversation_id: `eq.${id}`,
    user_id: `eq.${userId}`,
    order: "created_at.asc",
    limit: "1000",
  });
  const messages = await rest(request, env, userId, "ai_messages", messageParams, {}, fetcher);
  return { conversation, messages: Array.isArray(messages) ? messages : [] };
}

export async function deleteAiConversation(request, env, userId, conversationId, fetcher = fetch) {
  const id = uuidOr404(conversationId);
  const params = new URLSearchParams({
    id: `eq.${id}`,
    user_id: `eq.${userId}`,
  });
  await rest(request, env, userId, "ai_conversations", params, {
    method: "DELETE",
    prefer: "return=minimal",
  }, fetcher);
  return { deleted: true };
}


function getAiCompletionCandidates(env, preferredProvider) {
  const preferred = String(preferredProvider || "auto").trim().toLowerCase();
  const region = String(env.AI_BACKEND_REGION || "ru").trim().toLowerCase();
  const geminiProxyReady = Boolean(env.GEMINI_VERCEL_PROXY_URL && env.GEMINI_VERCEL_PROXY_SECRET);
  const candidates = [];
  const add = (id, key, base, model) => {
    const secret = String(key || "").trim();
    if (secret) candidates.push({ id, key: secret, base, model });
  };
  add("openai", env.OPENAI_API_KEY, "https://api.openai.com/v1", env.OPENAI_MODEL || "gpt-4.1-mini");
  add("groq", env.GROQ_API_KEY, "https://api.groq.com/openai/v1", env.GROQ_MODEL || "openai/gpt-oss-20b");
  add("mistral", env.MISTRAL_API_KEY, "https://api.mistral.ai/v1", env.MISTRAL_MODEL || "mistral-small-latest");
  if (env.OPENROUTER_API_KEY) {
    add("openrouter", env.OPENROUTER_API_KEY, "https://openrouter.ai/api/v1", env.OPENROUTER_MODEL || "openrouter/auto");
  }
  const gigaCredentials = String(env.GIGACHAT_CREDENTIALS || env.GIGACHAT_AUTH_KEY || "").trim();
  const gigaAccessToken = String(env.GIGACHAT_ACCESS_TOKEN || "").trim();
  if (gigaCredentials || gigaAccessToken) {
    candidates.push({
      id: "gigachat",
      key: gigaAccessToken || gigaCredentials,
      credentials: gigaCredentials,
      base: "https://gigachat.devices.sberbank.ru/api/v1",
      model: env.GIGACHAT_MODEL || "GigaChat",
      scope: env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS",
    });
  }
  if (env.GEMINI_API_KEY && (region !== "ru" || geminiProxyReady)) {
    candidates.push({
      id: "gemini",
      key: String(env.GEMINI_API_KEY).trim(),
      base: "https://generativelanguage.googleapis.com/v1beta",
      model: env.GEMINI_MODEL || "gemini-2.0-flash",
    });
  }
  const configuredDefault = String(env.AI_CHAT_PRIMARY_PROVIDER || "groq").trim().toLowerCase();
  const first = preferred === "auto" ? configuredDefault : preferred;
  const index = candidates.findIndex((candidate) => candidate.id === first);
  if (index > 0) candidates.unshift(...candidates.splice(index, 1));
  if (preferred !== "auto" && index < 0) return [];
  return candidates;
}
async function callGeminiCompletion(cfg, messages, fetcher) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const contents = messages.filter((message) => message.role === "user" || message.role === "assistant").map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: String(message.content || "") }],
  }));
  const endpoint = cfg.base.replace(/\/$/, "") + "/models/" + encodeURIComponent(cfg.model) + ":generateContent";
  let response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: { "x-goog-api-key": cfg.key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: { temperature: 0.25, maxOutputTokens: 2500 },
      }),
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new AiChatApiError(502, "AI_UPSTREAM_UNAVAILABLE", "ИИ-провайдер временно недоступен");
  }
  let payload = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok) {
    if (response.status === 429) throw new AiChatApiError(429, "AI_RATE_LIMIT", "ИИ-провайдер ограничил частоту запросов");
    throw new AiChatApiError(502, "AI_UPSTREAM_UNAVAILABLE", "ИИ-провайдер временно недоступен");
  }
  const text = (payload?.candidates?.[0]?.content?.parts || []).map((part) => String(part.text || "")).join("").trim();
  if (!text) throw new AiChatApiError(502, "AI_EMPTY_RESPONSE", "ИИ-провайдер вернул пустой ответ");
  return { content: text, provider: cfg.id, model: cfg.model };
}

async function callGigaChatCompletion(cfg, messages, fetcher) {
  let accessToken = String(cfg.key || "").trim();
  if (!String(cfg.credentials || "").trim() && !accessToken) {
    throw new AiChatApiError(503, "AI_PROVIDER_UNAVAILABLE", "GigaChat не настроен");
  }
  if (!String(cfg.credentials || "").trim() && accessToken) {
    // A pre-issued access token can be used directly; credentials are never returned to the caller.
  } else {
    let tokenResponse;
    try {
      tokenResponse = await fetcher("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", {
        method: "POST",
        headers: {
          authorization: "Basic " + String(cfg.credentials).trim(),
          "content-type": "application/x-www-form-urlencoded",
          "RqUID": crypto.randomUUID(),
          accept: "application/json",
        },
        body: new URLSearchParams({ scope: cfg.scope || "GIGACHAT_API_PERS" }),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new AiChatApiError(502, "AI_UPSTREAM_UNAVAILABLE", "GigaChat временно недоступен");
    }
    let tokenPayload = null;
    try { tokenPayload = await tokenResponse.json(); } catch { /* handled below */ }
    if (!tokenResponse.ok || typeof tokenPayload?.access_token !== "string") {
      if (tokenResponse.status === 429) throw new AiChatApiError(429, "AI_RATE_LIMIT", "GigaChat ограничил частоту запросов");
      throw new AiChatApiError(502, "AI_UPSTREAM_UNAVAILABLE", "GigaChat временно недоступен");
    }
    accessToken = tokenPayload.access_token;
  }
  let response;
  try {
    response = await fetcher(cfg.base.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer " + accessToken, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ model: cfg.model, temperature: 0.25, max_tokens: 2500, messages }),
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new AiChatApiError(502, "AI_UPSTREAM_UNAVAILABLE", "GigaChat временно недоступен");
  }
  let payload = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok) {
    if (response.status === 429) throw new AiChatApiError(429, "AI_RATE_LIMIT", "GigaChat ограничил частоту запросов");
    throw new AiChatApiError(502, "AI_UPSTREAM_UNAVAILABLE", "GigaChat временно недоступен");
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new AiChatApiError(502, "AI_EMPTY_RESPONSE", "ИИ-провайдер вернул пустой ответ");
  return { content: text.trim(), provider: cfg.id, model: String(payload?.model || cfg.model) };
}

async function callAiCompletion(cfg, messages, fetcher) {
  if (cfg.id === "gemini") return callGeminiCompletion(cfg, messages, fetcher);
  if (cfg.id === "gigachat") return callGigaChatCompletion(cfg, messages, fetcher);
  const endpoint = cfg.base.replace(/\/$/, "") + "/chat/completions";
  let response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        authorization: "Bearer " + cfg.key,
        "content-type": "application/json",
        accept: "application/json",
        ...(cfg.id === "openrouter" ? { "HTTP-Referer": "https://medbiohim.vercel.app", "X-Title": "Medbiohim" } : {}),
      },
      body: JSON.stringify({ model: cfg.model, temperature: 0.25, max_tokens: 2500, messages }),
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new AiChatApiError(502, "AI_UPSTREAM_UNAVAILABLE", "ИИ-провайдер временно недоступен");
  }
  let payload = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok) {
    if (response.status === 429) throw new AiChatApiError(429, "AI_RATE_LIMIT", "ИИ-провайдер ограничил частоту запросов");
    // Do not expose provider response bodies, keys, or upstream diagnostics.
    throw new AiChatApiError(502, "AI_UPSTREAM_UNAVAILABLE", "ИИ-провайдер временно недоступен");
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new AiChatApiError(502, "AI_EMPTY_RESPONSE", "ИИ-провайдер вернул пустой ответ");
  }
  return { content: text.trim(), provider: cfg.id, model: String(payload?.model || cfg.model) };
}

/**
 * Runs a real provider request. Supabase rows always use the caller JWT and are
 * explicitly scoped to that caller; provider credentials remain server-only.
 */
export async function sendAiMessage(request, env, userId, conversationId, input = {}, fetcher = fetch) {
  if (!userId || typeof userId !== "string") throw new AiChatApiError(401, "UNAUTHORIZED", "Authentication required");
  const id = uuidOr404(conversationId);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AiChatApiError(422, "VALIDATION_ERROR", "Некорректное тело запроса");
  }
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (!content || content.length > 12000) {
    throw new AiChatApiError(422, "VALIDATION_ERROR", "Сообщение должно содержать от 1 до 12000 символов");
  }
  if (env.AI_CHAT_LIMITER && typeof env.AI_CHAT_LIMITER.limit === "function") {
    const limited = await env.AI_CHAT_LIMITER.limit({ key: "ai-chat:" + userId });
    if (!limited?.success) throw new AiChatApiError(429, "RATE_LIMIT", "Слишком много запросов к ИИ. Подождите немного.");
  }

  const conversationParams = new URLSearchParams({
    select: "id,user_id,title,provider,model,subject_slug,created_at,updated_at",
    id: "eq." + id,
    user_id: "eq." + userId,
    limit: "1",
  });
  const conversations = await rest(request, env, userId, "ai_conversations", conversationParams, {}, fetcher);
  const conversation = Array.isArray(conversations) ? conversations[0] : null;
  if (!conversation) throw new AiChatApiError(404, "NOT_FOUND", "Ресурс ИИ-сервиса недоступен");

  const subjectSlug = input.subject_slug === undefined
    ? (conversation.subject_slug || null)
    : validateSubjectSlug(input.subject_slug);
  const requestedProvider = input.provider || conversation.provider || "auto";
  const candidates = getAiCompletionCandidates(env, requestedProvider);
  if (!candidates.length) {
    const status = getAiProviderStatus(env);
    const chosen = String(requestedProvider).toLowerCase();
    const known = status.providers[chosen];
    if (known && !known.available) {
      throw new AiChatApiError(503, "AI_PROVIDER_UNAVAILABLE", known.reason || "Выбранный ИИ-провайдер не настроен");
    }
    throw new AiChatApiError(503, "AI_NOT_CONFIGURED", "Не настроен доступный ИИ-провайдер");
  }

  const userRows = await rest(request, env, userId, "ai_messages", new URLSearchParams({ select: "id,role,content,provider,model,metadata,created_at" }), {
    method: "POST",
    body: {
      conversation_id: id,
      user_id: userId,
      role: "user",
      content,
    },
    prefer: "return=representation",
  }, fetcher);
  const userMessage = Array.isArray(userRows) ? userRows[0] : null;

  const historyParams = new URLSearchParams({
    select: "role,content,created_at",
    conversation_id: "eq." + id,
    user_id: "eq." + userId,
    order: "created_at.desc",
    limit: "40",
  });
  const history = await rest(request, env, userId, "ai_messages", historyParams, {}, fetcher);
  const messages = [{
    role: "system",
    content: "Ты — ИИ-тьютор образовательной платформы «Медбиохим». Отвечай по-русски, понятно студенту медицинского вуза. Объясняй последовательно, различай подтверждённые факты и неопределённость. Для учебных вопросов выделяй ключевые понятия, механизм и краткий вывод. Не выдумывай источники и не подменяй клинические рекомендации.",
  }];
  if (subjectSlug) messages[0].content += " Текущий предмет: " + subjectSlug + ".";
  for (const item of (Array.isArray(history) ? history : []).reverse()) {
    const role = String(item.role || "");
    if ((role === "user" || role === "assistant") && typeof item.content === "string") {
      messages.push({ role, content: item.content.slice(0, 12000) });
    }
  }
  // Some PostgREST deployments may not return the inserted message immediately.
  if (!messages.some((item) => item.role === "user" && item.content === content)) {
    messages.push({ role: "user", content });
  }

  let completion = null;
  let lastProviderError = null;
  for (const candidate of candidates) {
    try {
      completion = await callAiCompletion(candidate, messages, fetcher);
      break;
    } catch (error) {
      lastProviderError = error;
      // Fail over only to other configured providers; never expose upstream errors.
    }
  }
  if (!completion) {
    if (lastProviderError instanceof AiChatApiError) throw lastProviderError;
    throw new AiChatApiError(502, "AI_UPSTREAM_UNAVAILABLE", "ИИ-провайдеры временно недоступны");
  }
  const assistantParams = new URLSearchParams({ select: "id,role,content,provider,model,metadata,created_at" });
  const assistantRows = await rest(request, env, userId, "ai_messages", assistantParams, {
    method: "POST",
    body: {
      conversation_id: id,
      user_id: userId,
      role: "assistant",
      content: completion.content,
      provider: completion.provider,
      model: completion.model,
      metadata: { mode: "api" },
    },
    prefer: "return=representation",
  }, fetcher);
  const title = String(conversation.title || "Новый чат") === "Новый чат"
    ? content.replace(/\s+/gu, " ").slice(0, 80)
    : conversation.title;
  const updateParams = new URLSearchParams({ id: "eq." + id, user_id: "eq." + userId });
  try {
    await rest(request, env, userId, "ai_conversations", updateParams, {
      method: "PATCH",
      body: {
        title,
        provider: completion.provider,
        model: completion.model,
        subject_slug: subjectSlug,
        updated_at: new Date().toISOString(),
      },
      prefer: "return=minimal",
    }, fetcher);
  } catch { /* Response is still useful if the title update is rejected by an older schema. */ }
  return {
    conversation: { ...conversation, title, provider: completion.provider, model: completion.model, subject_slug: subjectSlug },
    user_message: userMessage || { role: "user", content },
    assistant_message: (Array.isArray(assistantRows) ? assistantRows[0] : null) || {
      role: "assistant", content: completion.content, provider: completion.provider, model: completion.model,
    },
  };
}
