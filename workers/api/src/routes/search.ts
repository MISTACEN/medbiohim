import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const search = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

search.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const q = (c.req.query("q") || c.req.query("query") || "").trim();
  const limit = Math.min(Number(c.req.query("limit") || 20), 50);
  const subjectSlug = c.req.query("subject_slug");
  const type = c.req.query("type"); // questions | lectures | materials | all

  if (!q || q.length < 2) {
    return c.json(ok({ items: [], query: q, facets: {} }, rid));
  }

  try {
    const results: any[] = [];

    if (!type || type === "all" || type === "questions") {
      let qq = supabase
        .from("questions")
        .select("id,stem,subject_slug,type")
        .eq("is_published", true)
        .ilike("stem", `%${q}%`)
        .limit(limit);
      if (subjectSlug) qq = qq.eq("subject_slug", subjectSlug);
      const { data } = await qq;
      for (const row of data || []) {
        results.push({
          type: "question",
          id: row.id,
          title: row.stem?.slice(0, 160),
          subject_slug: row.subject_slug,
          snippet: row.stem?.slice(0, 200),
        });
      }
    }

    if (!type || type === "all" || type === "lectures") {
      const { data } = await supabase
        .from("lectures")
        .select("id,title,summary,slug")
        .or(`title.ilike.%${q}%,summary.ilike.%${q}%`)
        .limit(limit);
      for (const row of data || []) {
        results.push({
          type: "lecture",
          id: row.id,
          title: row.title,
          slug: row.slug,
          snippet: row.summary?.slice(0, 200),
        });
      }
    }

    if (!type || type === "all" || type === "materials") {
      const { data } = await supabase
        .from("materials")
        .select("id,title,summary,slug")
        .or(`title.ilike.%${q}%,summary.ilike.%${q}%`)
        .limit(limit);
      for (const row of data || []) {
        results.push({
          type: "material",
          id: row.id,
          title: row.title,
          slug: row.slug,
          snippet: row.summary?.slice(0, 200),
        });
      }
    }

    return c.json(
      ok(
        {
          items: results.slice(0, limit),
          query: q,
          total: results.length,
          facets: {
            questions: results.filter((r) => r.type === "question").length,
            lectures: results.filter((r) => r.type === "lecture").length,
            materials: results.filter((r) => r.type === "material").length,
          },
        },
        rid
      )
    );
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Поиск временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

export default search;
