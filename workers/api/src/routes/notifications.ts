import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";

/**
 * Уведомления — личные для каждого пользователя и не относятся ни к одному
 * модулю. Раньше они жили только под /staff, а /staff закрыт модульным гейтом
 * "group": студент получал 403 и счётчик непрочитанного не работал.
 */
const notifications = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dbFor(c: any) {
  return createServiceClient(c.env) || c.get("supabase");
}

function error(c: any, rid: string, message: string) {
  const { body, status } = fail("DB_UNAVAILABLE", message, 503, rid);
  return c.json(body, status as 503);
}

notifications.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const { data, error: readError } = await dbFor(c)
    .from("notifications")
    .select("*")
    .eq("user_id", c.get("user").id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (readError) return error(c, rid, "Уведомления недоступны");
  const unread = (data || []).filter((row: any) => !row.read_at).length;
  return c.json(ok({ items: data || [], unread }, rid));
});

notifications.post("/read", requireAuth, async (c) => {
  const rid = requestId();
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  let query = dbFor(c)
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", c.get("user").id)
    .is("read_at", null);
  if (input?.id && UUID.test(String(input.id))) query = query.eq("id", String(input.id));
  const { error: updateError } = await query;
  if (updateError) return error(c, rid, "Не удалось отметить уведомления");
  return c.json(ok({ read: true }, rid));
});

export default notifications;
