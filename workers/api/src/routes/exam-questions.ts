/**
 * Вопросы к экзамену по предмету — публичный список кафедры, не билеты.
 *
 * Данные лежат в exam_questions и пополняются из методических материалов кафедр
 * (for_exam = true). Здесь только чтение для подготовки: без записи и без
 * выдачи приватных заметок.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const examQuestions = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const MAX_LIMIT = 100;

type Row = {
  id: string;
  text: string;
  answer: string | null;
  topic: string | null;
  kind: string | null;
  type: string | null;
  source: string | null;
};

function clampLimit(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 50;
  return Math.min(Math.floor(value), MAX_LIMIT);
}

function clampOffset(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

examQuestions.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const subject = String(c.req.query("subject") || "").trim();
  const search = String(c.req.query("q") || "").trim().slice(0, 120);
  const topic = String(c.req.query("topic") || "").trim().slice(0, 200);
  const limit = clampLimit(c.req.query("limit") || "");
  const offset = clampOffset(c.req.query("offset") || "");

  if (!subject) {
    const { body, status } = fail("VALIDATION_ERROR", "Укажите предмет", 422, rid);
    return c.json(body, status as 422);
  }

  try {
    let base = db
      .from("exam_questions")
      .select("id,text,answer,topic,kind,type,source", { count: "exact" })
      .eq("subject_slug", subject)
      .eq("for_exam", true)
      .eq("is_published", true);
    if (search) base = base.ilike("text", `%${search}%`);
    // Клиент передаёт агрегированное «Без темы» (пустые/обрывочные topic
    // обнуляются на стороне данных) — фильтр должен ловить null, а не литерал.
    if (topic) base = topic === "Без темы" ? base.is("topic", null) : base.eq("topic", topic);

    const { data, error, count } = await base
      .order("topic", { ascending: true })
      .order("sort_order", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    let topicsQuery = db
      .from("exam_questions")
      .select("topic")
      .eq("subject_slug", subject)
      .eq("for_exam", true)
      .eq("is_published", true)
      .limit(2000);
    if (search) topicsQuery = topicsQuery.ilike("text", `%${search}%`);
    const { data: topicRows, error: topicError } = await topicsQuery;
    if (topicError) throw topicError;

    const counts = new Map<string, number>();
    for (const row of topicRows || []) {
      const key = String(row.topic || "").trim() || "Без темы";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const topics = Array.from(counts, ([title, questionCount]) => ({ topic: title, count: questionCount })).sort(
      (left, right) => right.count - left.count
    );

    const items = ((data || []) as Row[]).map((row) => ({
      id: row.id,
      text: row.text,
      answer: row.answer || null,
      has_answer: Boolean(row.answer && String(row.answer).trim()),
      topic: String(row.topic || "").trim() || null,
      kind: row.kind || null,
      type: row.type || null,
      source: row.source || null,
    }));

    return c.json(
      ok(
        {
          subject,
          items,
          topics,
          total: count ?? items.length,
          pagination: { limit, offset, total: count ?? items.length },
          filters: { q: search || null, topic: topic || null },
        },
        rid
      )
    );
  } catch (error) {
    console.error("[exam-questions:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Вопросы к экзамену временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

/**
 * Полный список вопросов с ответами для выгрузки в документ (фаза 2.7 карты).
 *
 * Генерация детерминированная: банк вопросов кафедры уже содержит ответы, поэтому
 * ИИ здесь не нужен — документ одинаков при каждом скачивании, пока не менялся
 * банк. Файл собирается на клиенте (JSZip), поэтому приватные ответы не попадают
 * в публичный storage и нет дневных квот на «генерацию».
 */
const EXPORT_MAX = 600;

examQuestions.get("/export", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const subject = String(c.req.query("subject") || "").trim();
  if (!subject) {
    const { body, status } = fail("VALIDATION_ERROR", "Укажите предмет", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error, count } = await db
      .from("exam_questions")
      .select("id,text,answer,topic,type,source", { count: "exact" })
      .eq("subject_slug", subject)
      .eq("for_exam", true)
      .eq("is_published", true)
      .order("topic", { ascending: true })
      .order("sort_order", { ascending: true })
      .limit(EXPORT_MAX);
    if (error) throw error;

    const rows = (data || []) as Row[];
    const groups: Array<{ topic: string | null; items: Array<Record<string, unknown>> }> = [];
    const groupIndex = new Map<string, number>();
    let n = 0;
    let answered = 0;
    for (const row of rows) {
      const answer = row.answer && String(row.answer).trim() ? String(row.answer) : null;
      if (answer) answered += 1;
      const topic = String(row.topic || "").trim() || null;
      const key = topic ?? "";
      if (!groupIndex.has(key)) {
        groupIndex.set(key, groups.length);
        groups.push({ topic, items: [] });
      }
      n += 1;
      groups[groupIndex.get(key)!].items.push({
        n,
        text: String(row.text || ""),
        answer,
        type: row.type || null,
        source: row.source || null,
      });
    }

    const total = count ?? rows.length;
    return c.json(
      ok(
        {
          subject,
          generated_at: new Date().toISOString(),
          total,
          returned: rows.length,
          answered,
          // Молча обрезать нельзя — клиент пишет это в документе.
          truncated: total > rows.length,
          groups,
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[exam-questions:export]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось выгрузить вопросы", 503, rid);
    return c.json(body, status as 503);
  }
});

examQuestions.get("/summary", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  try {
    const { data, error } = await db
      .from("exam_questions")
      .select("subject_slug,subject_name")
      .eq("for_exam", true)
      .eq("is_published", true)
      .limit(5000);
    if (error) throw error;
    const counts = new Map<string, { slug: string; name: string; count: number }>();
    for (const row of data || []) {
      const slug = String(row.subject_slug || "").trim();
      if (!slug) continue;
      const entry = counts.get(slug) || { slug, name: String(row.subject_name || slug), count: 0 };
      entry.count += 1;
      counts.set(slug, entry);
    }
    const items = Array.from(counts.values()).sort((left, right) => right.count - left.count);
    return c.json(ok({ items, total: items.reduce((sum, item) => sum + item.count, 0) }, rid));
  } catch (error) {
    console.error("[exam-questions:summary]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Сводка вопросов временно недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

export default examQuestions;
