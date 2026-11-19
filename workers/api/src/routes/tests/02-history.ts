import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, invalid, safeAttempt } from "./shared";

import type { TestsRouter } from "./types";

export function registerHistoryRoutes(tests: TestsRouter) {

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

tests.get("/:id/bank-progress", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  const testId = String(c.req.param("id") || "");
  const groupId = String(c.req.query("group_id") || "");
  if (!UUID.test(testId) || (groupId && !UUID.test(groupId))) return invalid(c, rid, "Некорректный ID теста или группы");
  try {
    if (groupId) {
      const { data: membership, error } = await db.from("group_memberships").select("group_id").eq("user_id", user.id).eq("group_id", groupId).eq("is_active", true).limit(1);
      if (error) throw error;
      if (!membership?.length) {
        const { body, status } = fail("FORBIDDEN", "Вы не состоите в указанной учебной группе", 403, rid);
        return c.json(body, status as 403);
      }
    }
    const { data: test, error: testError } = await db.from("tests").select("id").eq("id", testId).eq("is_published", true).is("archived_at", null).maybeSingle();
    if (testError) throw testError;
    if (!test) {
      const { body, status } = fail("NOT_FOUND", "Тест не найден", 404, rid);
      return c.json(body, status as 404);
    }
    const { data: links, error: linksError } = await db.from("test_questions").select("question_id,questions!inner(id,is_published,archived_at)").eq("test_id", testId).eq("questions.is_published", true).is("questions.archived_at", null);
    if (linksError) throw linksError;
    const questionIds = [...new Set((links || []).map((row: any) => String(row.question_id)).filter(Boolean))];
    if (!questionIds.length) return c.json(ok({ total: 0, answered: 0, correct: 0, remaining: 0, completed: true }, rid));
    const { data: results, error: resultsError } = await db.from("test_preparation_results")
      .select("question_id,is_correct,answered_at").eq("test_id", testId).eq("user_id", user.id)
      .in("question_id", questionIds).not("answered_at", "is", null).order("answered_at", { ascending: false }).limit(5000);
    if (resultsError) throw resultsError;
    const latest = new Map<string, any>();
    for (const result of results || []) if (!latest.has(String(result.question_id))) latest.set(String(result.question_id), result);
    const answered = latest.size;
    const total = questionIds.length;
    const correct = [...latest.values()].filter((result: any) => result.is_correct === true).length;
    return c.json(ok({ total, answered, correct, remaining: Math.max(0, total - answered), completed: answered >= total }, rid));
  } catch (error) {
    console.error("[tests:bank-progress]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Прогресс банка временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.get("/assignments", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  try {
    const { data: memberships, error: membersError } = await db
      .from("group_memberships")
      .select("group_id")
      .eq("user_id", user.id).eq("is_active", true).limit(50);
    if (membersError) throw membersError;
    const groupIds = [...new Set((memberships || []).map((row: any) => String(row.group_id)).filter(Boolean))];
    // or-фильтр с embedded test_assignment_students валил запрос с PGRST100/PGRST201
    // (неоднозначные FK test_assignments→users). Разбираем на два простых запроса
    // и сливаем в JS — образец scopedSubmissions в routes/teacher/_shared.ts.
    const select = "id,test_id,group_id,due_at,time_limit_sec,max_attempts,question_count,instructions,created_at,tests!inner(id,title,is_published,archived_at,subject_id,subjects(name))";
    const baseFilters = (q: any) => q.eq("tests.is_published", true).is("tests.archived_at", null).order("created_at", { ascending: false }).limit(50);
    // Персональные назначения: сначала ID из связи, потом сами назначения
    // (embedded-фильтр test_assignment_students.student_id без select падал PGRST108).
    const { data: personalLinks, error: personalError } = await db
      .from("test_assignment_students").select("assignment_id").eq("student_id", user.id).limit(100);
    if (personalError) throw personalError;
    const personalIds = [...new Set((personalLinks || []).map((row: any) => String(row.assignment_id)).filter((v) => /^[0-9a-f-]{36}$/i.test(v)))];
    const queries: Array<PromiseLike<{ data: any[] | null; error: any }>> = [];
    if (personalIds.length) {
      queries.push(baseFilters(db.from("test_assignments").select(select)).in("id", personalIds as string[]));
    }
    if (groupIds.length) {
      queries.push(baseFilters(db.from("test_assignments").select(select)).in("group_id", groupIds as string[]));
    }
    const responses = await Promise.all(queries);
    const byId = new Map<string, any>();
    for (const response of responses) {
      if (response.error) throw response.error;
      for (const row of response.data || []) {
        const key = String(row.id);
        if (key && !byId.has(key)) byId.set(key, row);
      }
    }
    const data = [...byId.values()];
    // Имена преподавателей вторым запросом: embed users неоднозначен
    // (created_by + вторая FK) и валил весь список с PGRST201.
    const teacherIds = [...new Set((data || []).map((row: any) => String(row.tests?.created_by || (Array.isArray(row.tests) ? row.tests[0]?.created_by : null) || "")).filter(Boolean))];
    const { data: teachers } = teacherIds.length
      ? await db.from("users").select("id,full_name,display_name").in("id", teacherIds).limit(200)
      : { data: [] };
    const teacherNames = new Map((teachers || []).map((t: any) => [String(t.id), String(t.display_name || t.full_name || "Преподаватель")]));
    const items = (data || []).map((row: any) => {
      const test = Array.isArray(row.tests) ? row.tests[0] : row.tests;
      return {
        id: row.id,
        test_id: row.test_id,
        title: test?.title || null,
        subject_id: test?.subject_id || null,
        subject_name: (test?.subjects ? (Array.isArray(test.subjects) ? test.subjects[0]?.name : test.subjects.name) : null) || null,
        due_at: row.due_at,
        time_limit_sec: row.time_limit_sec,
        max_attempts: row.max_attempts,
        question_count: row.question_count,
        instructions: row.instructions,
        teacher_name: teacherNames.get(String(test?.created_by || "")) || null,
        created_at: row.created_at,
      };
    });
    return c.json(ok({ items }, rid));
  } catch (assignmentsError) {
    console.error("[tests:assignments]", assignmentsError);
    const { body, status } = fail("DB_UNAVAILABLE", "Назначения временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});
}
