import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const search = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

search.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const q = (c.req.query("q") || c.req.query("query") || "").trim().slice(0, 160);
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 20), 1), 50);
  const subjectSlug = c.req.query("subject_slug")?.trim().toLowerCase();
  const type = c.req.query("type");
  if (![undefined, "all", "questions", "lectures", "materials"].includes(type)) {
    const { body, status } = fail("VALIDATION_ERROR", "Неизвестный тип поиска", 422, rid);
    return c.json(body, status as 422);
  }
  if (!q || q.length < 2) return c.json(ok({ items: [], query: q, total: 0, facets: { subjects: [], types: {} } }, rid));

  try {
    const results: any[] = [];
    if (!type || type === "all" || type === "questions") {
      let subjectId = "";
      if (subjectSlug) {
        const { data: subjects, error } = await db.from("subjects").select("id").eq("slug", subjectSlug).eq("is_active", true).limit(2);
        if (error) throw error;
        if ((subjects || []).length > 1) {
          const { body, status } = fail("AMBIGUOUS_SUBJECT", "По указанному предмету есть несколько совпадений", 409, rid);
          return c.json(body, status as 409);
        }
        subjectId = String(subjects?.[0]?.id || "");
      }
      if (!subjectSlug || subjectId) {
        let query = db.from("questions").select("id,text,answer,subject_id,type,topic_id,subjects(name,slug),topics(title)").eq("is_published", true).ilike("text", `%${q}%`).limit(limit);
        if (subjectId) query = query.eq("subject_id", subjectId);
        const { data, error } = await query;
        if (error) throw error;
        for (const row of data || []) {
          const subject = Array.isArray((row as any).subjects) ? (row as any).subjects[0] : (row as any).subjects;
          const text = String((row as any).text || "");
          const topic = Array.isArray((row as any).topics) ? (row as any).topics[0] : (row as any).topics;
          results.push({ type: "question", id: (row as any).id, title: text.slice(0, 160), subject: subject?.name || "", subject_slug: subject?.slug || null, topic: topic?.title || "", snippet: text.slice(0, 200), has_answer: Boolean(String((row as any).answer || "").trim()), answer: (row as any).answer || undefined, href: "/practice", score: 1 });
        }
      }
    }
    if (!type || type === "all" || type === "lectures") {
      let query = db.from("histology_lectures").select("id,title,description_algorithm_ref,body_markdown,subject_slug").eq("is_published", true).ilike("title", `%${q}%`).limit(limit);
      if (subjectSlug) query = query.eq("subject_slug", subjectSlug);
      const { data, error } = await query;
      if (error) throw error;
      for (const row of data || []) results.push({ type: "lecture", id: row.id, title: row.title, slug: row.id, subject: row.subject_slug || "", subject_slug: row.subject_slug, topic: "", snippet: String(row.description_algorithm_ref || row.body_markdown || "").slice(0, 200), has_answer: false, href: "/lectures", score: 1 });
    }
    if (!type || type === "all" || type === "materials") {
      let query = db.from("materials").select("id,title,subject_id,subjects(name,slug)").eq("is_published", true).ilike("title", `%${q}%`).limit(limit);
      if (subjectSlug) {
        const { data: subjects, error } = await db.from("subjects").select("id").eq("slug", subjectSlug).eq("is_active", true).limit(2);
        if (error) throw error;
        if ((subjects || []).length > 1) {
          const { body, status } = fail("AMBIGUOUS_SUBJECT", "По указанному предмету есть несколько совпадений", 409, rid);
          return c.json(body, status as 409);
        }
        const subjectId = String(subjects?.[0]?.id || "");
        if (!subjectId) return c.json(ok({ items: [], query: q, total: 0, facets: { subjects: [], types: {} } }, rid));
        query = query.eq("subject_id", subjectId);
      }
      const { data, error } = await query;
      if (error) throw error;
      for (const row of data || []) {
        const subject = Array.isArray((row as any).subjects) ? (row as any).subjects[0] : (row as any).subjects;
        results.push({ type: "material", id: (row as any).id, title: (row as any).title, subject: subject?.name || "", subject_slug: subject?.slug || null, topic: "", snippet: (row as any).title, has_answer: false, href: "/materials", score: 1 });
      }
    }
    const items = results.slice(0, limit);
    const subjectCounts = new Map<string, { subject: string; subject_slug: string; count: number }>();
    const typeCounts: Record<string, number> = {};
    for (const result of results) {
      typeCounts[result.type] = (typeCounts[result.type] || 0) + 1;
      if (result.subject_slug) {
        const current = subjectCounts.get(result.subject_slug) || { subject: result.subject || result.subject_slug, subject_slug: result.subject_slug, count: 0 };
        current.count++;
        subjectCounts.set(result.subject_slug, current);
      }
    }
    return c.json(ok({ items, query: q, total: results.length, facets: { subjects: [...subjectCounts.values()], types: typeCounts } }, rid));
  } catch (error) {
    console.error("[search]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Поиск временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

export default search;
