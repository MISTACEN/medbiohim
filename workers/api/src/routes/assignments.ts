/**
 * Личный трекер отработок («что сдано, что отрабатывать»).
 * Только собственные записи студента: RLS my_assignments ограничивает всё
 * auth.uid(), сервер фильтрует дополнительно. Чужие оценки не собираются —
 * принципиальное решение по приватности, см. WORK-SUMMARY-2026-10-28.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const assignments = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const STATUSES = new Set(["passed", "failed", "pending", "retake_needed"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

type AssignmentInput = {
  subject: string;
  topic: string;
  due_date: string | null;
  status: string;
  grade: string | null;
  note: string | null;
  source: string;
};

function normalizeEntry(value: any, index: number): { row?: AssignmentInput; error?: string } {
  if (!value || typeof value !== "object") return { error: `Запись ${index + 1}: ожидается объект` };
  const subject = clean(value.subject, 200);
  const topic = clean(value.topic, 300);
  if (!subject) return { error: `Запись ${index + 1}: укажите предмет` };
  if (!topic) return { error: `Запись ${index + 1}: укажите тему/занятие` };
  const due = clean(value.due_date, 10);
  const statusRaw = clean(value.status, 20).toLowerCase();
  return {
    row: {
      subject,
      topic,
      due_date: due && DATE.test(due) ? due : null,
      status: STATUSES.has(statusRaw) ? statusRaw : "pending",
      grade: clean(value.grade, 20) || null,
      note: clean(value.note, 2000) || null,
      source: value.source === "csv" ? "csv" : "manual",
    },
  };
}

assignments.get("/", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  const status = clean(c.req.query("status"), 20).toLowerCase();
  try {
    let q = db
      .from("my_assignments")
      .select("id,subject,topic,due_date,status,grade,note,source,created_at,updated_at")
      .eq("user_id", user.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(500);
    if (STATUSES.has(status)) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    const items = data || [];
    const summary = { total: items.length, passed: 0, failed: 0, pending: 0, retake_needed: 0 };
    for (const item of items) {
      const key = String((item as any).status || "pending") as keyof typeof summary;
      if (typeof summary[key] === "number") summary[key] += 1;
    }
    return c.json(ok({ items, summary }, rid));
  } catch (error) {
    console.error("[assignments:list]", error);
    const { body, status: code } = fail("DB_UNAVAILABLE", "Трекер отработок временно недоступен", 503, rid);
    return c.json(body, code as 503);
  }
});

assignments.post("/", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid), 400);
  }
  const batch = Array.isArray(body?.items) ? body.items : [body];
  if (batch.length > 200) {
    return c.json(fail("VALIDATION_ERROR", "Не более 200 записей за раз", 422, rid), 422);
  }
  const rows: AssignmentInput[] = [];
  for (const [index, entry] of batch.entries()) {
    const parsed = normalizeEntry(entry, index);
    if (parsed.error || !parsed.row) {
      return c.json(fail("VALIDATION_ERROR", parsed.error || "Некорректная запись", 422, rid), 422);
    }
    rows.push(parsed.row);
  }
  try {
    const { data, error } = await db
      .from("my_assignments")
      .upsert(
        rows.map((row) => ({ ...row, user_id: user.id })),
        { onConflict: "user_id,subject,topic,due_date" },
      )
      .select();
    if (error) throw error;
    return c.json(ok({ saved: (data || []).length, items: data || [] }, rid), 201);
  } catch (error) {
    console.error("[assignments:save]", error);
    const { body: errBody, status: code } = fail("DB_ERROR", "Не удалось сохранить записи", 503, rid);
    return c.json(errBody, code as 503);
  }
});

assignments.patch("/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  const id = c.req.param("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID записи", 422, rid), 422);
  }
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid), 400);
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body?.status !== undefined) {
    const status = clean(body.status, 20).toLowerCase();
    if (!STATUSES.has(status)) return c.json(fail("VALIDATION_ERROR", "Неизвестный статус", 422, rid), 422);
    patch.status = status;
  }
  if (body?.grade !== undefined) patch.grade = clean(body.grade, 20) || null;
  if (body?.note !== undefined) patch.note = clean(body.note, 2000) || null;
  if (body?.due_date !== undefined) {
    const due = clean(body.due_date, 10);
    patch.due_date = due && DATE.test(due) ? due : null;
  }
  try {
    const { data, error } = await db
      .from("my_assignments")
      .update(patch)
      .eq("user_id", user.id)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return c.json(fail("NOT_FOUND", "Запись не найдена", 404, rid), 404);
    return c.json(ok({ item: data }, rid));
  } catch (error) {
    console.error("[assignments:update]", error);
    const { body: errBody, status: code } = fail("DB_ERROR", "Не удалось обновить запись", 503, rid);
    return c.json(errBody, code as 503);
  }
});

assignments.delete("/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  const id = c.req.param("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID записи", 422, rid), 422);
  }
  try {
    const { data, error } = await db
      .from("my_assignments")
      .delete()
      .eq("user_id", user.id)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return c.json(fail("NOT_FOUND", "Запись не найдена", 404, rid), 404);
    return c.json(ok({ deleted: true }, rid));
  } catch (error) {
    console.error("[assignments:delete]", error);
    const { body: errBody, status: code } = fail("DB_ERROR", "Не удалось удалить запись", 503, rid);
    return c.json(errBody, code as 503);
  }
});

export default assignments;
