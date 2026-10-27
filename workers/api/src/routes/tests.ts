import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { normalizeQuestion, publicOptions } from "../../../../integrations/cloudflare-api/src/question-format.js";

const tests = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ATTEMPT_FIELDS = ["id", "test_id", "user_id", "status", "score", "max_score", "percent", "started_at", "finished_at", "group_id", "session_id", "context_version"];
function invalid(c: any, rid: string, message: string) {
  const { body, status } = fail("VALIDATION", message, 422, rid);
  return c.json(body, status as 422);
}
function safeAttempt(row: any) {
  const out: Record<string, unknown> = {};
  for (const field of SAFE_ATTEMPT_FIELDS) if (row && Object.prototype.hasOwnProperty.call(row, field)) out[field] = row && row[field];
  return out;
}

const CHEM_FORMULA_MARKERS = /[→⇌≡⁻⁺²³₀-₉]|\b(?:CH|C)\d|\bH\d|[A-Za-z]\d?\s*[↔→]/;
const CHEM_KIND_MAP: Record<string, string> = {
  mcq: "test_question", test_question: "test_question",
  match: "test_question", matching: "test_question",
  open: "open_task", open_task: "open_task",
};

/**
 * Приводит позицию каталога chemistry_master_documents к контракту клиента
 * (/tests → вкладка «Химия»). Понимает канонические элементы v1 и элементы
 * OCR-выгрузки tools/chem (kind: mcq/match/open, answer_raw). Ответ не
 * додумывается: есть answer/answer_raw — «prepared_from_text», нет — «unprepared».
 */
function normalizeChemistryItem(raw: any, doc: any): Record<string, unknown> {
  const kindRaw = String(raw?.kind || raw?.item_type || "").toLowerCase();
  const question = String(raw?.question || raw?.text || "").trim();
  const answer = String(raw?.answer ?? raw?.answer_raw ?? "").trim();
  const topic = String(raw?.topic || raw?.theme || "").trim();
  const text = `${question} ${answer}`;
  const formulaPreserved =
    raw?.formula_preserved === true ||
    (typeof raw?.formula_kind === "string" && raw.formula_kind.length > 0) ||
    CHEM_FORMULA_MARKERS.test(text);
  return {
    item_id: String(raw?.item_id || raw?.item_key || raw?.id || `${doc?.id}:${raw?.num ?? question.slice(0, 32)}`),
    question,
    kind: CHEM_KIND_MAP[kindRaw] || (answer || raw?.options ? "test_question" : "open_task"),
    topic: topic || String(doc?.title || ""),
    formula_preserved: Boolean(formulaPreserved),
    answer: answer || null,
    answer_status: raw?.answer_status || (answer ? "prepared_from_text" : "unprepared"),
    options: Array.isArray(raw?.options) && raw.options.length ? raw.options : undefined,
    source: String(raw?.source || raw?.source_document || doc?.title || ""),
    source_number: raw?.source_number ?? (raw?.num != null ? String(raw.num) : ""),
    subject_slug: doc?.subject_slug || "",
    version: doc?.version || "",
  };
}

async function accessibleSubjectIds(db: any, userId: string, subjectIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(subjectIds.filter(Boolean)));
  if (!ids.length) return new Set();
  const { data: subjects, error: subjectError } = await db
    .from("subjects").select("id,specialty_slug").in("id", ids);
  if (subjectError) throw subjectError;
  const subjectById = new Map((subjects || []).map((row: any) => [String(row.id), row]));
  const needsMembership = (subjects || []).some((row: any) => String(row.specialty_slug || "").trim() !== "");
  let specialties = new Set<string>();
  if (needsMembership) {
    const { data: memberships, error: membershipError } = await db
      .from("group_memberships")
      .select("group_id,groups(specialty_slug,is_active)")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(100);
    if (membershipError) throw membershipError;
    specialties = new Set((memberships || []).flatMap((row: any) => {
      const group = Array.isArray(row.groups) ? row.groups[0] : row.groups;
      const specialty = String(group?.specialty_slug || "").trim().toLowerCase();
      return group?.is_active === true && specialty ? [specialty] : [];
    }));
  }
  return new Set(ids.filter((id) => {
    const subject: any = subjectById.get(id);
    if (!subject) return false;
    const specialty = String(subject.specialty_slug || "").trim().toLowerCase();
    return !specialty || specialties.has(specialty);
  }));
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
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  let subjectId = c.req.query("subject_id") || "";
  const subjectSlug = String(c.req.query("subject_slug") || "").trim().toLowerCase();
  const rawCourse = c.req.query("course");
  const rawSemester = c.req.query("semester");
  const course = rawCourse ? Number(rawCourse) : 0;
  const semester = rawSemester ? Number(rawSemester) : 0;
  if (subjectId && !UUID.test(subjectId)) return invalid(c, rid, "Некорректный ID предмета");
  if ((rawCourse && (!Number.isInteger(course) || course < 1 || course > 8)) ||
      (rawSemester && (!Number.isInteger(semester) || semester < 1 || semester > 16))) {
    return invalid(c, rid, "Некорректный курс или семестр");
  }
  try {
    if (subjectSlug) {
      let subjectQuery = db.from("subjects").select("id").eq("slug", subjectSlug).eq("is_active", true);
      if (course > 0) subjectQuery = subjectQuery.eq("course_number", course);
      if (semester > 0) subjectQuery = subjectQuery.eq("semester", semester);
      const { data: subjects, error: subjectError } = await subjectQuery
        .order("course_number", { ascending: true }).order("semester", { ascending: true }).limit(1);
      if (subjectError) {
        const { body, status } = fail("DB_UNAVAILABLE", "Предметы тестов недоступны", 503, rid);
        return c.json(body, status as 503);
      }
      // An unresolved subject slug must never turn a scoped query into an all-tests query.
      if (!subjects?.[0]?.id) return c.json(ok({ items: [] }, rid));
      subjectId = String(subjects[0].id);
    }
    let q = db.from("tests")
      .select("id,title,subject_id,module_id,topic_id,time_limit_sec,max_attempts,is_published,created_at,source_key,order_index,subjects(name,slug,course_number,semester)")
      .eq("is_published", true).is("archived_at", null)
      .order("order_index", { ascending: true }).order("created_at", { ascending: false }).limit(200);
    if (subjectId) q = q.eq("subject_id", subjectId);
    const { data, error } = await q;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Тесты недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    const initialItems = data || [];
    const scopedIds = initialItems.map((item: any) => String(item.subject_id || "")).filter(Boolean);
    const allowedSubjectIds = await accessibleSubjectIds(db, user.id, scopedIds);
    const items = initialItems.filter((item: any) => !item.subject_id || allowedSubjectIds.has(String(item.subject_id)));
    const ids = items.map((item: any) => item.id).filter(Boolean);
    const counts = new Map<string, number>();
    if (ids.length) {
      // PostgREST отдаёт не больше max-rows (обычно 1000) строк за запрос, а связей
      // у предмета тысячи: без постраничного чтения последние банки выглядели как
      // «0 вопросов». Читаем страницами, пока страница не станет неполной.
      const PAGE = 900;
      for (let from = 0; ; from += PAGE) {
        const { data: links, error: linkError } = await db.from("test_questions")
          .select("test_id,questions!inner(id,is_published,archived_at)")
          .in("test_id", ids)
          .eq("questions.is_published", true)
          .is("questions.archived_at", null)
          .order("test_id", { ascending: true })
          .order("question_id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (linkError) {
          const { body, status } = fail("DB_UNAVAILABLE", "Состав тестов недоступен", 503, rid);
          return c.json(body, status as 503);
        }
        for (const link of links || []) counts.set(String(link.test_id), (counts.get(String(link.test_id)) || 0) + 1);
        if (!links || links.length < PAGE) break;
      }
    }
    // Банки из методичек созданы без test_questions, но у них есть тема/раздел.
    // Считаем вопросы по теме теста, иначе такой банк выглядит пустым («0 вопросов»).
    const emptyScoped = items.filter((item: any) => !(counts.get(String(item.id)) || 0) && (item.topic_id || item.module_id));
    if (emptyScoped.length) {
      const topicIds = [...new Set(emptyScoped.map((item: any) => String(item.topic_id || "")).filter((v: string) => UUID.test(v)))];
      const moduleIds = [...new Set(emptyScoped.map((item: any) => String(item.module_id || "")).filter((v: string) => UUID.test(v)))];
      const topicCounts = new Map<string, number>();
      const moduleCounts = new Map<string, number>();
      if (topicIds.length || moduleIds.length) {
        let q = db.from("questions").select("topic_id,module_id")
          .eq("is_published", true).is("archived_at", null).limit(20000);
        const filters: string[] = [];
        if (topicIds.length) filters.push("topic_id.in.(" + topicIds.join(",") + ")");
        if (moduleIds.length) filters.push("module_id.in.(" + moduleIds.join(",") + ")");
        q = q.or(filters.join(","));
        const { data: scopedQuestions } = await q;
        for (const row of scopedQuestions || []) {
          const topicKey = String((row as any).topic_id || "");
          const moduleKey = String((row as any).module_id || "");
          if (topicKey) topicCounts.set(topicKey, (topicCounts.get(topicKey) || 0) + 1);
          if (moduleKey) moduleCounts.set(moduleKey, (moduleCounts.get(moduleKey) || 0) + 1);
        }
      }
      for (const item of emptyScoped as any[]) {
        const fallback = topicCounts.get(String(item.topic_id || "")) || moduleCounts.get(String(item.module_id || "")) || 0;
        if (fallback) counts.set(String(item.id), fallback);
      }
    }
    return c.json(ok({ items: items.map((item: any) => {
      const subject = Array.isArray(item.subjects) ? item.subjects[0] : item.subjects;
      return {
        ...item,
        subject_name: subject?.name || "",
        subject_slug: subjectSlug || subject?.slug || null,
        course_number: course || subject?.course_number || null,
        semester: semester || subject?.semester || null,
        duration_sec: item.time_limit_sec,
        questions_count: counts.get(String(item.id)) || 0,
      };
    }) }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Тесты недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

tests.get("/curriculum-map", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  try {
    const { data, error } = await db.from("test_curriculum_map").select("*").limit(500);
    if (error) throw error;
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Карта учебного плана временно недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

/**
 * Единый каталог заданий по химии. Данные лежат в chemistry_master_documents
 * (additive-каталог, content — jsonb-массив позиций); роут разворачивает позиции
 * в плоский список, фильтрует и пагинирует. Ошибка БД отдаётся как ошибка:
 * «пустой список 200» маскировал неработающий каталог месяцами.
 */
tests.get("/chemistry-master", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const query = (c.req.query("q") || "").trim().toLowerCase().slice(0, 160);
  const kind = c.req.query("kind") || "";
  const formula = c.req.query("formula") || "";
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit")) || 12));
  if (kind && kind !== "test_question" && kind !== "open_task") {
    return invalid(c, rid, "Неизвестный тип задания");
  }
  try {
    const { data, error } = await db
      .from("chemistry_master_documents")
      .select("id,subject_slug,title,version,content,item_count,updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw error;

    const items: Record<string, unknown>[] = [];
    for (const doc of data || []) {
      const content = Array.isArray((doc as any).content) ? (doc as any).content : [];
      for (const raw of content) items.push(normalizeChemistryItem(raw, doc));
    }
    const filtered = items.filter((item) => {
      if (kind && item.kind !== kind) return false;
      if (formula === "true" && !item.formula_preserved) return false;
      if (formula === "false" && item.formula_preserved) return false;
      if (query) {
        const haystack = `${item.question || ""} ${item.topic || ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    const pages = Math.max(1, Math.ceil(filtered.length / limit));
    const safePage = Math.min(page, pages);
    const slice = filtered.slice((safePage - 1) * limit, safePage * limit);
    return c.json(ok({ items: slice, pagination: { total: filtered.length, page: safePage, pages, limit } }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Каталог заданий по химии временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
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

tests.get("/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user"), id = (c.req.param("id") ?? "");
  if (!UUID.test(id)) return invalid(c, rid, "Некорректный ID теста");
  const bankView = c.req.query("view") === "bank";
  try {
    const { data, error } = await db.from("tests")
      .select("id,title,subject_id,module_id,topic_id,time_limit_sec,max_attempts,is_published,created_at,source_key,order_index")
      .eq("id", id).eq("is_published", true).is("archived_at", null).maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Тест недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Тест не найден или не опубликован", 404, rid);
      return c.json(body, status as 404);
    }
    if (data.subject_id) {
      const allowed = await accessibleSubjectIds(db, user.id, [String(data.subject_id)]);
      if (!allowed.has(String(data.subject_id))) {
        const { body, status } = fail("FORBIDDEN", "Этот тест недоступен для вашей специальности", 403, rid);
        return c.json(body, status as 403);
      }
    }
    const { data: links, error: linkError } = await db.from("test_questions")
      .select("order_index,question:questions(id,subject_id,module_id,topic_id,type,text,answer,options,difficulty,is_published,archived_at,topic:topics(title))")
      .eq("test_id", id)
      .order("order_index", { ascending: true });
    if (linkError) {
      const { body, status } = fail("DB_UNAVAILABLE", "Состав теста временно недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    const questions = (links || []).flatMap((link: any) => {
      const q = Array.isArray(link.question) ? link.question[0] : link.question;
      if (!q || q.is_published !== true || q.archived_at != null) return [];
      const topic = Array.isArray(q.topic) ? q.topic[0] : q.topic;
      // Любой исторический формат (0-based цифра, читаемый эталон, буква,
      // варианты внутри текста) превращаем в одинаковые key/label/correct.
      const normalized = normalizeQuestion({
        type: q.type,
        text: q.text,
        answer: q.answer,
        options: q.options,
      }, { extractTextOptions: true });
      const item: Record<string, unknown> = {
        id: q.id,
        subject_id: q.subject_id,
        module_id: q.module_id,
        topic_id: q.topic_id,
        topic_title: topic?.title || null,
        type: normalized.type,
        text: normalized.text,
        body: normalized.text,
        is_closed: normalized.is_closed,
        closed: normalized.is_closed,
        options: publicOptions(normalized, bankView),
        option_count: normalized.options.length,
        allow_multiple: normalized.allow_multiple,
        requires_order: normalized.order_indexes.length > 0,
        has_answer: Boolean(String(normalized.answer || "").trim()),
        difficulty: q.difficulty ?? null,
      };
      // Answers/correct option markers are available only in the dedicated study bank view.
      if (bankView) {
        item.answer = normalized.answer || null;
        item.answer_display = normalized.answer_display || "";
        item.answer_resolution = normalized.resolution;
        item.answer_indexes = normalized.correct_indexes;
      }
      return [item];
    });
    const test = { ...data, duration_sec: data.time_limit_sec };
    return c.json(ok({ test, questions, source: "db", view: bankView ? "bank" : "test" }, rid));
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
