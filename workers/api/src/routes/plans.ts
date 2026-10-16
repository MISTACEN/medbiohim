import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const plans = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

plans.get("/subjects-catalog", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("subjects")
      .select("id,slug,name,short_name,course_number,semester,specialty_slug,control_type,credits,total_hours,color_hex")
      .eq("is_active", true)
      .limit(300);
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Каталог недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    const items = (data || []).map((item) => ({ ...item, title: item.short_name || item.name, course: item.course_number }));
    return c.json(ok({ items }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Каталог недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

plans.get("/subject-plans", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase.from("subject_plans").select("slug,title,subject_slug").limit(200);
    if (error) return c.json(ok({ items: [] }, rid));
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    return c.json(ok({ items: [] }, rid));
  }
});

plans.get("/subject-plans/:slug", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const slug = c.req.param("slug");
  try {
    const { data, error } = await supabase.from("subject_plans").select("*").eq("slug", slug).maybeSingle();
    if (error || !data) {
      const { body, status } = fail("NOT_FOUND", "План не найден", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "План недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

plans.get("/subject-materials", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const subject = c.req.query("subject_id") || c.req.query("subject_slug");
  try {
    let q = supabase.from("materials").select("id,title,type,subject_id,module_id,topic_id,file_id,external_url,content_html,source_key,order_index,is_published,created_at").eq("is_published", true).limit(200);
    if (subject) {
      if (/^[0-9a-f-]{36}$/i.test(subject)) q = q.eq("subject_id", subject);
      else {
        const { data: subjectRow } = await supabase.from("subjects").select("id").eq("slug", subject).maybeSingle();
        if (subjectRow?.id) q = q.eq("subject_id", subjectRow.id);
        else return c.json(ok({ items: [] }, rid));
      }
    }
    const { data, error } = await q;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Материалы недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Материалы недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

export default plans;
