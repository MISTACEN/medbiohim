import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAdmin, requireAuth, type AuthVariables } from "../middleware/auth";
import { logActivity } from "../lib/activity";
import { rateLimit } from "../lib/redis";
import { shouldUseLectureRag } from "../lib/ai-scope";
import { formatAnswer } from "../lib/ai-citations";
import { WorkersAiError, workersAiComplete, workersAiConfigured } from "../lib/workers-ai";
// Shared JavaScript AI provider implementation bundled by Wrangler.
// @ts-expect-error The integration module is plain JavaScript without type declarations.
import { generateAiCompletion, getAiProviderStatus } from "../../../../integrations/cloudflare-api/src/ai-chat.js";

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

async function generate(env: Env, messages: ChatMessage[], requested?: string, temperature = 0.25): Promise<ProviderResult> {
  const system = messages.find((message) => message.role === "system");
  const context = [...(system ? [system] : []), ...messages.filter((message) => message.role !== "system").slice(-23)];
  const result = await generateAiCompletion(env, context.map((message) => ({
    role: message.role,
    content: message.content.slice(0, 12000),
  })), requested || "auto", fetch, { temperature });
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

async function generateWithFallback(env: Env, messages: ChatMessage[], requested?: string, temperature = 0.25): Promise<ProviderResult> {
  try {
    return await generate(env, messages, requested, temperature);
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

function normalizeConversationProvider(value: unknown): "auto" | "gemini" | "gigachat" {
  // Current Supabase migration constrains ai_conversations.provider to these values.
  return value === "gemini" || value === "gigachat" ? value : "auto";
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
    if (error || !lectures?.length) return { block: "", sources: [], citations: [] };

    const tokens = Array.from(
      new Set(
        String(query || "")
          .toLowerCase()
          .split(/[^a-zа-яё0-9]+/i)
          .filter((token) => token.length >= 4)
      )
    );
    if (!tokens.length) return { block: "", sources: [], citations: [] };

    const scored = (lectures as any[])
      .map((lecture) => {
        const title = String(lecture.title || "");
        const body = String(lecture.body_markdown || "");
        const lowerBody = body.toLowerCase();
        let score = 0;
        let firstAt = -1;
        for (const token of tokens) {
          const inTitle = title.toLowerCase().split(token).length - 1;
          const at = lowerBody.indexOf(token);
          if (at >= 0 && (firstAt < 0 || at < firstAt)) firstAt = at;
          score += inTitle * 5 + (at >= 0 ? 1 : 0) + Math.min(lowerBody.split(token).length - 1, 20) * 0.1;
        }
        return { id: String(lecture.id || ""), subjectSlug: lecture.subject_slug ?? null, title, body, score, firstAt };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (!scored.length) return { block: "", sources: [], citations: [] };

    const FRAGMENT = 600;
    const parts: string[] = [];
    const sources: string[] = [];
    const citations: LectureCitation[] = [];
    scored.forEach((entry, position) => {
      const n = position + 1;
      let fragment: string;
      if (entry.firstAt >= 0) {
        const start = Math.max(0, entry.firstAt - 120);
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

ai.get("/providers", requireAuth, async (c) => {
  return c.json(ok(getAiProviderStatus(c.env), requestId()));
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
    try {
      const result = await generateAiCompletion(
        c.env as any,
        [probe],
        id,
        fetch,
        { temperature: 0, onAttempt: (attempt: Record<string, unknown>) => attempts.push({ ...attempt, requested: id }) },
      );
      providers.push({ id, configured: true, ok: true, provider: result.provider, model: result.model, ms: Date.now() - started });
    } catch (error: any) {
      providers.push({ id, configured: true, ok: false, code: String(error?.code || "ERROR"), ms: Date.now() - started });
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

  let payload: { content?: string; provider?: string; subject_slug?: string; mode?: string } = {};
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
    generated = await generateWithFallback(c.env, messages, payload.provider || (conversation.provider === "auto" ? undefined : conversation.provider), temperature);
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

/**
 * Срез учебного контекста для режима «study» (/study): расписание вперёд,
 * несданные ДЗ, слабые темы, долги, SRS-очередь. Собирается по запросу
 * (context_scope) из пользовательского клиента (RLS) и НЕ сохраняется
 * в историю чата. Компактный текст — чтобы не съедать бюджет токенов.
 */
async function buildStudyContext(supabase: any, userId: string): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  const parts: string[] = [];

  try {
    const { data: events } = await supabase
      .from("schedule_entries")
      .select("date,start_time,event_kind,subject_name,room,schedules!inner(group_id,is_active)")
      .gte("date", today).lte("date", horizon)
      .order("date", { ascending: true }).limit(10);
    const rows = (events || []).filter((e: any) => {
      const sch = Array.isArray(e.schedules) ? e.schedules[0] : e.schedules;
      return sch?.is_active !== false;
    });
    if (rows.length) {
      parts.push("Ближайшие события расписания:");
      for (const e of rows) {
        parts.push(`- ${e.date}${e.start_time ? " " + String(e.start_time).slice(0, 5) : ""}: ${e.subject_name || "Предмет"} — ${e.event_kind || "занятие"}${e.room ? ", ауд. " + e.room : ""}`);
      }
    }
  } catch { /* расписание необязательно для ответа */ }

  try {
    const { data: memberships } = await supabase
      .from("group_memberships")
      .select("group_id").eq("user_id", userId).eq("is_active", true).limit(10);
    const groupIds = (memberships || []).map((m: any) => m.group_id).filter(Boolean);
    if (groupIds.length) {
      const { data: homeworks } = await supabase
        .from("homeworks")
        .select("id,title,due_date,subject_id,subjects(name)")
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
        parts.push("Несданные ДЗ (по сроку):");
        for (const h of pending) {
          const subject = Array.isArray(h.subjects) ? h.subjects[0] : h.subjects;
          parts.push(`- ${h.due_date || "без срока"}: ${subject?.name || ""} — ${h.title || "задание"}${h.due_date && h.due_date < today ? " (ПРОСРОЧЕНО)" : ""}`);
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
            + " (расписание, ДЗ, слабые темы, очереди повторения). Используй его для конкретных"
            + " советов: что делать сегодня, к чему готовиться и в каком порядке. Не выдумывай"
            + " события, которых нет в данных.\n\n=== УЧЕБНЫЙ КОНТЕКСТ ===\n" + snapshot,
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
    const result = await generateWithFallback(c.env, messages, payload.provider, temperature);
    return c.json(ok({
      message: { role: "assistant", content: formatAnswer(result.text, citations) },
      provider: result.provider,
      model: result.model,
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

export default ai;
