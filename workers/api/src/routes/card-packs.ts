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

type PackItemInput = { front: string; back: string };

function normalizeItems(raw: unknown): PackItemInput[] | null {
  if (!Array.isArray(raw)) return null;
  const items: PackItemInput[] = [];
  for (const entry of raw.slice(0, MAX_PACK_ITEMS)) {
    const front = String((entry as any)?.front ?? "").trim();
    const back = String((entry as any)?.back ?? "").trim();
    if (!front) return null;
    if (front.length > MAX_CARD_TEXT || back.length > MAX_CARD_TEXT) return null;
    items.push({ front, back });
  }
  return items;
}

async function insertItems(db: any, packId: string, items: PackItemInput[]) {
  const rows = items.map((item, index) => ({
    pack_id: packId,
    front: item.front,
    back: item.back,
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
      .select("id,front,back,order_index")
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
      items: (items || []).map((item: any) => ({ id: item.id, front: item.front, back: item.back, order_index: item.order_index })),
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
    await insertItems(db, pack.id, items);
    return c.json(ok({ pack, card_count: items.length }, rid), 201);
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
      .select("front,back,order_index")
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
    await insertItems(db, copy.id, (items || []).map((item: any) => ({ front: String(item.front || ""), back: String(item.back || "") })));
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
  let input: { topic?: string; subject_slug?: string } = {};
  try { input = await c.req.json(); } catch { return err(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const topic = String(input?.topic || "").trim();
  const subjectSlug = String(input?.subject_slug || "").trim() || null;
  if (!topic || topic.length > 300) return err(c, rid, 422, "VALIDATION_ERROR", "Укажите тему (до 300 символов)");
  if (!subjectSlug) return err(c, rid, 422, "VALIDATION_ERROR", "Выберите предмет для контекста лекций");

  const db = c.get("supabase");
  try {
    const lectureContext = await buildLectureContext(db, subjectSlug, topic);
    if (!lectureContext) {
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
      lectureContext,
    ].join("\n");
    const result = await generateAiCompletion(
      c.env,
      [{ role: "user", content: prompt.slice(0, 24000) }],
      "auto",
    );
    let draft: { cards?: Array<{ front?: string; back?: string; source?: string }> } = {};
    const raw = String(result.content || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    try { draft = JSON.parse(raw); } catch {
      const match = /\{[\s\S]*"cards"[\s\S]*\}/.exec(String(result.content || ""));
      if (match) draft = JSON.parse(match[0]);
      else return err(c, rid, 502, "AI_BAD_OUTPUT", "ИИ вернул неожиданный формат — попробуйте ещё раз");
    }
    const cards = (draft.cards || [])
      .map((card) => ({
        front: String(card?.front || "").trim().slice(0, MAX_CARD_TEXT),
        back: String(card?.back || "").trim().slice(0, MAX_CARD_TEXT),
        source: String(card?.source || "").trim().slice(0, 300),
      }))
      .filter((card) => card.front && card.back)
      .slice(0, 12);
    if (!cards.length) return err(c, rid, 502, "AI_EMPTY", "ИИ не смог собрать карточки по этой теме");
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

function err(c: any, rid: string, status: number, code: string, message: string) {
  const { body } = fail(code, message, status, rid);
  return c.json(body, status as any);
}
