/**
 * Authenticated AI-chat metadata and history endpoints.
 * All database REST calls use the caller's JWT (never service_role) so Supabase RLS
 * remains the authority for conversation/message ownership.
 */
const SUPPORTED_PROVIDERS = ["auto", "groq", "gigachat", "gemini", "mistral", "openrouter"];

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
