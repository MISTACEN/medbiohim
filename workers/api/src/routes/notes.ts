/**
 * Personal notes attached to questions (and future targets).
 *
 * `/practice` already calls `GET /notes` and `POST /notes`; the canonical
 * Worker never exposed them, so saving a note failed with 404. The table
 * `public.notes(id, user_id, target_type, target_id, text, created_at,
 * updated_at)` already exists and is protected by the `notes_own` RLS policy.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const notes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const NOTE_FIELDS = "id,user_id,target_type,target_id,text,created_at,updated_at";
const TARGET_TYPES = new Set(["question", "test", "material", "lecture", "ticket"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Названия и ссылки целей заметок — одним пакетом на тип, без N+1 с клиента. */
async function hydrateNotes(db: any, items: any[]): Promise<any[]> {
  const uuidIdsByType = new Map<string, string[]>();
  for (const row of items) {
    if (!UUID.test(String(row.target_id))) continue;
    const list = uuidIdsByType.get(row.target_type) || [];
    list.push(String(row.target_id));
    uuidIdsByType.set(row.target_type, list);
  }
  const info = new Map<string, { title: string | null; href: string | null }>();
  const put = (type: string, id: string, title: string | null, href: string | null) =>
    info.set(`${type}:${id}`, { title, href });
  try {
    if (uuidIdsByType.get("question")?.length) {
      const { data } = await db.from("questions").select("id,text,subject_id").in("id", uuidIdsByType.get("question")!).limit(500);
      for (const q of data || [])
        put("question", q.id, String(q.text || "").slice(0, 140) || null, q.subject_id ? `/practice?subject_id=${q.subject_id}` : "/practice");
    }
    if (uuidIdsByType.get("test")?.length) {
      const { data } = await db.from("tests").select("id,title,subject_id").in("id", uuidIdsByType.get("test")!).limit(500);
      for (const t of data || []) put("test", t.id, t.title || null, t.subject_id ? `/subjects/${t.subject_id}?tab=tests` : "/tests");
    }
    if (uuidIdsByType.get("material")?.length) {
      const { data } = await db.from("materials").select("id,title,subject_id").in("id", uuidIdsByType.get("material")!).limit(500);
      for (const m of data || []) put("material", m.id, m.title || null, m.subject_id ? `/subjects/${m.subject_id}?tab=materials` : "/materials");
    }
  } catch (hydrateError) {
    console.error("[notes:hydrate]", hydrateError);
  }
  // lecture/ticket — id из старых источников без таблицы для обратного
  // просмотра: отдаём заметку с типом и идентификатором, ссылку не придумываем.
  return items.map((row) => {
    const hit = info.get(`${row.target_type}:${row.target_id}`);
    return { ...row, title: hit?.title ?? null, href: hit?.href ?? null };
  });
}

notes.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("notes")
      .select(NOTE_FIELDS)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return c.json(ok({ items: await hydrateNotes(supabase, data || []) }, rid));
  } catch (error) {
    console.error("[notes:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Заметки временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

notes.delete("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const id = String(c.req.param("id") ?? "");
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный идентификатор заметки", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await supabase
      .from("notes")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Заметка не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok({ deleted: true, id }, rid));
  } catch (error) {
    console.error("[notes:delete]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось удалить заметку", 503, rid);
    return c.json(body, status as 503);
  }
});

notes.post("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: any = {};
  try {
    payload = await c.req.json();
  } catch {}
  const targetType = String(payload?.target_type || "question").trim();
  const targetId = String(payload?.target_id || "").trim();
  const text = String(payload?.body ?? payload?.text ?? "");
  if (!TARGET_TYPES.has(targetType) || !targetId || targetId.length > 200) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректные тип или объект заметки", 422, rid);
    return c.json(body, status as 422);
  }
  if (text.length > 20000) {
    const { body, status } = fail("VALIDATION_ERROR", "Заметка слишком длинная", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data: existing, error: readError } = await supabase
      .from("notes")
      .select("id")
      .eq("user_id", user.id)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .maybeSingle();
    if (readError) throw readError;

    const now = new Date().toISOString();
    if (existing?.id) {
      const { data, error } = await supabase
        .from("notes")
        .update({ text, updated_at: now })
        .eq("id", existing.id)
        .eq("user_id", user.id)
        .select(NOTE_FIELDS)
        .maybeSingle();
      if (error) throw error;
      return c.json(ok({ note: data }, rid));
    }

    const { data, error } = await supabase
      .from("notes")
      .insert({ user_id: user.id, target_type: targetType, target_id: targetId, text })
      .select(NOTE_FIELDS)
      .single();
    if (error) throw error;
    return c.json(ok({ note: data }, rid), 201);
  } catch (error) {
    console.error("[notes:upsert]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить заметку", 503, rid);
    return c.json(body, status as 503);
  }
});

export default notes;
