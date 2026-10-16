import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const questions = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

questions.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const subject = c.req.query("subject") || c.req.query("subject_slug");
  const limit = Math.min(Number(c.req.query("limit") || 50), 100);
  try {
    // Never return correct answers in list
    let q = supabase
      .from("questions")
      .select("id,stem,subject_slug,subject_id,type,difficulty,is_published")
      .eq("is_published", true)
      .limit(limit);
    if (subject) q = q.eq("subject_slug", subject);
    const { data, error } = await q;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Вопросы недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Вопросы недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

questions.get("/subjects", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("questions")
      .select("subject_slug")
      .eq("is_published", true)
      .limit(1000);
    if (error) return c.json(ok({ items: [] }, rid));
    const set = new Set((data || []).map((r: any) => r.subject_slug).filter(Boolean));
    return c.json(ok({ items: [...set] }, rid));
  } catch {
    return c.json(ok({ items: [] }, rid));
  }
});

questions.post("/:id/report", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  let payload: { reason?: string; comment?: string } = {};
  try {
    payload = await c.req.json();
  } catch {}
  try {
    const { data, error } = await supabase
      .from("question_reports")
      .insert({
        question_id: id,
        user_id: user.id,
        reason: payload.reason || "other",
        comment: payload.comment || null,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось отправить жалобу", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ id: data?.id, submitted: true }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось отправить жалобу", 503, rid);
    return c.json(body, status as 503);
  }
});

export default questions;
