import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const favorites = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(["question", "material", "topic", "test", "subject", "module"]);

favorites.get("/", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const { data, error } = await c.get("supabase").from("favorites").select("target_type,target_id,created_at").order("created_at", { ascending: false }).limit(1000);
    if (error) throw error;
    return c.json(ok({ items: data || [] }, rid));
  } catch (error) {
    console.error("[favorites:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось загрузить избранное", 503, rid);
    return c.json(body, status as 503);
  }
});

favorites.post("/toggle", requireAuth, async (c) => {
  const rid = requestId();
  let input: any;
  try { input = await c.req.json(); } catch { input = null; }
  const targetType = String(input?.target_type || "");
  const targetId = String(input?.target_id || "");
  if (!TYPES.has(targetType) || !UUID.test(targetId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Укажите корректный тип и ID материала", 422, rid);
    return c.json(body, status as 422);
  }
  const db = c.get("supabase");
  try {
    const { data: existing, error: readError } = await db.from("favorites").select("target_id").eq("target_type", targetType).eq("target_id", targetId).maybeSingle();
    if (readError) throw readError;
    if (existing) {
      const { error } = await db.from("favorites").delete().eq("target_type", targetType).eq("target_id", targetId);
      if (error) throw error;
      return c.json(ok({ favorited: false, target_type: targetType, target_id: targetId }, rid));
    }
    const { error } = await db.from("favorites").insert({ user_id: c.get("user").id, target_type: targetType, target_id: targetId });
    if (error) throw error;
    return c.json(ok({ favorited: true, target_type: targetType, target_id: targetId }, rid));
  } catch (error) {
    console.error("[favorites:toggle]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось обновить избранное", 503, rid);
    return c.json(body, status as 503);
  }
});

export default favorites;
