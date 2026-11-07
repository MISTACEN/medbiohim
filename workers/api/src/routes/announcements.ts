import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";

/**
 * Публичное чтение объявлений. Раньше /api/v1/announcements отдавал 501,
 * хотя объявления — обычный контент главной и не являются админской данными.
 * Читаем тот же site_content, что и админка, но только на чтение.
 */
const announcements = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

announcements.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = createServiceClient(c.env) || c.get("supabase");
  try {
    const { data, error } = await db
      .from("site_content")
      .select("payload")
      .eq("key", "announcements")
      .maybeSingle();
    if (error) throw error;
    const payload = data?.payload;
    const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
    // Закреплённое — первым, остальные от новых к старым: тот же порядок, что в админке.
    const sorted = [...items].sort((a: any, b: any) => {
      const pin = Number(Boolean(b?.pinned)) - Number(Boolean(a?.pinned));
      if (pin !== 0) return pin;
      return String(b?.created_at || "").localeCompare(String(a?.created_at || ""));
    });
    return c.json(ok({ items: sorted, count: sorted.length }, rid));
  } catch (cause) {
    console.error("[announcements:list]", cause);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось загрузить объявления", 503, rid);
    return c.json(body, status as 503);
  }
});

export default announcements;
