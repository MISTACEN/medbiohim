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
  const explicitSubjectId = c.req.query("subject_id") || "";
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 50), 1), 100);
  const offset = Math.min(Math.max(Number(c.req.query("offset") || 0), 0), 100000);
  const searchTerm = String(c.req.query("q") || "").trim().slice(0, 160);
  const kind = String(c.req.query("kind") || "").trim();
  try {
    let subjectId = explicitSubjectId && UUID.test(explicitSubjectId) ? explicitSubjectId : subject && UUID.test(subject) ? subject : "";
    if (explicitSubjectId && !UUID.test(explicitSubjectId)) {
      const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID предмета", 422, rid);
      return c.json(body, status as 422);
    }
    if (subject && !subjectId) {
      // A slug can intentionally identify the same subject across courses or
      // semesters. A UUID still narrows to one row; a slug searches all active rows.
      const { data: subjects, error: subjectError } = await supabase.from("subjects").select("id").eq("slug", subject).eq("is_active", true).limit(100);
      if (subjectError) throw subjectError;
      const subjectIds = [...new Set((subjects || []).map((row: any) => String(row.id || "")).filter((id: string) => UUID.test(id)))];
      if (!subjectIds.length) return c.json(ok({ items: [], total: 0, limit, offset }, rid));
      subjectId = subjectIds.length === 1 ? subjectIds[0] : "";
      if (subjectIds.length > 1) {
        let q = supabase.from("questions").select("id,text,answer,subject_id,type,difficulty,is_published", { count: "exact" }).eq("is_published", true).is("archived_at", null).in("subject_id", subjectIds).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
        if (searchTerm) q = q.ilike("text", `%${searchTerm}%`);
        if (kind) q = q.eq("type", kind);
        const { data, error, count } = await q;
        if (error) throw error;
        return c.json(ok({ items: (data || []).map((row: any) => ({ ...row, stem: row.text, has_answer: Boolean(String(row.answer ?? "").trim()), answer: c.req.query("include_answer") === "1" ? row.answer : undefined })), total: count || 0, limit, offset }, rid));
      }
    }
    let q = supabase.from("questions").select("id,text,answer,subject_id,type,difficulty,is_published", { count: "exact" }).eq("is_published", true).is("archived_at", null).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (subjectId) q = q.eq("subject_id", subjectId);
    if (searchTerm) q = q.ilike("text", `%${searchTerm}%`);
    if (kind) q = q.eq("type", kind);
    const { data, error, count } = await q;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Вопросы недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: (data || []).map((row: any) => ({ ...row, stem: row.text, has_answer: Boolean(String(row.answer ?? "").trim()), answer: c.req.query("include_answer") === "1" ? row.answer : undefined })), total: count || 0, limit, offset }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Вопросы недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

questions.get("/subjects", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data: questionsRows, error: questionsError } = await supabase.from("questions").select("subject_id").eq("is_published", true).is("archived_at", null).limit(1000);
    if (questionsError) throw questionsError;
    const ids = [...new Set((questionsRows || []).map((row: any) => String(row.subject_id || "")).filter(Boolean))];
    if (!ids.length) return c.json(ok({ items: [] }, rid));
    const { data, error } = await supabase.from("subjects").select("id,slug").in("id", ids).eq("is_active", true).not("slug", "is", null);
    if (error) throw error;
    return c.json(ok({ items: (data || []).filter((row: any) => row.slug).map((row: any) => ({ subject_id: row.id, subject_slug: row.slug })) }, rid));
  } catch (error) {
    console.error("[questions:subjects]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Список предметов недоступен", 503, rid);
    return c.json(body, status as 503);
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
    const { data, error } = await supabase.from("questions").select("id,text,options,type,subject_id,is_published").in("id", ids).eq("subject_id", subjectId).eq("is_published", true).is("archived_at", null).limit(20);
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
      return { id: row.id, stem: row.text, type: row.type, subject_id: row.subject_id, options: publicOptions };
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
    let answer: any = data.answer;
    if (typeof answer === "string") {
      try { answer = JSON.parse(answer); } catch { if (/^\d+$/.test(answer.trim())) answer = Number(answer.trim()); }
    }
    if (Array.isArray(answer)) {
      correct = answer.map((v: any) => Number(v)).filter((n: number) => Number.isInteger(n) && n >= 0 && n < options.length);
    } else if (typeof answer === "number" && Number.isInteger(answer) && answer >= 0 && answer < options.length) {
      correct = [answer];
    }
    if (!correct.length) correct = options.flatMap((option: any, index: number) => option && typeof option === "object" && option.correct === true ? [index] : []);
    const selectedSorted = [...selected].sort((a, b) => a - b);
    const correctSorted = [...correct].sort((a, b) => a - b);
    const isCorrect = selectedSorted.length === correctSorted.length && selectedSorted.every((v, i) => v === correctSorted[i]);
    return c.json(ok({ is_correct: isCorrect, correct_indexes: correctSorted }, rid));
  } catch {
    const { body: b, status } = fail("DB_UNAVAILABLE", "Check failed", 503, rid);
    return c.json(b, status as 503);
  }
});

questions.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID вопроса", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await c.get("supabase").from("questions")
      .select("id,text,answer,options,type,difficulty,subject_id,module_id,topic_id,is_published,archived_at,topics(title),subjects(name,slug)")
      .eq("id", id).eq("is_published", true).is("archived_at", null).maybeSingle();
    if (error) throw error;
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Вопрос не найден", 404, rid);
      return c.json(body, status as 404);
    }
    const topic = Array.isArray((data as any).topics) ? (data as any).topics[0] : (data as any).topics;
    const subject = Array.isArray((data as any).subjects) ? (data as any).subjects[0] : (data as any).subjects;
    const question = { ...data, stem: (data as any).text, topic: topic?.title || "", subject_name: subject?.name || "", subject_slug: subject?.slug || null,
      has_answer: Boolean(String((data as any).answer || "").trim()) };
    return c.json(ok({ question }, rid));
  } catch (error) {
    console.error("[questions:detail]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Вопрос временно недоступен", 503, rid);
    return c.json(body, status as 503);
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
