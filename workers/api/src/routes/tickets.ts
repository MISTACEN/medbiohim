import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const tickets = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

tickets.get("/", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const { data, error } = await c.get("supabase")
      .from("tickets")
      .select("id,subject_id,title,questions,is_published,created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) {
      console.error("[tickets:list]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Билеты недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    const items = (data || []).map((ticket) => ({
      ...ticket,
      question_count: Array.isArray(ticket.questions) ? ticket.questions.length : 0,
    }));
    return c.json(ok({ items }, rid));
  } catch (error) {
    console.error("[tickets:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Билеты недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

tickets.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const { data, error } = await c.get("supabase")
      .from("tickets")
      .select("id,subject_id,title,questions,is_published,created_at")
      .eq("id", c.req.param("id") || "")
      .eq("is_published", true)
      .maybeSingle();
    if (error) {
      console.error("[tickets:detail]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Билет недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Билет не найден", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok({
      ...data,
      question_count: Array.isArray(data.questions) ? data.questions.length : 0,
    }, rid));
  } catch (error) {
    console.error("[tickets:detail]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Билет недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

export default tickets;
