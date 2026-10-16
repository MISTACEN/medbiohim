import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const subjects = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

subjects.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const course = c.req.query("course");
  const semester = c.req.query("semester");

  try {
    let q = supabase.from("subjects").select("id,slug,name,title,course,semester,specialty_slug,is_active").eq("is_active", true).limit(200);
    if (course) q = q.eq("course", Number(course));
    if (semester) q = q.eq("semester", Number(semester));

    const { data, error } = await q;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Каталог предметов недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [], total: (data || []).length }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Каталог предметов недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

subjects.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id") || "";

  try {
    const isUuid = /^[0-9a-f-]{36}$/i.test(id);
    let q = supabase.from("subjects").select("*, modules(*)").limit(1);
    q = isUuid ? q.eq("id", id) : q.eq("slug", id);

    const { data, error } = await q.maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Предмет недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Предмет не найден", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Предмет недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

export default subjects;
