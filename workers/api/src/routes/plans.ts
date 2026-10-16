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
      .select("id,slug,name,title,course,semester,specialty_slug")
      .eq("is_active", true)
      .limit(300);
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Каталог недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [] }, rid));
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
    let q = supabase.from("materials").select("id,title,type,subject_id,slug").limit(200);
    if (subject) {
      if (/^[0-9a-f-]{36}$/i.test(subject)) q = q.eq("subject_id", subject);
      else q = q.eq("subject_slug", subject);
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
