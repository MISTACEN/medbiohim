import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const attendance = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const relation = (value: any) => Array.isArray(value) ? value[0] : value;
const ALLOWED = new Set(["present", "excused", "sick", "unexcused"]);

attendance.post("/:entryId", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const entryId = c.req.param("entryId");
  if (!UUID.test(entryId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID занятия", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: any;
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const statusValue = String(payload?.status || "");
  if (!ALLOWED.has(statusValue)) {
    const { body, status } = fail("VALIDATION_ERROR", "Недопустимый статус посещаемости", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data: memberships, error: membershipError } = await db.from("group_memberships")
      .select("group_id,groups(id,is_active)").eq("user_id", user.id).eq("is_active", true).limit(100);
    if (membershipError) throw membershipError;
    const groupIds = (memberships || []).filter((m: any) => relation(m.groups)?.is_active !== false).map((m: any) => String(m.group_id));
    if (!groupIds.length) {
      const { body, status } = fail("NO_GROUP", "Нет активной учебной группы", 422, rid);
      return c.json(body, status as 422);
    }
    const { data: entry, error: entryError } = await db.from("schedule_entries")
      .select("id,schedule_id,schedules!inner(id,group_id,is_active,version)")
      .eq("id", entryId).maybeSingle();
    if (entryError) throw entryError;
    const schedule = relation((entry as any)?.schedules);
    if (!entry || !schedule || schedule.is_active === false || !groupIds.includes(String(schedule.group_id))) {
      const { body, status } = fail("INVALID_LESSON_CONTEXT", "Занятие не найдено в вашем активном расписании", 422, rid);
      return c.json(body, status as 422);
    }
    const { data: existing, error: existingError } = await db.from("attendance_records")
      .select("id").eq("schedule_entry_id", entryId).eq("user_id", user.id).maybeSingle();
    if (existingError && !String(existingError.code || "").startsWith("PGRST116")) throw existingError;
    const row = existing?.id
      ? await db.from("attendance_records").update({ status: statusValue, note: payload.note == null ? null : String(payload.note).slice(0, 2000), updated_at: new Date().toISOString() }).eq("id", existing.id).eq("user_id", user.id).select("*").maybeSingle()
      : await db.from("attendance_records").insert({ schedule_entry_id: entryId, user_id: user.id, status: statusValue, note: payload.note == null ? null : String(payload.note).slice(0, 2000) }).select("*").maybeSingle();
    if (row.error) throw row.error;
    return c.json(ok({ attendance: row.data, context: { group_id: schedule.group_id, schedule_id: schedule.id, schedule_version: schedule.version ?? null, session_id: null } }, rid));
  } catch (error) {
    console.error("[attendance]", error);
    const { body, status } = fail("DB_ERROR", "Не удалось сохранить посещаемость", 503, rid);
    return c.json(body, status as 503);
  }
});

export default attendance;
