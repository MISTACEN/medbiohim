import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const materials = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

materials.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const subjectId = c.req.query("subject_id");
  try {
    let q = supabase
      .from("materials")
      .select("id,title,subject_id,type,slug,summary,published_at")
      .order("published_at", { ascending: false })
      .limit(300);
    if (subjectId) q = q.eq("subject_id", subjectId);
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

materials.get("/:id", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  try {
    const { data, error } = await supabase.from("materials").select("*").eq("id", id).maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Материал недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Материал не найден", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Материал недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

materials.get("/:id/file-url", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  try {
    const { data, error } = await supabase
      .from("materials")
      .select("id,file_url,object_key,storage_mode")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      const { body, status } = fail("NOT_FOUND", "Файл не найден", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(
      ok(
        {
          url: data.file_url || null,
          mode: data.storage_mode || (data.file_url ? "public" : "proxy"),
          object_key: data.object_key || null,
        },
        rid
      )
    );
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Файл недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

materials.get("/:id/file", requireAuth, async (c) => {
  const rid = requestId();
  // Binary proxy placeholder — needs object store binding (R2 / Upstash Blob) in production
  const { body, status } = fail(
    "NOT_CONFIGURED",
    "Выдача бинарных файлов потребует привязки object storage (R2 / Upstash Blob)",
    501,
    rid
  );
  return c.json(body, status as 501);
});

export default materials;
