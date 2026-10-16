import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const lectures = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

lectures.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const subjectId = c.req.query("subject_id");
  try {
    let q = supabase.from("lectures").select("id,title,subject_id,slug,summary,published_at,order_index").order("order_index", { ascending: true }).limit(300);
    if (subjectId) q = q.eq("subject_id", subjectId);
    const { data, error } = await q;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Лекции недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Лекции недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

lectures.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  try {
    const isUuid = /^[0-9a-f-]{36}$/i.test(id);
    let q = supabase.from("lectures").select("*").limit(1);
    q = isUuid ? q.eq("id", id) : q.eq("slug", id);
    const { data, error } = await q.maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Лекция недоступна", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Лекция не найдена", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Лекция недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

export default lectures;
