import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const tests = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

tests.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const subjectId = c.req.query("subject_id");
  try {
    let q = supabase
      .from("tests")
      .select("id,title,subject_id,module_id,topic_id,time_limit_sec,max_attempts,is_published,created_at,source_key,order_index")
      .eq("is_published", true)
      .limit(200);
    if (subjectId) q = q.eq("subject_id", subjectId);
    const { data, error } = await q;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Тесты недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    const items = (data || []).map((item) => ({ ...item, duration_sec: item.time_limit_sec }));
    return c.json(ok({ items }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Тесты недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.get("/curriculum-map", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase.from("test_curriculum_map").select("*").limit(500);
    if (error) return c.json(ok({ items: [] }, rid));
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    return c.json(ok({ items: [] }, rid));
  }
});

tests.get("/chemistry-master", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase.from("chemistry_master").select("*").limit(500);
    if (error) return c.json(ok({ items: [] }, rid));
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    return c.json(ok({ items: [] }, rid));
  }
});

tests.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id") || "";
  try {
    // Never expose answer keys in list/detail for students
    const { data, error } = await supabase
      .from("tests")
      .select("id,title,subject_id,module_id,topic_id,time_limit_sec,max_attempts,is_published,created_at,source_key,order_index")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Тест недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Тест не найден", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Тест недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

/** Start attempt — prefer RPC if present */
tests.post("/:id/start", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const testId = c.req.param("id");
  try {
    const { data, error } = await supabase.rpc("medbiohim_start_test_attempt", {
      p_test_id: testId,
    });
    if (error) {
      // fallback insert without answer key leakage
      const { data: attempt, error: insErr } = await supabase
        .from("test_attempts")
        .insert({ test_id: testId, user_id: user.id, status: "in_progress" })
        .select("id,test_id,status,started_at")
        .maybeSingle();
      if (insErr) {
        const { body, status } = fail("DB_UNAVAILABLE", "Не удалось начать тест", 503, rid);
        return c.json(body, status as 503);
      }
      return c.json(ok(attempt, rid));
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось начать тест", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.post("/:id/attempts", requireAuth, async (c) => {
  // alias of start
  return tests.fetch(new Request(c.req.url.replace(/\/attempts$/, "/start"), c.req.raw), c.env);
});

tests.post("/attempts/:id/answers", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const attemptId = c.req.param("id");
  let payload: { question_id?: string; answer?: unknown } = {};
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const { data, error } = await supabase.rpc("medbiohim_save_test_answer", {
      p_attempt_id: attemptId,
      p_question_id: payload.question_id,
      p_answer: payload.answer,
    });
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить ответ", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.post("/attempts/:id/finish", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const attemptId = c.req.param("id");
  try {
    const { data, error } = await supabase.rpc("medbiohim_finish_test_attempt", {
      p_attempt_id: attemptId,
    });
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось завершить тест", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось завершить тест", 503, rid);
    return c.json(body, status as 503);
  }
});

export default tests;
