import { Hono } from "hono";
import { extractText, getDocumentProxy } from "unpdf";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAdmin, requireAuth, type AuthVariables } from "../middleware/auth";
import { logActivity } from "../lib/activity";
import { rateLimit, getRedis } from "../lib/redis";
import { shouldUseLectureRag } from "../lib/ai-scope";
import { selectLectureExcerpts } from "../lib/lecture-rag";
import { loadUserAiOverride } from "../lib/user-ai-config";
import {
  aiDailyQuota,
  aiQuotaMessage,
  logAiQuotaRejection,
  withAiCall,
  type AiUsageContext,
} from "../lib/ai-usage";
import { formatAnswer } from "../lib/ai-citations";
import { WorkersAiError, workersAiComplete, workersAiConfigured } from "../lib/workers-ai";
// Shared JavaScript AI provider implementation bundled by Wrangler.
// @ts-expect-error The integration module is plain JavaScript without type declarations.
import { generateAiCompletion, getAiProviderStatus, resolveProviderModel } from "../../../../integrations/cloudflare-api/src/ai-chat.js";
// Корпус «Подготовка к ЦНС» для RAG тьютора (только physiology, вне лекций).
// @ts-expect-error The knowledge module is plain JavaScript without type declarations.
import { getCnsKnowledgeEntries } from "../../../../integrations/cloudflare-api/src/knowledge/cns.js";

const ai = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type ProviderResult = { text: string; provider: string; model: string };

/** Режимы ответа тьютора: «точный» держится на лекциях, «быстрый» — без RAG. */
export type ChatMode = "precise" | "fast";
const MODE_TEMPERATURE: Record<ChatMode, number> = { precise: 0.2, fast: 0.5 };
/** Быстрая модель второго прохода: отвечает за секунды, а не за полминуты. */
const FAST_WORKERS_AI_MODEL = "@cf/meta/llama-3.2-3b-instruct";

export function normalizeChatMode(value: unknown): ChatMode {
  return value === "fast" ? "fast" : "precise";
}

type OralVerdict = { score: number; verdict: string; missed: string[]; mistakes: string[]; follow_up: string };

function decodeBase64Url(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeBase64Text(base64: string): string {
  try {
    return new TextDecoder().decode(decodeBase64Url(base64));
  } catch {
    return "";
  }
}

type ImageExtract = { text: string; code: string; message: string };

/**
 * Расшифровка аудио в текст (roadmap 2.5.2 «конспект из записи»): Groq Whisper.
 * Расшифровка идёт в тот же конспект-промпт, что и PDF/фото. Groq выбран потому,
 * что whisper-large-v3 у него быстрый (×200 realtime) и ключ уже есть у воркера.
 * Без GROQ_API_KEY — честный 503 AUDIO_NOT_CONFIGURED.
 */
async function transcribeAudio(env: Env, base64: string, mime: string, filename: string): Promise<ImageExtract> {
  const key = String(env.GROQ_API_KEY || "").trim();
  if (!key) {
    return { text: "", code: "AUDIO_NOT_CONFIGURED", message: "Расшифровка аудио не настроена на сервере" };
  }
  const bytes = decodeBase64Url(base64);
  const form = new FormData();
  form.append("file", new Blob([bytes as never], { type: mime || "audio/mpeg" }), filename || "audio.mp3");
  form.append("model", "whisper-large-v3");
  form.append("language", "ru");
  form.append("response_format", "json");
  form.append("temperature", "0");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    console.error("[ai:transcribe]", res.status, detail);
    if (res.status === 401 || res.status === 403) {
      return { text: "", code: "AUDIO_NOT_CONFIGURED", message: "Расшифровка аудио недоступна (ключ отклонён)" };
    }
    return { text: "", code: "TRANSCRIBE_FAILED", message: "Не удалось расшифровать аудио — попробуйте другой формат (mp3/m4a/wav)" };
  }
  const payload = await res.json().catch(() => null) as { text?: string } | null;
  return { text: String(payload?.text || "").trim(), code: "ok", message: "" };
}

/**
 * Текст с фото: сначала мультимодальный Gemini (читает фото сам), при его
 * отсутствии — настроенный OCR-шлюз (тот же, что в Мастерской). Если не настроено
 * ничего — возвращаем подсказку, а не пустой ответ.
 */
async function extractImageText(env: Env, base64: string, mime: string): Promise<ImageExtract> {
  const region = String(env.AI_BACKEND_REGION || "ru").trim().toLowerCase();
  const proxyReady = Boolean(env.GEMINI_VERCEL_PROXY_URL && env.GEMINI_VERCEL_PROXY_SECRET);
  const model = String(env.GEMINI_MODEL || "gemini-2.0-flash").trim();
  const prompt = "Это фото страницы конспекта/слайда/учебника по медицине. Перепиши весь видимый текст дословно в markdown: заголовки, списки, таблицы. Формулы — латиницей. Ничего не добавляй от себя, неразборчивые места помечай [неразборчиво].";
  if (env.GEMINI_API_KEY && (region !== "ru" || proxyReady)) {
    const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "x-goog-api-key": String(env.GEMINI_API_KEY).trim(), "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8000 },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (response.ok) {
      const payload: any = await response.json().catch(() => null);
      const text = (payload?.candidates?.[0]?.content?.parts || []).map((part: any) => String(part?.text || "")).join("").trim();
      if (text) return { text, code: "", message: "" };
    } else {
      console.error("[ai:notes-gemini]", response.status);
    }
  }
  const ocrEndpoint = String(env.OCR_API_URL || "").trim();
  if (ocrEndpoint) {
    const response = await fetch(ocrEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.OCR_API_KEY ? { authorization: "Bearer " + String(env.OCR_API_KEY).trim() } : {}),
      },
      body: JSON.stringify({
        model: env.OCR_MODEL || "xiaomi-ocr-0",
        temperature: 0,
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: "data:" + mime + ";base64," + base64 } },
        ] }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    const payload: any = await response.json().catch(() => null);
    const text = String(payload?.choices?.[0]?.message?.content || "").trim();
    if (text) return { text, code: "", message: "" };
    console.error("[ai:notes-ocr]", response.status);
  }
  return {
    text: "",
    code: "VISION_NOT_CONFIGURED",
    message: "Распознавание фото не настроено на сервере. Загрузите PDF с текстовым слоем или текстовый файл.",
  };
}

/**
 * Парсинг вердикта экзаменатора. Провайдеры иногда оборачивают JSON в
 * markdown-код-блок или добавляют прозу — вырезаем первое валидное вхождение.
 */
function parseOralVerdict(raw: string): OralVerdict | null {
  const text = String(raw || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<OralVerdict>;
    const score = Math.max(0, Math.min(10, Math.round(Number(parsed.score) || 0)));
    return {
      score,
      verdict: String(parsed.verdict || "").slice(0, 300),
      missed: (Array.isArray(parsed.missed) ? parsed.missed : []).map((m) => String(m).slice(0, 300)).slice(0, 8),
      mistakes: (Array.isArray(parsed.mistakes) ? parsed.mistakes : []).map((m) => String(m).slice(0, 300)).slice(0, 8),
      follow_up: String(parsed.follow_up || "").slice(0, 500),
    };
  } catch {
    return null;
  }
}

async function generate(
  env: Env,
  messages: ChatMessage[],
  requested?: string,
  temperature = 0.25,
  onAttempt?: (attempt: Record<string, unknown>) => void,
  userOverride?: unknown,
  model?: string,
): Promise<ProviderResult> {
  const system = messages.find((message) => message.role === "system");
  const context = [...(system ? [system] : []), ...messages.filter((message) => message.role !== "system").slice(-23)];
  const result = await generateAiCompletion(env, context.map((message) => ({
    role: message.role,
    content: message.content.slice(0, 12000),
  })), requested || "auto", fetch, { temperature,
    ...(onAttempt ? { onAttempt } : {}),
    ...(userOverride ? { userOverride } : {}),
    ...(model ? { model } : {}),
  });
  return { text: result.content, provider: result.provider, model: result.model };
}

/**
 * Внешние провайдеры (Groq, GigaChat, Mistral) могут отказать все сразу —
 * например, из-за сертификатов или исчерпанных ключей. Workers AI работает
 * внутри Cloudflare без ключей, поэтому он последний фолбэк тьютора.
 */
/**
 * Второй проход по уменьшенному запросу. Биндинг Workers AI отвечает ровно и
 * быстро на короткий промпт (3-7 с), но иногда зависает сверх 25 с — тогда
 * ответ не успевал и студент получал 502. Повтор с урезанным контекстом и
 * меньшим лимитом токенов укладывается в бюджет прокси и обычно проходит.
 */
function compactForWorkersAi(messages: ChatMessage[]): ChatMessage[] {
  const system = messages.find((message) => message.role === "system");
  const rest = messages.filter((message) => message.role !== "system").slice(-4);
  return [
    ...(system ? [{ role: "system" as const, content: system.content.slice(0, 4000) }] : []),
    ...rest.map((message) => ({ role: message.role, content: message.content.slice(0, 4000) })),
  ];
}

async function generateWithFallback(
  env: Env,
  messages: ChatMessage[],
  requested?: string,
  temperature = 0.25,
  onAttempt?: (attempt: Record<string, unknown>) => void,
  userOverride?: unknown,
  model?: string,
): Promise<ProviderResult> {
  try {
    return await generate(env, messages, requested, temperature, onAttempt, userOverride, model);
  } catch (error) {
    if (!workersAiConfigured(env)) throw error;
    console.error("[ai:workers-ai-fallback]", error instanceof Error ? error.message : String(error));
    const attempt = async (input: ChatMessage[], maxTokens: number, timeoutMs: number) =>
      workersAiComplete(env, input, { temperature, maxTokens, timeoutMs });
    try {
      const result = await attempt(messages, 900, 10000);
      return { text: result.content, provider: result.provider, model: result.model };
    } catch (retryError) {
      const code = retryError instanceof WorkersAiError ? retryError.code : "NOT_AVAILABLE";
      if (code !== "TIMEOUT" && code !== "NOT_AVAILABLE") throw retryError;
      console.error("[ai:workers-ai-retry]", code);
      const compact = compactForWorkersAi(messages);
      try {
        // Модель поменьше отвечает за секунды — важно уложиться в бюджет прокси.
        const result = await workersAiComplete(env, compact, {
          temperature, maxTokens: 400, timeoutMs: 8000, model: FAST_WORKERS_AI_MODEL,
        });
        return { text: result.content, provider: result.provider, model: result.model };
      } catch (fastError) {
        console.error("[ai:workers-ai-retry2]", fastError instanceof Error ? fastError.message : String(fastError));
        const result = await attempt(compact, 300, 6000);
        return { text: result.content, provider: result.provider, model: result.model };
      }
    }
  }
}

/**
 * Ответ тьютора с записью в журнал ИИ: одна строка на ответ, включая все
 * фолбэки между провайдерами (итоговый provider/model и суммарная задержка).
 */
function trackedGeneration(
  env: Env,
  messages: ChatMessage[],
  requested: string | undefined,
  temperature: number,
  usage: AiUsageContext,
  userOverride?: unknown,
  model?: string,
): Promise<ProviderResult> {
  return withAiCall(env, usage, () =>
    generateWithFallback(env, messages, requested, temperature, (attempt) => {
      (usage.attempts ??= []).push(attempt);
      // Каждая реальная попытка — проба провайдера для честного /providers:
      // отказ живёт в Redis 10 минут и убирает провайдера из выбора /tutor.
      const id = String(attempt?.id || "");
      if (id && id !== "custom") {
        void recordProviderProbe(env, id, attempt?.outcome === "ok", `${attempt?.outcome || "error"} ${attempt?.status || ""}`.trim());
      }
    }, userOverride, model));
}

/**
 * Провайдеры, которые можно СОХРАНИТЬ в ai_conversations.provider: после
 * миграции 20261115_ai_conversations_provider_expand CHECK пропускает весь
 * список SUPPORTED_PROVIDERS. Значение вне списка честно трактуем как «auto» —
 * прежнее поведение для старых клиентов.
 */
const CONVERSATION_PROVIDERS = ["auto", "openai", "groq", "gigachat", "gemini", "mistral", "openrouter", "custom"] as const;
type ConversationProvider = (typeof CONVERSATION_PROVIDERS)[number];
function normalizeConversationProvider(value: unknown): ConversationProvider {
  const key = String(value || "auto").trim().toLowerCase();
  return (CONVERSATION_PROVIDERS as readonly string[]).includes(key) ? key as ConversationProvider : "auto";
}

function systemPrompt(subjectSlug?: string | null): string {
  return "Ты — AI-тьютор платформы «Медбиохим». Отвечай по-русски, понятно студенту медицинского вуза. Объясняй последовательно, не выдумывай факты. Если вопрос учебный — выделяй ключевые понятия, механизм и короткий вывод."
    + " Если ниже приведены «Материалы курса», опирайся на них как на первоисточник и ставь"
    + " маркер [N] сразу после утверждения, которое взято из фрагмента N."
    + " В квадратных скобках пиши только номер цифрой — [1], [2]; никакие слова и пометки в скобках не выводи."
    + (subjectSlug ? ` Текущий предмет: ${subjectSlug}.` : "");
}

/** Источник под ответом тьютора: номер сноски и лекция, на которую она ведёт. */
export type LectureCitation = { n: number; title: string; lecture_id: string | null; subject_slug: string | null };

/**
 * FA9: RAG-контекст тьютора — топ-5 фрагментов лекций курса в system prompt.
 * Корпус небольшой (десятки лекций, ~75 КБ на предмет), поэтому скоринг по
 * вхождениям слов запроса делается в памяти воркера на каждое сообщение;
 * фрагменты вырезаются вокруг первых вхождений.
 */
export async function buildLectureContext(
  supabase: any,
  subjectSlug: string | null | undefined,
  query: string
): Promise<{ block: string; sources: string[]; citations: LectureCitation[] }> {
  // Без явного предмета материалы курса не подмешиваем: иначе в ответ попадают
  // случайные фрагменты из всех лекций (см. lib/ai-scope.ts).
  if (!String(subjectSlug || "").trim()) return { block: "", sources: [], citations: [] };
  try {
    let lectureQuery = supabase
      .from("histology_lectures")
      .select("id,title,body_markdown,subject_slug")
      .eq("is_published", true)
      .limit(40);
    if (subjectSlug) lectureQuery = lectureQuery.eq("subject_slug", subjectSlug);
    const { data: lectures, error } = await lectureQuery;
    if (error) return { block: "", sources: [], citations: [] };

    // Корпус «Подготовка к ЦНС» (шпаргалка/конспекты/задачи/банк тестов из
    // методички) живёт вне таблицы лекций и подмешивается только к физиологии —
    // скоринг lib/lecture-rag сам отберёт релевантные записи наравне с лекциями.
    const cnsEntries = String(subjectSlug).toLowerCase() === "physiology" ? getCnsKnowledgeEntries() : [];
    const docs = (lectures ?? []).map((lecture: any) => ({
      id: String(lecture.id || ""),
      title: String(lecture.title || ""),
      body: String(lecture.body_markdown || ""),
      subjectSlug: lecture.subject_slug ?? null,
    })).concat(cnsEntries);
    if (!docs.length) return { block: "", sources: [], citations: [] };

    // Отбор — в lib/lecture-rag.ts: основы слов, редкость в корпусе, порог
    // релевантности и приоритет совпадений в названии темы.
    const scored = selectLectureExcerpts(docs, query);
    if (!scored.length) return { block: "", sources: [], citations: [] };

    const FRAGMENT = 600;
    const parts: string[] = [];
    const sources: string[] = [];
    const citations: LectureCitation[] = [];
    scored.forEach((entry, position) => {
      const n = position + 1;
      let fragment: string;
      if (entry.anchor >= 0) {
        const start = Math.max(0, entry.anchor - 120);
        fragment = (start > 0 ? "…" : "") + entry.body.slice(start, start + FRAGMENT).trim() + (start + FRAGMENT < entry.body.length ? "…" : "");
      } else {
        fragment = entry.body.slice(0, FRAGMENT).trim() + (entry.body.length > FRAGMENT ? "…" : "");
      }
      // Номер в начале фрагмента = номер сноски [N] в ответе и в блоке «Источники».
      parts.push(`[${n}] Лекция «${entry.title}»:\n${fragment}`);
      sources.push(entry.title);
      citations.push({ n, title: entry.title, lecture_id: entry.id || null, subject_slug: entry.subjectSlug });
    });
    const block =
      "\n\nМатериалы курса (фрагменты лекций, пронумерованы). Используй их как первоисточник по предмету; " +
      "после каждого утверждения из фрагмента ставь его номер в квадратных скобках — [1], [2] и т.д. " +
      "Не ссылайся на номера, которых нет в списке. " +
      "если фрагментов недостаточно для ответа — честно скажи, чего не хватает, и не выдумывай:\n\n" +
      parts.join("\n\n") +
      // Инструкция повторена после фрагментов: маленькая модель лучше слушает последнее правило.
      "\n\nНАПОМИНАНИЕ: в тексте ответа после каждого утверждения из фрагмента обязателен его номер — [1], [2]. " +
      "В квадратных скобках — только цифра, без слов и пометок. Ответ без сносок не принимается.";
    return { block, sources, citations };
  } catch (error) {
    // RAG — украшение: чат работает и без фрагментов.
    console.error("[ai:rag-context]", error);
    return { block: "", sources: [], citations: [] };
  }
}

/**
 * Честный /providers: провайдер, чей последний живой вызов провалился
 * (диагностика админа или реальный вызов студента), помечается degraded на
 * 10 минут — и в /tutor он больше не предлагается, пока сам не ответит.
 * Кэш в Redis: пишется при diagnostics и при фолбэке в trackedGeneration.
 */
const PROBE_TTL_SECONDS = 600;
const PROBED_PROVIDERS = ["groq", "mistral", "gigachat", "openai", "openrouter", "gemini"];

async function recordProviderProbe(env: Env, provider: string, ok: boolean, detail: string): Promise<void> {
  const redis = getRedis(env);
  if (!redis) return;
  try {
    await redis.set(`ai:probe:${provider}`, JSON.stringify({ ok, detail: detail.slice(0, 120), at: Date.now() }), { ex: PROBE_TTL_SECONDS });
  } catch { /* кэш проб не критичен */ }
}

async function readProviderProbes(env: Env): Promise<Record<string, { ok: boolean; detail: string } | null>> {
  const redis = getRedis(env);
  const out: Record<string, { ok: boolean; detail: string } | null> = {};
  if (!redis) return out;
  try {
    for (const id of PROBED_PROVIDERS) {
      const raw = await redis.get(`ai:probe:${id}`);
      out[id] = raw ? (JSON.parse(String(raw)) as { ok: boolean; detail: string }) : null;
    }
  } catch { /* без кэша — статус как есть */ }
  return out;
}

ai.get("/providers", requireAuth, async (c) => {
  const status = getAiProviderStatus(c.env) as any;
  // Degraded-пометки: провайдер, проваливший последний живой вызов, честно
  // помечается недоступным — фронтенд его в выборе не предлагает.
  const probes = await readProviderProbes(c.env);
  for (const [id, probe] of Object.entries(probes)) {
    const meta = status.providers?.[id];
    if (!meta?.configured || !probe) continue;
    if (!probe.ok) {
      meta.available = false;
      meta.reason = `degraded: ${probe.detail} — проверьте /ai/diagnostics`;
    }
  }
  // BYOM: пользовательская модель появляется в списке, если настроена.
  try {
    const { data: config } = await c.get("supabase")
      .from("user_ai_configs")
      .select("provider,model,prefer_own,key_hint")
      .eq("user_id", c.get("user").id)
      .maybeSingle();
    if (config) {
      status.providers = status.providers || {};
      status.providers.custom = {
        configured: true,
        available: true,
        model: String(config.model || ""),
        models: [String(config.model || "")].filter(Boolean),
        reason: `своя модель (${config.provider === "anthropic" ? "Claude" : "OpenAI-compatible"})${config.key_hint ? " · ···" + config.key_hint : ""}`,
        prefer_own: config.prefer_own === true,
      };
      if (config.prefer_own === true) status.default = "custom";
    }
  } catch { /* без конфига — просто платформенные */ }
  return c.json(ok(status, requestId()));
});

/**
 * GET /ai/diagnostics — живая проверка внешних провайдеров.
 *
 * Нужна, когда «все провайдеры падают»: из ответа видно, ключ не приняли (HTTP 401/404),
 * сеть недоступна (network) или ответ не успел за таймаут. Ключи и тела ответов
 * провайдеров не возвращаются — только статус, этап и время.
 */
ai.get("/diagnostics", requireAdmin, async (c) => {
  const rid = requestId();
  const status = getAiProviderStatus(c.env) as any;
  const attempts: Array<Record<string, unknown>> = [];
  const providers: Array<Record<string, unknown>> = [];
  const probe = { role: "user" as const, content: "Ответь одним словом: ок" };
  for (const id of ["groq", "mistral", "gigachat", "openai", "openrouter", "gemini"]) {
    const meta = status.providers?.[id];
    if (!meta?.configured) {
      providers.push({ id, configured: false, model: meta?.model ?? null });
      continue;
    }
    const started = Date.now();
    // Каждая проверка — своя строка журнала; в попытках видны и предыдущие
    // провайдеры, поэтому видно, кто отказал до успеха.
    try {
      const result = await withAiCall<{ content: string; provider: string; model: string }>(
        c.env,
        {
          route: "GET /ai/diagnostics",
          feature: "diagnostics",
          userId: c.get("user").id,
          requestId: rid,
          attempts,
          metadata: { requested: id },
        },
        () => generateAiCompletion(
          c.env as any,
          [probe],
          id,
          fetch,
          { temperature: 0, onAttempt: (attempt: Record<string, unknown>) => attempts.push({ ...attempt, requested: id }) },
        ),
      );
      // «ok» — это ответил ИМЕННО запрошенный провайдер. Раньше фолбэк
      // (например, Mistral ответил 429, а ответ дал Groq) отмечался как успех
      // запрошенного провайдера, и диагностика врала.
      const servedByRequested = String(result.provider || "") === id;
      providers.push({
        id,
        configured: true,
        ok: servedByRequested,
        provider: result.provider,
        model: result.model,
        ms: Date.now() - started,
        ...(servedByRequested ? {} : { fell_back_to: result.provider }),
      });
      await recordProviderProbe(c.env, id, servedByRequested, servedByRequested ? "ok" : `fell back to ${result.provider}`);
    } catch (error: any) {
      providers.push({ id, configured: true, ok: false, code: String(error?.code || "ERROR"), ms: Date.now() - started });
      await recordProviderProbe(c.env, id, false, String(error?.code || "ERROR"));
    }
  }
  return c.json(ok({ region: status.region, default_provider: status.default, providers, attempts }, rid));
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
    ? resolveProviderModel(c.env, provider, payload.model)
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

  let payload: { content?: string; provider?: string; model?: string; subject_slug?: string; mode?: string } = {};
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
      ? resolveProviderModel(c.env, effectiveProvider, payload.model)
      : null;
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
    );
    // Модель не поставила сносок — гарантируем их сами (см. lib/ai-citations.ts).
    generated = { ...generated, text: formatAnswer(generated.text, rag.citations) };
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

/**
 * Срез учебного контекста для режима «study» (/study): расписание вперёд,
 * несданные ДЗ, слабые темы, долги, SRS-очередь. Собирается по запросу
 * (context_scope) из пользовательского клиента (RLS) и НЕ сохраняется
 * в историю чата. Компактный текст — чтобы не съедать бюджет токенов.
 */
/** Человекочитаемые подписи event_kind для контекста ИИ (см. study/agenda.ts). */
const STUDY_KIND_LABELS: Record<string, string> = {
  class: "занятие",
  assessment: "аттестация",
  credit: "зачёт",
  exam: "экзамен",
  retake: "пересдача",
  makeup: "отработка",
  colloquium: "коллоквиум",
  control_work: "контрольная",
  consultation: "консультация",
  other: "событие",
};

function prepLabel(p: unknown): string {
  if (!p) return "";
  if (typeof p === "string") return p;
  const rec = p as { name?: string; title?: string };
  return String(rec.name || rec.title || "");
}

/**
 * Темы предметов из департаментских планов (site_content subject_plan:<slug>)
 * на ближайшие даты — чтобы ИИ-план говорил «что готовить», а не «посетить».
 * Возвращает сгруппированные по предмету строки вида «DD.MM — Лекция: …».
 */
function subjectPlanLines(planPayload: any, from: string, to: string, limit = 8): string[] {
  const weeks = Array.isArray(planPayload?.weeks) ? planPayload.weeks : [];
  const lines: string[] = [];
  for (const week of weeks) {
    if (lines.length >= limit) break;
    const date = String(week?.date || week?.planned_date || "").slice(0, 10);
    if (!date || date < from || date > to) continue;
    const bits: string[] = [];
    const lecture = String(week?.lecture || "").trim();
    const practice = String(week?.practice || "").trim();
    const lab = String(week?.laboratory || week?.lab || "").trim();
    if (lecture) bits.push(`Лекция: ${lecture}`);
    if (practice) bits.push(`Практика: ${practice}`);
    if (lab) bits.push(`Лабораторная: ${lab}`);
    const preps = (Array.isArray(week?.preparations) ? week.preparations : [])
      .map(prepLabel).filter(Boolean).slice(0, 4);
    if (preps.length) bits.push(`Подготовить: ${preps.join("; ")}`);
    if (!bits.length) continue;
    lines.push(`- ${date}: ${bits.join(" · ")}`);
  }
  return lines;
}

async function buildStudyContext(supabase: any, userId: string): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  const parts: string[] = [];

  // Группы студента — и для расписания, и для ДЗ (раньше расписание не
  // фильтровалось по группе вовсе).
  let groupIds: string[] = [];
  try {
    const { data: memberships } = await supabase
      .from("group_memberships")
      .select("group_id").eq("user_id", userId).eq("is_active", true).limit(10);
    groupIds = (memberships || []).map((m: any) => m.group_id).filter(Boolean);
  } catch { /* без групп — как раньше */ }

  const eventRows: any[] = [];
  const subjectSlugs = new Set<string>();
  try {
    let query = supabase
      .from("schedule_entries")
      .select("date,start_time,event_kind,subject_name,notes,room,subjects(slug),schedules!inner(group_id,is_active)")
      .gte("date", today).lte("date", horizon)
      .order("date", { ascending: true }).limit(24);
    if (groupIds.length) query = query.in("schedules.group_id", groupIds);
    const { data: events } = await query;
    for (const e of (events || [])) {
      const sch = Array.isArray(e.schedules) ? e.schedules[0] : e.schedules;
      if (sch?.is_active === false) continue;
      eventRows.push(e);
      const subj = Array.isArray(e.subjects) ? e.subjects[0] : e.subjects;
      if (subj?.slug) subjectSlugs.add(String(subj.slug));
    }
  } catch { /* расписание необязательно для ответа */ }

  // Планы предметов: темы занятий на горизонт. Ключевые события (коллоквиум,
  // контрольная, зачёт, экзамен) важнее рядовых занятий — их темы поднимаем.
  const planLines: string[] = [];
  if (subjectSlugs.size) {
    try {
      const keys = [...subjectSlugs].map((slug) => `subject_plan:${slug}`);
      const { data: plans } = await supabase
        .from("site_content")
        .select("key,payload").in("key", keys).limit(20);
      for (const row of (plans || [])) {
        const slug = String(row.key || "").replace("subject_plan:", "");
        const lines = subjectPlanLines(row.payload, today, horizon);
        if (lines.length) planLines.push(`Предмет «${slug}»:` + "\n" + lines.join("\n"));
      }
    } catch { /* планы предметов — украшение контекста */ }
  }

  if (eventRows.length) {
    parts.push("Ближайшие события расписания (готовиться к каждому занятию заранее, «просто прийти» — не задача):");
    for (const e of eventRows.slice(0, 14)) {
      const subj = Array.isArray(e.subjects) ? e.subjects[0] : e.subjects;
      const kind = STUDY_KIND_LABELS[String(e.event_kind || "class")] || "занятие";
      const note = String(e.notes || "").trim();
      parts.push(`- ${e.date}${e.start_time ? " " + String(e.start_time).slice(0, 5) : ""}: ${e.subject_name || "Предмет"} — ${kind}${e.room ? ", ауд. " + e.room : ""}${note ? ` · заметка: ${note.slice(0, 120)}` : ""}${subj?.slug ? ` [${subj.slug}]` : ""}`);
    }
  }
  if (planLines.length) {
    parts.push("Темы из планов предметов на ближайшие даты (источник тем для подготовки):");
    parts.push(...planLines);
  }

  try {
    if (groupIds.length) {
      const { data: homeworks } = await supabase
        .from("homeworks")
        .select("id,title,description,due_date,schedule_entry_id,subject_id,subjects(name)")
        .or(groupIds.map((id: string) => `group_id.eq.${id}`).join(",") + ",group_id.is.null")
        .order("due_date", { ascending: true }).limit(40);
      const hwIds = (homeworks || []).map((h: any) => h.id).filter(Boolean);
      let doneIds = new Set<string>();
      if (hwIds.length) {
        const { data: progress } = await supabase
          .from("homework_progress")
          .select("homework_id,completed").eq("user_id", userId).in("homework_id", hwIds).limit(200);
        doneIds = new Set((progress || []).filter((p: any) => p.completed === true).map((p: any) => String(p.homework_id)));
      }
      const pending = (homeworks || [])
        .filter((h: any) => !doneIds.has(String(h.id)) && (!h.due_date || h.due_date <= horizon))
        .slice(0, 10);
      if (pending.length) {
        parts.push("Несданные ДЗ (по сроку, с описанием задания):");
        for (const h of pending) {
          const subject = Array.isArray(h.subjects) ? h.subjects[0] : h.subjects;
          const desc = String(h.description || "").trim().slice(0, 240);
          parts.push(`- ${h.due_date || "без срока"}: ${subject?.name || ""} — ${h.title || "задание"}${desc ? ` · что нужно: ${desc}` : ""}${h.due_date && h.due_date < today ? " (ПРОСРОЧЕНО)" : ""}`);
        }
      }
    }
  } catch { /* ДЗ необязательны */ }

  try {
    const { data: weak } = await supabase
      .from("user_topic_progress")
      .select("percent,topics(title,modules(subject_id,subjects(name)))")
      .eq("user_id", userId).lt("percent", 70)
      .order("percent", { ascending: true }).limit(8);
    const rows = (weak || []).map((p: any) => {
      const topic = Array.isArray(p.topics) ? p.topics[0] : p.topics;
      const module_ = Array.isArray(topic?.modules) ? topic.modules[0] : topic?.modules;
      const subject = Array.isArray(module_?.subjects) ? module_.subjects[0] : module_?.subjects;
      return { name: topic?.title || "тема", subject: subject?.name || "", percent: p.percent };
    });
    if (rows.length) {
      parts.push("Слабые темы (прогресс ниже 70%):");
      for (const w of rows) parts.push(`- ${w.subject} — ${w.name} (${w.percent}%)`);
    }
  } catch { /* слабые темы необязательны */ }

  try {
    const { count } = await supabase
      .from("srs_cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).lte("due_at", new Date().toISOString());
    if (Number(count || 0) > 0) parts.push(`Карточек к повторению сегодня: ${count}.`);
  } catch { /* SRS необязателен */ }

  return parts.length ? parts.join("\n") : null;
}

// Compatibility endpoint used by lightweight clients.
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
  if (shouldUseLectureRag({ mode, subjectSlug, contextScope: payload.context_scope })) {
    const lastQuestion = [...chatMessages].reverse().find((message) => message.role === "user")?.content || "";
    const rag = await buildLectureContext(c.get("supabase"), subjectSlug, lastQuestion);
    if (rag.block) systemSections.push(rag.block);
    citations = rag.citations;
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
 * Конспект из файла (roadmap 2.5 MVP): фото или PDF → структурный конспект
 * markdown. PDF с текстовым слоем разбирается локально (unpdf) и конспектируется
 * любым доступным провайдером; фото требует мультимодального Gemini или
 * OCR-шлюза — без них честная 503 с подсказкой. Ответ на сервере не хранится:
 * студент сам сохраняет конспект как личную лекцию.
 */
const NOTES_MAX_BASE64 = 12_000_000;
// Аудио ограничено жёстче: тело идёт через Vercel-прокси (лимит ~4.5 МБ),
// поэтому принимаем до ~4 МБ бинарно ≈ 5.6 МБ base64.
const NOTES_AUDIO_MAX_BASE64 = 5_600_000;
/** Аудио-запись превращается в конспект (Groq Whisper) — квота в день. */
const NOTES_AUDIO_DAILY_LIMIT = 5;

ai.post("/notes-from-file", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const rl = await rateLimit(c.env, `ai:notes:${user.id}`, 10, 600);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много конспектов подряд. Подождите несколько минут.", 429, rid);
    return c.json(body, status as 429);
  }
  let payload: { content_base64?: string; mime?: string; filename?: string } = {};
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const base64 = String(payload.content_base64 || "").replace(/^data:[^,]+,/, "");
  if (!base64) {
    const { body, status } = fail("VALIDATION", "Передайте файл в content_base64", 400, rid);
    return c.json(body, status as 400);
  }
  const mime = String(payload.mime || "").trim().toLowerCase();
  const filename = String(payload.filename || "").slice(0, 120);
  const isAudio = /^audio\//.test(mime) || /\.(mp3|m4a|ogg|wav|webm|mpga|flac)$/i.test(filename) || mime === "video/webm";
  if (base64.length > (isAudio ? NOTES_AUDIO_MAX_BASE64 : NOTES_MAX_BASE64)) {
    const { body, status } = fail(
      "PAYLOAD_TOO_LARGE",
      isAudio ? "Аудио больше 4 МБ — сожмите запись (mp3 64 кбит/с ≈ 8 минут в 4 МБ) и попробуйте снова" : "Файл больше 8 МБ — разбейте его на части",
      413,
      rid,
    );
    return c.json(body, status as 413);
  }
  if (isAudio) {
    // Отдельная дневная квота: расшифровка дороже чтения PDF.
    const audioQuota = await aiDailyQuota(c.env, "notes_audio", user.id);
    if (!audioQuota.allowed) {
      await logAiQuotaRejection(c.env, {
        route: "POST /ai/notes-from-file",
        feature: "notes_audio",
        userId: user.id,
        requestId: rid,
      });
      const { body, status } = fail("AI_DAILY_LIMIT", aiQuotaMessage(audioQuota, "notes_audio"), 429, rid);
      return c.json(body, status as 429);
    }
  }

  // 1) Извлечь текст источника.
  let sourceText = "";
  let sourceKind = mime;
  try {
    if (mime === "application/pdf" || /\.pdf$/i.test(filename)) {
      const document = await getDocumentProxy(decodeBase64Url(base64));
      const { text } = await extractText(document, { mergePages: true });
      sourceText = String(text || "").replace(/\u0000/g, "").trim();
      sourceKind = "pdf";
      if (!sourceText) {
        const { body, status } = fail("EMPTY_DOCUMENT", "В PDF нет текстового слоя (это скан). Конспект из сканов пока недоступен.", 422, rid);
        return c.json(body, status as 422);
      }
    } else if (/^image\//.test(mime)) {
      const extracted = await extractImageText(c.env, base64, mime);
      sourceText = extracted.text;
      sourceKind = "image";
      if (!sourceText) {
        const { body, status } = fail(extracted.code, extracted.message, 503, rid);
        return c.json(body, status as 503);
      }
    } else if (isAudio) {
      const extracted = await transcribeAudio(c.env, base64, mime, filename);
      sourceText = extracted.text;
      sourceKind = "audio";
      if (!sourceText) {
        const { body, status } = fail(extracted.code, extracted.message, 503, rid);
        return c.json(body, status as 503);
      }
    } else if (/^text\//.test(mime) || /\.(txt|md|markdown)$/i.test(filename)) {
      sourceText = decodeBase64Text(base64).trim();
      sourceKind = "text";
    } else {
      const { body, status } = fail("UNSUPPORTED_TYPE", "Поддерживаются PDF, изображения (JPG/PNG/WebP), аудио (mp3/m4a/ogg/wav) и текстовые файлы", 422, rid);
      return c.json(body, status as 422);
    }
  } catch (error) {
    console.error("[ai:notes-extract]", error instanceof Error ? error.message : String(error));
    const { body, status } = fail("EXTRACT_FAILED", "Не удалось прочитать файл: он повреждён или защищён", 422, rid);
    return c.json(body, status as 422);
  }

  if (sourceText.length < 200) {
    const { body, status } = fail("TEXT_TOO_SHORT", "В файле слишком мало текста для конспекта", 422, rid);
    return c.json(body, status as 422);
  }
  sourceText = sourceText.slice(0, 60000);

  // 2) Конспект любым доступным провайдером (текст уже извлечён — мультимодальность не нужна).
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "Ты — редактор студенческих конспектов по медицине.",
        "Из чернового текста (распознанного фото/PDF или файла) собери структурный конспект в markdown:",
        "заголовки по смыслу, списки, таблицы в markdown, формулы — латиницей.",
        "Сохраняй ВСЕ факты и цифры источника, ничего не придумывай; неразборчивые места помечай [неразборчиво].",
        "В конце добавь раздел «Ключевые термины» — 10-15 терминов с краткими определениями.",
        "Верни только markdown конспекта, без вступлений и пояснений.",
      ].join("\n"),
    },
    { role: "user", content: "Источник (" + sourceKind + ", " + (filename || "без имени") + "):\n\n" + sourceText },
  ];
  try {
    const result = await trackedGeneration(c.env, messages, "auto", 0.2, {
      route: "POST /ai/notes-from-file",
      feature: "notes_file",
      userId: user.id,
      requestId: rid,
      metadata: { source_kind: sourceKind, source_chars: sourceText.length },
    });
    return c.json(ok({
      notes_markdown: result.text,
      source_chars: sourceText.length,
      provider: result.provider,
      model: result.model,
    }, rid));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    const reportedStatus = Number((error as any)?.status);
    const status = reportedStatus === 429 || reportedStatus === 503 ? reportedStatus
      : reason === "no_provider_configured" || reason === "requested_provider_not_configured" ? 503 : 502;
    const { body, status: responseStatus } = fail(String((error as any)?.code || (status === 503 ? "AI_NOT_CONFIGURED" : "AI_UPSTREAM")), error instanceof Error ? error.message : "ИИ-провайдеры временно недоступны", status, rid);
    return c.json(body, responseStatus as 502 | 503);
  }
});

export default ai;
