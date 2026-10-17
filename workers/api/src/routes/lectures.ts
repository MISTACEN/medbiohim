import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const lectures = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

lectures.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const subject = c.req.query("subject_id") || c.req.query("subject_slug") || c.req.query("subject");
  try {
    let q = supabase
      .from("histology_lectures")
      .select("id,subject_slug,specialty_scope,title,kind,prep_names,linked_prep_ids,body_markdown,description_algorithm_ref,is_published,created_at,updated_at")
      .eq("is_published", true)
      .order("created_at", { ascending: true })
      .limit(300);
    if (subject) {
      if (/^[0-9a-f-]{36}$/i.test(subject)) {
        const { data: subjectRow } = await supabase.from("subjects").select("slug").eq("id", subject).maybeSingle();
        if (!subjectRow?.slug) return c.json(ok({ items: [] }, rid));
        q = q.eq("subject_slug", subjectRow.slug);
      } else {
        q = q.eq("subject_slug", subject);
      }
    }
    const { data, error } = await q;
    if (error) {
      console.error("[lectures:list]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Лекции недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch (error) {
    console.error("[lectures:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Лекции недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

lectures.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id") || "";
  try {
    const { data, error } = await supabase
      .from("histology_lectures")
      .select("id,subject_slug,specialty_scope,title,kind,prep_names,linked_prep_ids,body_markdown,description_algorithm_ref,is_published,created_at,updated_at")
      .eq("id", id)
      .eq("is_published", true)
      .maybeSingle();
    if (error) {
      console.error("[lectures:detail]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Лекция недоступна", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Лекция не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok(data, rid));
  } catch (error) {
    console.error("[lectures:detail]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Лекция недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

export default lectures;
