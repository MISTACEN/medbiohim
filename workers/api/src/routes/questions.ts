import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const questions = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

questions.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const subject = c.req.query("subject") || c.req.query("subject_slug");
  const limit = Math.min(Number(c.req.query("limit") || 50), 100);
  try {
    let q = supabase.from("questions").select("id,stem,subject_slug,subject_id,type,difficulty,is_published").eq("is_published", true).limit(limit);
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
    const { data, error } = await supabase.from("questions").select("subject_slug").eq("is_published", true).limit(1000);
    if (error) return c.json(ok({ items: [] }, rid));
    const set = new Set((data || []).map((r: any) => r.subject_slug).filter(Boolean));
    return c.json(ok({ items: [...set] }, rid));
  } catch {
    return c.json(ok({ items: [] }, rid));
  }
});

questions.get("/mini-quiz", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const subjectId = String(c.req.query("subject_id") || "").trim();
  const idsRaw = String(c.req.query("ids") || c.req.query("question_ids") || "").trim();
  const ids = idsRaw.split(",").map((s) => s.trim()).filter((id) => UUID.test(id)).slice(0, 20);
  if (!subjectId || !UUID.test(subjectId) || !ids.length) {
    const { body, status } = fail("VALIDATION_ERROR", "subject_id and ids required", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await supabase.from("questions").select("id,stem,options,type,subject_id,subject_slug,is_published").in("id", ids).eq("is_published", true).limit(20);
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Mini-quiz unavailable", 503, rid);
      return c.json(body, status as 503);
    }
    const items = (data || []).map((row: any) => {
      let options = row.options;
      if (typeof options === "string") {
        try { options = JSON.parse(options); } catch { options = []; }
      }
      if (!Array.isArray(options)) options = [];
      const publicOptions = options.map((opt: any, index: number) => ({
        index,
        label: String(opt?.label ?? opt ?? ""),
      }));
      return { id: row.id, stem: row.stem, type: row.type, subject_id: row.subject_id, options: publicOptions };
    });
    return c.json(ok({ items }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Mini-quiz unavailable", 503, rid);
    return c.json(body, status as 503);
  }
});

questions.post("/mini-quiz/check", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const questionId = String(body.question_id || "").trim();
  const selected = Array.isArray(body.selected_indexes)
    ? body.selected_indexes.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n >= 0)
    : [];
  if (!UUID.test(questionId)) {
    const { body: b, status } = fail("VALIDATION_ERROR", "question_id required", 422, rid);
    return c.json(b, status as 422);
  }
  try {
    const { data, error } = await supabase.from("questions").select("id,answer,options,is_published").eq("id", questionId).eq("is_published", true).maybeSingle();
    if (error || !data) {
      const { body: b, status } = fail("NOT_FOUND", "Question not found", 404, rid);
      return c.json(b, status as 404);
    }
    let options = data.options as any;
    if (typeof options === "string") {
      try { options = JSON.parse(options); } catch { options = []; }
    }
    if (!Array.isArray(options)) options = [];
    let correct: number[] = [];
    const answer = data.answer;
    if (Array.isArray(answer)) {
      correct = answer.map((v: any) => Number(v)).filter((n: number) => Number.isInteger(n) && n >= 0 && n < options.length);
    } else if (typeof answer === "number" && Number.isInteger(answer) && answer >= 0 && answer < options.length) {
      correct = [answer];
    }
    const selectedSorted = [...selected].sort((a, b) => a - b);
    const correctSorted = [...correct].sort((a, b) => a - b);
    const isCorrect = selectedSorted.length === correctSorted.length && selectedSorted.every((v, i) => v === correctSorted[i]);
    return c.json(ok({ is_correct: isCorrect, correct_indexes: correctSorted }, rid));
  } catch {
    const { body: b, status } = fail("DB_UNAVAILABLE", "Check failed", 503, rid);
    return c.json(b, status as 503);
  }
});

questions.post("/:id/report", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  let payload: { reason?: string; comment?: string } = {};
  try { payload = await c.req.json(); } catch {}
  try {
    const { data, error } = await supabase.from("question_reports").insert({ question_id: id, user_id: user.id, reason: payload.reason || "other", comment: payload.comment || null }).select("id").maybeSingle();
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
