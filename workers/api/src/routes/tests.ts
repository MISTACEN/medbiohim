import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const tests = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ATTEMPT_FIELDS = ["id", "test_id", "user_id", "status", "score", "max_score", "percent", "started_at", "finished_at", "group_id", "session_id", "context_version"];
function invalid(c: any, rid: string, message: string) {
  const { body, status } = fail("VALIDATION", message, 422, rid);
  return c.json(body, status as 422);
}
function safeAttempt(row: any) {
  const out: Record<string, unknown> = {};
  for (const field of SAFE_ATTEMPT_FIELDS) if (row && Object.prototype.hasOwnProperty.call(row, field)) out[field] = row[field];
  return out;
}
function rpcResult(c: any, rid: string, data: any, error: any, fallback: string, attemptKey?: string, hideAnswerGrade = false) {
  if (error) {
    const status = error.code === "PGRST116" ? 404 : 503;
    const { body, status: st } = fail(status === 404 ? "NOT_FOUND" : "TEST_OPERATION_UNAVAILABLE", status === 404 ? "Запись не найдена" : fallback, status, rid);
    return c.json(body, st as any);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    const { body, status } = fail("TEST_OPERATION_UNAVAILABLE", "Некорректный ответ сервиса тестов", 503, rid);
    return c.json(body, status as 503);
  }
  if (data.ok === false) {
    const status = [400, 401, 403, 404, 409, 413, 422].includes(Number(data.status)) ? Number(data.status) : 503;
    const code = /^[A-Z0-9_]{1,60}$/.test(String(data.code || "")) ? String(data.code) : "TEST_OPERATION_UNAVAILABLE";
    const { body, status: st } = fail(code, String(data.message || fallback).slice(0, 240), status, rid);
    return c.json(body, st as any);
  }
  if (data.ok === true && data.data && typeof data.data === "object") {
    const result = { ...data.data };
    if (attemptKey && result[attemptKey]) {
      const value = { ...result[attemptKey] };
      if (attemptKey === "attempt") {
        delete value.question_snapshot;
        for (const key of ["correct_answer", "answer_key", "question_snapshot"]) delete value[key];
        result[attemptKey] = safeAttempt(value);
      } else {
        for (const key of ["correct_answer", "answer_key", "authoritative_answer"]) delete value[key];
        if (hideAnswerGrade) for (const key of ["is_correct", "score", "grading_status", "feedback"]) delete value[key];
        result[attemptKey] = value;
      }
    }
    for (const key of ["correct_answer", "answer_key", "authoritative_answer", "question_snapshot"]) delete result[key];
  if (hideAnswerGrade) for (const key of ["is_correct", "score", "grading_status", "feedback"]) delete result[key];
    return c.json(ok(result, rid));
  }
  // Older RPC deployments returned the data object directly. Filter any attempt object
  // before returning it; never fall back to direct table inserts or client-side grading.
  const result = { ...data };
  if (attemptKey && result[attemptKey]) {
    const value = { ...result[attemptKey] };
    if (attemptKey === "attempt") {
      delete value.question_snapshot;
      for (const key of ["correct_answer", "answer_key", "question_snapshot"]) delete value[key];
      result[attemptKey] = safeAttempt(value);
    } else {
      for (const key of ["correct_answer", "answer_key", "authoritative_answer"]) delete value[key];
      if (hideAnswerGrade) for (const key of ["is_correct", "score", "grading_status", "feedback"]) delete value[key];
      result[attemptKey] = value;
    }
  }
  if (hideAnswerGrade) for (const key of ["correct_answer", "answer_key", "authoritative_answer", "is_correct", "score", "grading_status", "feedback", "question_snapshot"]) delete result[key];
  return c.json(ok(result, rid));
}

tests.get("/", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  let subjectId = c.req.query("subject_id") || "";
  const subjectSlug = c.req.query("subject_slug") || "";
  const course = Number(c.req.query("course") || 0);
  const semester = Number(c.req.query("semester") || 0);
  try {
    if (subjectId && !UUID.test(subjectId)) return invalid(c, rid, "Некорректный ID предмета");
    if (subjectSlug) {
      let subjectQuery = db.from("subjects").select("id").eq("slug", subjectSlug).eq("is_active", true);
      if (course > 0) subjectQuery = subjectQuery.eq("course_number", course);
      if (semester > 0) subjectQuery = subjectQuery.eq("semester", semester);
      const { data: subjects, error: subjectError } = await subjectQuery.order("course_number").order("semester").limit(1);
      if (subjectError) {
        const { body, status } = fail("DB_UNAVAILABLE", "Предметы тестов недоступны", 503, rid);
        return c.json(body, status as 503);
      }
      if (!subjectId) subjectId = String(subjects?.[0]?.id || "");
    }
    let q = db.from("tests")
      .select("id,title,subject_id,module_id,topic_id,time_limit_sec,max_attempts,is_published,created_at,source_key,order_index")
      .eq("is_published", true).is("archived_at", null).limit(200);
    if (subjectId) q = q.eq("subject_id", subjectId);
    const { data, error } = await q;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Тесты недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    const items = data || [];
    const ids = items.map((item: any) => item.id).filter(Boolean);
    const counts = new Map<string, number>();
    if (ids.length) {
      const { data: links, error: linkError } = await db.from("test_questions").select("test_id").in("test_id", ids);
      if (linkError) {
        const { body, status } = fail("DB_UNAVAILABLE", "Состав тестов недоступен", 503, rid);
        return c.json(body, status as 503);
      }
      for (const link of links || []) counts.set(String(link.test_id), (counts.get(String(link.test_id)) || 0) + 1);
    }
    return c.json(ok({ items: items.map((item: any) => ({
      ...item, duration_sec: item.time_limit_sec, questions_count: counts.get(String(item.id)) || 0,
    })) }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Тесты недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.get("/curriculum-map", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  try {
    const { data, error } = await db.from("test_curriculum_map").select("*").limit(500);
    if (error) return c.json(ok({ items: [] }, rid));
    return c.json(ok({ items: data || [] }, rid));
  } catch { return c.json(ok({ items: [] }, rid)); }
});
tests.get("/chemistry-master", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  try {
    const { data, error } = await db.from("chemistry_master").select("*").limit(500);
    if (error) return c.json(ok({ items: [] }, rid));
    return c.json(ok({ items: data || [] }, rid));
  } catch { return c.json(ok({ items: [] }, rid)); }
});

tests.get("/attempts", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  const testId = c.req.query("test_id");
  if (testId && !UUID.test(testId)) return invalid(c, rid, "Некорректный ID теста");
  try {
    let q = db.from("test_attempts")
      .select("id,test_id,user_id,status,score,max_score,percent,started_at,finished_at,group_id,session_id,context_version,tests(title,subject_id)")
      .eq("user_id", user.id).order("started_at", { ascending: false }).limit(50);
    if (testId) q = q.eq("test_id", testId);
    const { data, error } = await q;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "История попыток временно недоступна", 503, rid);
      return c.json(body, status as 503);
    }
    const items = (data || []).map((row: any) => {
      const test = Array.isArray(row.tests) ? row.tests[0] : row.tests;
      return { ...safeAttempt(row), test_title: test?.title || "", subject_id: test?.subject_id || null };
    });
    return c.json(ok({ items }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "История попыток временно недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.get("/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? "");
  if (!UUID.test(id)) return invalid(c, rid, "Некорректный ID теста");
  try {
    const { data, error } = await db.from("tests")
      .select("id,title,subject_id,module_id,topic_id,time_limit_sec,max_attempts,is_published,created_at,source_key,order_index")
      .eq("id", id).eq("is_published", true).maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Тест недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Тест не найден или не опубликован", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok({ ...data, duration_sec: data.time_limit_sec }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Тест недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

async function startAttempt(c: any, rid: string, testId: string) {
  const db = c.get("supabase");
  const groupId = c.req.query("group_id");
  if (!UUID.test(testId) || (groupId && !UUID.test(groupId))) return invalid(c, rid, "Некорректный ID теста или группы");
  try {
    const { data, error } = await db.rpc("medbiohim_start_test_attempt", { p_test_id: testId, p_group_id: groupId || null });
    return rpcResult(c, rid, data, error, "Не удалось начать тест", "attempt");
  } catch {
    const { body, status } = fail("ATTEMPT_START_UNAVAILABLE", "Не удалось начать тест", 503, rid);
    return c.json(body, status as 503);
  }
}
tests.post("/:id/start", requireAuth, async (c) => startAttempt(c, requestId(), (c.req.param("id") ?? "")));
tests.post("/:id/attempts", requireAuth, async (c) => startAttempt(c, requestId(), (c.req.param("id") ?? "")));

tests.post("/attempts/:id/answers", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? "");
  if (!UUID.test(id)) return invalid(c, rid, "Некорректный ID попытки");
  let p: any;
  try { p = await c.req.json(); } catch { return invalid(c, rid, "Некорректный JSON"); }
  if (!p || typeof p !== "object" || Array.isArray(p) || !UUID.test(String(p.question_id || ""))) return invalid(c, rid, "Нужен корректный question_id");
  const answer = p.answer_text !== undefined ? p.answer_text : p.answer;
  if (answer !== null && answer !== undefined && typeof answer !== "string" && typeof answer !== "number" && typeof answer !== "boolean" && !Array.isArray(answer) && typeof answer !== "object") return invalid(c, rid, "Некорректный формат ответа");
  if (typeof answer === "string" && answer.length > 20000) {
    const { body, status } = fail("PAYLOAD_TOO_LARGE", "Ответ слишком длинный", 413, rid);
    return c.json(body, status as 413);
  }
  try {
    const { data, error } = await db.rpc("medbiohim_save_test_answer", { p_attempt_id: id, p_question_id: p.question_id, p_answer_text: answer == null ? null : typeof answer === "string" ? answer : JSON.stringify(answer) });
    if (error) {
      const { body, status } = fail("ANSWER_SAVE_ERROR", "Не удалось сохранить ответ", 503, rid);
      return c.json(body, status as 503);
    }
    return rpcResult(c, rid, data, null, "Не удалось сохранить ответ", "answer", true);
  } catch {
    const { body, status } = fail("ANSWER_SAVE_ERROR", "Не удалось сохранить ответ", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.post("/attempts/:id/finish", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? "");
  if (!UUID.test(id)) return invalid(c, rid, "Некорректный ID попытки");
  try {
    const { data, error } = await db.rpc("medbiohim_finish_test_attempt", { p_attempt_id: id });
    return rpcResult(c, rid, data, error, "Не удалось завершить попытку", "attempt");
  } catch {
    const { body, status } = fail("ATTEMPT_FINISH_UNAVAILABLE", "Не удалось завершить попытку", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.post("/attempts/:attemptId/answers/:questionId/regrade", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), attemptId = (c.req.param("attemptId") ?? ""), questionId = (c.req.param("questionId") ?? "");
  if (!UUID.test(attemptId) || !UUID.test(questionId)) return invalid(c, rid, "Некорректный ID попытки или вопроса");
  try {
    const { data, error } = await db.rpc("medbiohim_regrade_test_answer", { p_attempt_id: attemptId, p_question_id: questionId });
    return rpcResult(c, rid, data, error, "Не удалось повторно проверить ответ", "answer");
  } catch {
    const { body, status } = fail("GRADING_RETRY_ERROR", "Не удалось повторно проверить ответ", 503, rid);
    return c.json(body, status as 503);
  }
});

export default tests;
