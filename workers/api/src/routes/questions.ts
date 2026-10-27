import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import {
  normalizeQuestion,
  publicOptions,
  gradeClosedAnswer,
} from "../../../../integrations/cloudflare-api/src/question-format.js";

const questions = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function publicQuestionRow(row: any, includeAnswer: boolean) {
  const { options: rawOptions, ...safe } = row || {};
  const base = {
    ...safe,
    stem: String(row?.text || ""),
    has_answer: Boolean(String(row?.answer ?? "").trim()),
  };
  if (!includeAnswer) return { ...base, answer: undefined };
  const normalized = normalizeQuestion({
    type: row?.type,
    text: row?.text,
    answer: row?.answer,
    options: rawOptions,
  }, { extractTextOptions: true });
  return {
    ...base,
    stem: normalized.text,
    text: normalized.text,
    answer: normalized.answer || null,
    answer_display: normalized.answer_display || "",
    options: publicOptions(normalized, true),
    is_closed: normalized.is_closed,
    allow_multiple: normalized.allow_multiple,
    requires_order: normalized.order_indexes.length > 0,
    correct_keys: normalized.correct_keys,
    has_answer: Boolean(String(normalized.answer || "").trim()),
  };
}

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
        const includeAnswer = c.req.query("include_answer") === "1";
        let q = supabase.from("questions").select("id,text,answer,options,subject_id,type,difficulty,is_published", { count: "exact" }).eq("is_published", true).is("archived_at", null).in("subject_id", subjectIds).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
        if (searchTerm) q = q.ilike("text", `%${searchTerm}%`);
        if (kind) q = q.eq("type", kind);
        const { data, error, count } = await q;
        if (error) throw error;
        return c.json(ok({ items: (data || []).map((row: any) => publicQuestionRow(row, includeAnswer)), total: count || 0, limit, offset }, rid));
      }
    }
    let q = supabase.from("questions").select("id,text,answer,options,subject_id,module_id,topic_id,type,difficulty,is_published", { count: "exact" }).eq("is_published", true).is("archived_at", null).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (subjectId) q = q.eq("subject_id", subjectId);
    if (searchTerm) q = q.ilike("text", `%${searchTerm}%`);
    if (kind) q = q.eq("type", kind);
    const topicId = String(c.req.query("topic_id") || "").trim();
    if (topicId) q = q.eq("topic_id", topicId);
    const moduleId = String(c.req.query("module_id") || "").trim();
    if (moduleId) q = q.eq("module_id", moduleId);
    const withTopic = c.req.query("with_topic") === "1";
    if (withTopic) q = q.not("topic_id", "is", null);
    const { data, error, count } = await q;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Вопросы недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    // Названия темы/раздела подтягиваем отдельными запросами: у legacy-таблиц
    // может не быть FK-связи, и вложенный embed уронил бы весь банк в 503.
    const rows = data || [];
    const topicIds = [...new Set(rows.map((row: any) => String(row.topic_id || "")).filter(Boolean))];
    const moduleIds = [...new Set(rows.map((row: any) => String(row.module_id || "")).filter(Boolean))];
    const topicTitles = new Map<string, string>();
    const moduleTitles = new Map<string, string>();
    if (topicIds.length) {
      const { data: topicRows } = await supabase.from("topics").select("id,title").in("id", topicIds).limit(500);
      for (const row of topicRows || []) topicTitles.set(String((row as any).id), String((row as any).title || ""));
    }
    if (moduleIds.length) {
      const { data: moduleRows } = await supabase.from("modules").select("id,title").in("id", moduleIds).limit(500);
      for (const row of moduleRows || []) moduleTitles.set(String((row as any).id), String((row as any).title || ""));
    }
    const includeAnswer = c.req.query("include_answer") === "1";
    return c.json(ok({ items: rows.map((row: any) => ({
      ...publicQuestionRow(row, includeAnswer),
      topic: topicTitles.get(String(row.topic_id || "")) || "",
      module: moduleTitles.get(String(row.module_id || "")) || "",
    })), total: count || 0, limit, offset }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Вопросы недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

// Темы предмета для фильтра банка вопросов: модули (методички) с темами и
// числом опубликованных вопросов по каждой теме.
questions.get("/topics", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const subjectId = String(c.req.query("subject_id") || "").trim();
  if (!UUID.test(subjectId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID предмета", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data: moduleRows, error: modulesError } = await supabase
      .from("modules").select("id,title,order_index")
      .eq("subject_id", subjectId).eq("is_published", true)
      .order("order_index", { ascending: true }).limit(200);
    if (modulesError) throw modulesError;
    const moduleIds = (moduleRows || []).map((m: any) => String(m.id)).filter(Boolean);
    const { data: topicRows, error: topicsError } = moduleIds.length
      ? await supabase.from("topics").select("id,module_id,title,order_index").in("module_id", moduleIds).limit(1000)
      : { data: [] as any[], error: null as any };
    if (topicsError) throw topicsError;
    const topicsByModule = new Map<string, any[]>();
    for (const row of topicRows || []) {
      const key = String((row as any).module_id || "");
      if (!topicsByModule.has(key)) topicsByModule.set(key, []);
      topicsByModule.get(key)!.push(row);
    }
    const modules = (moduleRows || []).map((m: any) => ({ ...m, topics: topicsByModule.get(String(m.id)) || [] }));
    const topicIds = (topicRows || []).map((t: any) => String(t.id));
    const counts = new Map<string, number>();
    if (topicIds.length) {
      for (let i = 0; i < topicIds.length; i += 200) {
        const chunk = topicIds.slice(i, i + 200);
        const { data: qRows, error } = await supabase.from("questions").select("topic_id")
          .eq("subject_id", subjectId).eq("is_published", true).is("archived_at", null).in("topic_id", chunk).limit(10000);
        if (error) throw error;
        for (const row of qRows || []) {
          const key = String(row.topic_id || "");
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
    const items = (modules || []).map((m: any) => ({
      id: String(m.id), title: String(m.title || ""), order_index: m.order_index ?? null,
      topics: (m.topics || []).map((t: any) => ({
        id: String(t.id), title: String(t.title || ""), order_index: t.order_index ?? null,
        count: counts.get(String(t.id)) || 0,
      })).sort((a: any, b: any) => (a.order_index ?? 9999) - (b.order_index ?? 9999) || a.title.localeCompare(b.title, "ru")),
    }));
    return c.json(ok({ items }, rid));
  } catch (error) {
    console.error("[questions:topics]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Темы предмета недоступны", 503, rid);
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
      const normalized = normalizeQuestion({
        type: row.type,
        text: row.text,
        answer: row.answer,
        options: row.options,
      });
      return {
        id: row.id,
        stem: normalized.text,
        text: normalized.text,
        type: normalized.type,
        subject_id: row.subject_id,
        is_closed: normalized.is_closed,
        allow_multiple: normalized.allow_multiple,
        requires_order: normalized.order_indexes.length > 0,
        options: publicOptions(normalized, false).map((option, index) => ({ ...option, index })),
      };
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
    const { data, error } = await supabase.from("questions").select("id,type,text,answer,options,is_published").eq("id", questionId).eq("is_published", true).maybeSingle();
    if (error || !data) {
      const { body: b, status } = fail("NOT_FOUND", "Question not found", 404, rid);
      return c.json(b, status as 404);
    }
    const normalized = normalizeQuestion({
      type: (data as any).type,
      text: (data as any).text,
      answer: (data as any).answer,
      options: (data as any).options,
    }, { extractTextOptions: true });
    const correctSorted = [...normalized.correct_indexes].sort((a, b) => a - b);
    const selectedSorted = [...selected].sort((a, b) => a - b);
    const isCorrect = correctSorted.length
      ? selectedSorted.length === correctSorted.length && selectedSorted.every((v, i) => v === correctSorted[i])
      : null;
    return c.json(ok({
      is_correct: isCorrect,
      correct_indexes: correctSorted,
      correct_keys: normalized.correct_keys,
      answer_display: normalized.answer_display,
    }, rid));
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
    const normalized = normalizeQuestion({
      type: (data as any).type,
      text: (data as any).text,
      answer: (data as any).answer,
      options: (data as any).options,
    }, { extractTextOptions: true });
    const question = {
      ...data,
      stem: normalized.text,
      text: normalized.text,
      type: normalized.type,
      options: publicOptions(normalized, true),
      is_closed: normalized.is_closed,
      closed: normalized.is_closed,
      allow_multiple: normalized.allow_multiple,
      requires_order: normalized.order_indexes.length > 0,
      answer: normalized.answer || null,
      answer_display: normalized.answer_display || "",
      answer_resolution: normalized.resolution,
      correct_keys: normalized.correct_keys,
      correct_indexes: normalized.correct_indexes,
      topic: topic?.title || "",
      subject_name: subject?.name || "",
      subject_slug: subject?.slug || null,
      has_answer: Boolean(String(normalized.answer || "").trim()),
    };
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
