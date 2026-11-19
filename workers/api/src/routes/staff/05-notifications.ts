import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, dbFor, error } from "./shared";

import { FIX_TABLES, describeValue, isFixTarget } from "../../lib/quickfix";


import type { StaffRouter } from "./types";

export function registerNotificationRoutes(staff: StaffRouter) {
staff.get("/notifications", requireAuth, async (c) => {
  const rid = requestId();
  const { data, error: readError } = await dbFor(c).from("notifications")
    .select("*").eq("user_id", c.get("user").id).order("created_at", { ascending: false }).limit(50);
  if (readError) return error(c, rid, 503, "DB_UNAVAILABLE", "Уведомления недоступны");
  const unread = (data || []).filter((row: any) => !row.read_at).length;
  return c.json(ok({ items: data || [], unread }, rid));
});

staff.post("/notifications/read", requireAuth, async (c) => {
  const rid = requestId();
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  let query = dbFor(c).from("notifications").update({ read_at: new Date().toISOString() })
    .eq("user_id", c.get("user").id).is("read_at", null);
  if (input.id && UUID.test(String(input.id))) query = query.eq("id", String(input.id));
  const { error: updateError } = await query;
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось отметить уведомления");
  return c.json(ok({ read: true }, rid));
});
}
