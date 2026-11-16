// Карточки-паки (Quizlet-стиль): CRUD своих колод, публикация в мастерскую,
// импорт чужого пака к себе и ИИ-генерация по лекциям предмета.
//
// ИИ-генерация опирается на RAG-контекст лекций (buildLectureContext из ai.ts)
// со строгим промптом: определения — дословно из лекций, ничего не выдумывать;
// каждое понятие помечается источником. Черновик возвращается пользователю —
// пак сохраняется только после подтверждения (POST /card-packs с items).

import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { buildLectureContext } from "./ai";
import { aiDailyQuota, aiQuotaMessage, logAiQuotaRejection, withAiCall } from "../lib/ai-usage";
// @ts-expect-error Plain JS module without type declarations.
import { generateAiCompletion } from "../../../../integrations/cloudflare-api/src/ai-chat.js";

const cardPacks = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PACK_ITEMS = 100;
const MAX_TITLE = 200;
const MAX_CARD_TEXT = 2000;

function relation(value: any) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

type PackItemInput = { front: string; back: string; image_file_id: string | null };

function normalizeItems(raw: unknown): PackItemInput[] | null {
  if (!Array.isArray(raw)) return null;
  const items: PackItemInput[] = [];
  for (const entry of raw.slice(0, MAX_PACK_ITEMS)) {
    const front = String((entry as any)?.front ?? "").trim();
    const back = String((entry as any)?.back ?? "").trim();
    const imageRaw = String((entry as any)?.image_file_id ?? "").trim();
    // image_file_id — необязательный UUID файла из files (кнопка «фото»).
    const image_file_id = imageRaw && UUID.test(imageRaw) ? imageRaw : null;
    if (!front && !image_file_id) return null;
    if (front.length > MAX_CARD_TEXT || back.length > MAX_CARD_TEXT) return null;
    items.push({ front, back, image_file_id });
  }
  return items;
}

/**
 * Картинки карточек не должны быть хотлинком произвольных файлов: разрешаем
 * только свои загрузки и публичные (visibility=public — так публикуются паки).
 */
async function filterAllowedImageFiles(db: any, userId: string, items: PackItemInput[]): Promise<PackItemInput[]> {
  const ids = [...new Set(items.map((item) => item.image_file_id).filter(Boolean))] as string[];
  if (!ids.length) return items;
  const allowed = new Set<string>();
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await db
      .from("files")
      .select("id,uploaded_by,visibility")
      .in("id", ids.slice(i, i + CHUNK))
      .eq("status", "active");
    if (error) throw error;
    for (const file of data || []) {
      if (file.uploaded_by === userId || file.visibility === "public") allowed.add(file.id);
    }
  }
  return items.map((item) => (item.image_file_id && !allowed.has(item.image_file_id) ? { ...item, image_file_id: null } : item));
}

async function insertItems(db: any, packId: string, items: PackItemInput[]) {
  const rows = items.map((item, index) => ({
    pack_id: packId,
    front: item.front,
    back: item.back,
    image_file_id: item.image_file_id,
    order_index: index,
  }));
  // Пакетная вставка чанками — у пулера были обрывы на больших запросах.
  const CHUNK = 25;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("card_pack_items").insert(rows.slice(i, i + CHUNK));
    if (error) throw error;
  }
}

// Список: свои паки (и опубликованные — через ?scope=shared).
cardPacks.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const scope = String(c.req.query("scope") || "mine").trim();
  const subjectSlug = String(c.req.query("subject_slug") || "").trim() || null;
  try {
    let query = db
      .from("card_packs")
      .select("id,owner_id,title,description,subject_slug,source,is_published,created_at,updated_at,users!card_packs_owner_id_fkey(full_name,display_name),card_pack_items(count)")
      .order("updated_at", { ascending: false })
      .limit(100);
    query = scope === "shared" ? query.eq("is_published", true) : query.eq("owner_id", c.get("user").id);
    if (subjectSlug) query = query.eq("subject_slug", subjectSlug);
    const { data, error } = await query;
    if (error) throw error;
    const items = (data || []).map((row: any) => {
      const owner = relation(row.users);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        subject_slug: row.subject_slug,
        source: row.source,
        is_published: row.is_published,
        mine: row.owner_id === c.get("user").id,
        owner_name: owner?.full_name || owner?.display_name || null,
        card_count: Array.isArray(row.card_pack_items) ? (row.card_pack_items[0]?.count ?? 0) : 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });
    return c.json(ok({ items }, rid));
  } catch (listError) {
    console.error("[card-packs:list]", listError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Паки недоступны");
  }
});

// Один пак с карточками (виден по RLS: свой или опубликованный).
cardPacks.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID пака");
  try {
    const { data: pack, error: packError } = await db
      .from("card_packs")
      .select("id,owner_id,title,description,subject_slug,source,is_published,created_at,updated_at,users!card_packs_owner_id_fkey(full_name,display_name)")
      .eq("id", id).maybeSingle();
    if (packError) throw packError;
    if (!pack) return err(c, rid, 404, "NOT_FOUND", "Пак не найден");
    const { data: items, error: itemsError } = await db
      .from("card_pack_items")
      .select("id,front,back,image_file_id,order_index")
      .eq("pack_id", id).order("order_index", { ascending: true }).limit(MAX_PACK_ITEMS);
    if (itemsError) throw itemsError;
    const owner = relation(pack.users);
    return c.json(ok({
      pack: {
        id: pack.id,
        title: pack.title,
        description: pack.description,
        subject_slug: pack.subject_slug,
        source: pack.source,
        is_published: pack.is_published,
        mine: pack.owner_id === c.get("user").id,
        owner_name: owner?.full_name || owner?.display_name || null,
        created_at: pack.created_at,
      },
      items: (items || []).map((item: any) => ({ id: item.id, front: item.front, back: item.back, image_file_id: item.image_file_id || null, order_index: item.order_index })),
    }, rid));
  } catch (readError) {
    console.error("[card-packs:get]", readError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Пак недоступен");
  }
});

// Создание (ручное или подтверждённый ИИ-черновик).
cardPacks.post("/", requireAuth, async (c) => {
  const rid = requestId();
  let input: any = {};
  try { input = await c.req.json(); } catch { return err(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const title = String(input?.title || "").trim();
  if (!title || title.length > MAX_TITLE) return err(c, rid, 422, "VALIDATION_ERROR", "Нужен заголовок пака (до 200 символов)");
  const description = String(input?.description || "").trim().slice(0, 1000);
  const subjectSlug = String(input?.subject_slug || "").trim().slice(0, 64) || null;
  const source = input?.source === "ai" ? "ai" : "user";
  const isPublished = input?.is_published === true;
    const items = normalizeItems(input?.items);
    if (!items || !items.length) return err(c, rid, 422, "VALIDATION_ERROR", "Нужны карточки (front/back), до 100 на пак");

    const db = c.get("supabase");
    try {
      const allowedItems = await filterAllowedImageFiles(db, c.get("user").id, items);
      const { data: pack, error: packError } = await db
      .from("card_packs")
      .insert({
        owner_id: c.get("user").id,
        title,
        description,
        subject_slug: subjectSlug,
        source,
        is_published: isPublished,
        published_at: isPublished ? new Date().toISOString() : null,
      })
      .select("id,title,subject_slug,source,is_published")
      .single();
    if (packError) throw packError;
    await insertItems(db, pack.id, allowedItems);
    return c.json(ok({ pack, card_count: allowedItems.length }, rid), 201);
  } catch (createError) {
    console.error("[card-packs:create]", createError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить пак");
  }
});

// Обновление своих полей пака (заголовок/описание/публикация).
cardPacks.patch("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID пака");
  let input: any = {};
  try { input = await c.req.json(); } catch { return err(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input?.title === "string" && input.title.trim()) patch.title = input.title.trim().slice(0, MAX_TITLE);
  if (typeof input?.description === "string") patch.description = input.description.trim().slice(0, 1000);
  if (input?.is_published === true || input?.is_published === false) {
    patch.is_published = input.is_published;
    patch.published_at = input.is_published ? new Date().toISOString() : null;
  }
  const db = c.get("supabase");
  try {
    const { data, error } = await db
      .from("card_packs")
      .update(patch)
      .eq("id", id).eq("owner_id", c.get("user").id)
      .select("id,is_published")
      .maybeSingle();
    if (error) throw error;
    if (!data) return err(c, rid, 404, "NOT_FOUND", "Пак не найден или не ваш");
    return c.json(ok({ pack: data }, rid));
  } catch (patchError) {
    console.error("[card-packs:patch]", patchError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось обновить пак");
  }
});

cardPacks.delete("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID пака");
  const db = c.get("supabase");
  try {
    const { data, error } = await db
      .from("card_packs")
      .delete()
      .eq("id", id).eq("owner_id", c.get("user").id)
      .select("id").maybeSingle();
    if (error) throw error;
    if (!data) return err(c, rid, 404, "NOT_FOUND", "Пак не найден или не ваш");
    return c.json(ok({ deleted: true }, rid));
  } catch (deleteError) {
    console.error("[card-packs:delete]", deleteError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось удалить пак");
  }
});

// Импорт чужого опубликованного пака к себе: копия с новым владельцем.
cardPacks.post("/:id/import", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID пака");
  const db = c.get("supabase");
  try {
    const { data: source, error: sourceError } = await db
      .from("card_packs")
      .select("id,title,description,subject_slug,source,is_published")
      .eq("id", id).maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return err(c, rid, 404, "NOT_FOUND", "Пак не найден");
    if (!source.is_published) return err(c, rid, 403, "FORBIDDEN", "Импортировать можно только опубликованные паки");
    const { data: items, error: itemsError } = await db
      .from("card_pack_items")
      .select("front,back,image_file_id,order_index")
      .eq("pack_id", id).order("order_index", { ascending: true }).limit(MAX_PACK_ITEMS);
    if (itemsError) throw itemsError;
    const { data: copy, error: copyError } = await db
      .from("card_packs")
      .insert({
        owner_id: c.get("user").id,
        title: source.title,
        description: source.description,
        subject_slug: source.subject_slug,
        source: source.source,
        is_published: false,
      })
      .select("id,title")
      .single();
    if (copyError) throw copyError;
    // Картинки опубликованного пака читаемы всеми (visibility=public при
    // загрузке) — при импорте переносим ссылку, бинарник не дублируем.
    await insertItems(db, copy.id, (items || []).map((item: any) => ({ front: String(item.front || ""), back: String(item.back || ""), image_file_id: item.image_file_id || null })));
    return c.json(ok({ pack: copy, card_count: (items || []).length }, rid), 201);
  } catch (importError) {
    console.error("[card-packs:import]", importError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось скопировать пак");
  }
});

// ИИ-генерация черновика пака по теме из лекций предмета.
// Возвращает ТОЛЬКО черновик: сохранение — отдельным POST /card-packs.
cardPacks.post("/ai-generate", requireAuth, async (c) => {
  const rid = requestId();
  let input: { topic?: string; subject_slug?: string; source_text?: string } = {};
  try { input = await c.req.json(); } catch { return err(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const topic = String(input?.topic || "").trim();
  const subjectSlug = String(input?.subject_slug || "").trim() || null;
  // Свой текст (конспект из фото/PDF или личная лекция) важнее RAG: если он
  // есть, карточки собираются ровно по нему, а предмет не обязателен.
  const sourceText = String(input?.source_text || "").trim().slice(0, 12000);
  if (!topic || topic.length > 300) return err(c, rid, 422, "VALIDATION_ERROR", "Укажите тему (до 300 символов)");
  if (!subjectSlug && sourceText.length < 200) {
    return err(c, rid, 422, "VALIDATION_ERROR", "Выберите предмет для контекста лекций или передайте текст");
  }

  // Генерация пака — дорогая внешняя ИИ-операция: суточная квота на студента.
  const userId = c.get("user").id;
  const quota = await aiDailyQuota(c.env, "card_pack", userId);
  if (!quota.allowed) {
    await logAiQuotaRejection(c.env, {
      route: "POST /card-packs/ai-generate",
      feature: "card_pack",
      userId,
      subjectSlug,
      requestId: rid,
    });
    return err(c, rid, 429, "AI_DAILY_LIMIT", aiQuotaMessage(quota, "card_pack"));
  }

  const db = c.get("supabase");
  try {
    // buildLectureContext возвращает объект с текстовым блоком, а не строку:
    // раньше в промпт попадал «[object Object]», и модель отдавала пустой пак.
    let lectureBlock = sourceText;
    if (lectureBlock.length < 200) {
      const lectureContext = await buildLectureContext(db, subjectSlug, topic);
      lectureBlock = String(lectureContext?.block || "").trim();
    }
    if (!lectureBlock) {
      return err(c, rid, 422, "NO_LECTURE_CONTEXT", "По этому предмету нет лекций для контекста");
    }
    const prompt = [
      "Ты собираешь карточки-пак для повторения студентом.",
      "СТРОГОЕ ПРАВИЛО: каждое определение и факт бери ДОСЛОВНО из приведённых ниже фрагментов лекций.",
      "Ничего не выдумывай и не добавляй из общих знаний. Если фрагментов мало — сделай меньше карточек.",
      `Тема карточек: «${topic}».`,
      "Формат ответа — строго JSON без markdown-обёртки:",
      '{"cards":[{"front":"вопрос/термин","back":"определение из лекции","source":"фрагмент, откуда взято"}]}',
      "От 4 до 12 карточек. Front — короткий термин или вопрос; back — определение из лекции.",
      "",
      "=== ФРАГМЕНТЫ ЛЕКЦИЙ ===",
      lectureBlock,
    ].join("\n");
    const attempts: Array<Record<string, unknown>> = [];
    // Строгий JSON лучше держат крупные модели: сортировочный провайдер
    // (часто llama-8b) отдаёт прозу или пустой массив. AI_JSON_PROVIDER можно
    // переопределить в настройках воркера, по умолчанию — Groq.
    const jsonProvider = String((c.env as any).AI_JSON_PROVIDER || "groq").trim() || "auto";
    const result = await withAiCall<{ content?: string; provider?: string; model?: string }>(
      c.env,
      {
        route: "POST /card-packs/ai-generate",
        feature: "card_pack",
        userId,
        subjectSlug,
        requestId: rid,
        attempts,
      },
      () => generateAiCompletion(
        c.env,
        [{ role: "user", content: prompt.slice(0, 24000) }],
        jsonProvider,
        fetch,
        { temperature: 0.1, onAttempt: (attempt: Record<string, unknown>) => attempts.push(attempt) },
      ),
    );
    let draft = extractCardsJson(String(result.content || ""));
    if (!draft) {
      // Модель иногда добавляет пояснения вокруг JSON или обрезает ответ.
      // Один строгий повтор дешевле, чем «карточки не генерируются».
      console.warn("[card-packs:ai-generate:retry-json]", { requestId: rid, provider: result.provider });
      try {
        const retry = await generateAiCompletion(
          c.env,
          [
            { role: "user", content: prompt.slice(0, 8000) },
            { role: "assistant", content: String(result.content || "").slice(0, 4000) },
            { role: "user", content: "Ответ не был валидным JSON. Верни только валидный JSON вида {\"cards\":[{\"front\":\"...\",\"back\":\"...\",\"source\":\"...\"}]} и ничего больше." },
          ],
          jsonProvider,
          fetch,
          { temperature: 0 },
        );
        draft = extractCardsJson(String(retry.content || ""));
      } catch (retryError) {
        console.warn("[card-packs:ai-generate:retry-failed]", String(retryError));
      }
    }
    if (!draft) return err(c, rid, 502, "AI_BAD_OUTPUT", "ИИ вернул неожиданный формат — попробуйте ещё раз");
    if (!(draft.cards || []).length) {
      console.warn("[card-packs:ai-generate:empty]", JSON.stringify({ requestId: rid, head: String(result.content || "").slice(0, 400) }));
    }
    // Модели иногда называют поля по-своему (term/definition, question/answer)
    // или отдают пару массивом — берём всё, что похоже на карточку.
    const cards = (draft.cards || [])
      .map((card: any) => {
        if (Array.isArray(card)) {
          return { front: String(card[0] || ""), back: String(card[1] || ""), source: String(card[2] || "") };
        }
        return {
          front: String(card?.front ?? card?.term ?? card?.question ?? card?.q ?? ""),
          back: String(card?.back ?? card?.definition ?? card?.answer ?? card?.a ?? ""),
          source: String(card?.source ?? card?.quote ?? card?.fragment ?? ""),
        };
      })
      .map((card) => ({
        front: card.front.trim().slice(0, MAX_CARD_TEXT),
        back: card.back.trim().slice(0, MAX_CARD_TEXT),
        source: card.source.trim().slice(0, 300),
      }))
      .filter((card) => card.front && card.back)
      .slice(0, 12);
    if (!cards.length) {
      // Маленькие модели плохо держат JSON. Просим простой построчный формат
      // «термин || определение» — его понимают все провайдеры.
      console.warn("[card-packs:ai-generate:fallback-lines]", JSON.stringify({ requestId: rid, head: String(result.content || "").slice(0, 200) }));
      try {
        // RAG мог выбрать не ту лекцию. Ищем лекцию по названию/тексту темы
        // и повторяем с этим фрагментом — на нём модель уже видит определения.
        const direct = await directLectureBlock(db, subjectSlug, topic);
        const lines = await generateAiCompletion(
          c.env,
          [
            { role: "user", content: (direct ? prompt.replace(lectureBlock, direct) : prompt).slice(0, 12000) },
            { role: "user", content: "Не JSON. Верни 6–10 строк, каждая строго в виде: термин || определение (дословно из фрагментов выше). Без нумерации и пояснений." },
          ],
          jsonProvider,
          fetch,
          { temperature: 0 },
        );
        const parsed = String(lines.content || "")
          .split("\n")
          .map((line) => line.split("||"))
          .filter((parts) => parts.length >= 2 && parts[0].trim() && parts[1].trim())
          .map((parts) => ({ front: parts[0].trim(), back: parts.slice(1).join("||").trim(), source: "" }));
        if (parsed.length) cards.push(...parsed.slice(0, 12));
      } catch (fallbackError) {
        console.warn("[card-packs:ai-generate:fallback-failed]", String(fallbackError));
      }
    }
    if (!cards.length) {
      return err(c, rid, 502, "AI_EMPTY", "ИИ не смог собрать карточки по этой теме");
    }
    return c.json(ok({ topic, subject_slug: subjectSlug, cards, provider: result.provider, model: result.model }, rid));
  } catch (generateError) {
    console.error("[card-packs:ai-generate]", generateError);
    const code = String((generateError as any)?.code || "");
    if (code === "no_provider_configured" || code === "requested_provider_not_configured") {
      return err(c, rid, 503, "AI_NOT_CONFIGURED", "Не настроен доступный AI-провайдер");
    }
    return err(c, rid, 502, "AI_UPSTREAM", "ИИ-провайдеры временно недоступны");
  }
});

export default cardPacks;

/**
 * Достаёт {"cards":[...]} из свободного ответа модели: снимает ```json-обёртку,
 * берёт первый сбалансированный объект и терпит мусор до/после JSON.
 */
function extractCardsJson(raw: string): { cards?: Array<{ front?: string; back?: string; source?: string }> } | null {
  const text = String(raw || "").replace(/```(?:json)?/gi, "").trim();
  if (!text) return null;
  const candidates: string[] = [text];
  const start = text.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth++;
      else if (char === "}") {
        depth--;
        if (depth === 0) {
          candidates.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const cards = Array.isArray(parsed) ? parsed : parsed?.cards;
      if (Array.isArray(cards)) return { cards };
    } catch {
      /* следующий кандидат */
    }
  }
  return null;
}

/**
 * Прямой поиск лекции по теме: RAG может отдать фрагмент из соседней лекции,
 * и модель честно отвечает «нет определений». Здесь берём лекции, в названии
 * или тексте которых есть слова темы, и отдаём по 1500 символов на каждую.
 */
async function directLectureBlock(db: any, subjectSlug: string | null, topic: string): Promise<string> {
  // Без предмета искать нечего: генерация из своего текста сюда не доходит.
  if (!subjectSlug) return "";
  const words = topic.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3).slice(0, 3);
  if (!words.length) return "";
  try {
    const byTitle = await db.from("histology_lectures")
      .select("title,body_markdown")
      .eq("is_published", true).eq("subject_slug", subjectSlug)
      .ilike("title", `%${words[0]}%`).limit(3);
    let rows = (byTitle?.data || []) as Array<{ title?: string; body_markdown?: string }>;
    if (!rows.length) {
      const byBody = await db.from("histology_lectures")
        .select("title,body_markdown")
        .eq("is_published", true).eq("subject_slug", subjectSlug)
        .ilike("body_markdown", `%${words[0]}%`).limit(3);
      rows = (byBody?.data || []) as Array<{ title?: string; body_markdown?: string }>;
    }
    if (!rows.length) return "";
    return rows
      .map((row, index) => `[${index + 1}] Лекция «${row.title || ""}»:\n${String(row.body_markdown || "").slice(0, 1500)}`)
      .join("\n\n");
  } catch {
    return "";
  }
}

function err(c: any, rid: string, status: number, code: string, message: string) {
  const { body } = fail(code, message, status, rid);
  return c.json(body, status as any);
}
