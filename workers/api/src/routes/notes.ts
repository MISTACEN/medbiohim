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
    return c.json(ok({ items: data || [] }, rid));
  } catch (error) {
    console.error("[notes:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Заметки временно недоступны", 503, rid);
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
