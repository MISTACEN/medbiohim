import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, dbFor, gate, jsonBody, responseError } from "./shared";
import type { ParityApp } from "./shared";

export function registerCommunity(parity: ParityApp) {
// Administrative community moderation. The live schema has is_deleted but no pin column;
// pinning is rejected explicitly rather than pretending a non-persistent change succeeded.
parity.get("/community", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  const db = dbFor(c);
  try {
    const { data, error } = await db.from("community_posts")
      .select("id,title,body,author_id,created_at,updated_at,is_deleted,tag")
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    const ids = [...new Set((data || []).map((x: any) => x.author_id).filter(Boolean))];
    let userMap: Record<string, any> = {};
    if (ids.length) {
      const { data: users, error: usersError } = await db.from("users").select("id,full_name,email").in("id", ids);
      if (usersError) throw usersError;
      userMap = Object.fromEntries((users || []).map((u: any) => [String(u.id), u]));
    }
    return c.json(ok({ items: (data || []).map((p: any) => ({
      ...p, author_name: userMap[String(p.author_id)]?.full_name || userMap[String(p.author_id)]?.email || "Студент",
      hidden: Boolean(p.is_deleted), pinned: false,
    })) }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить публикации");
  }
});

parity.patch("/community/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  const id = c.req.param("id") || "";
  const input = await jsonBody(c);
  if (!UUID.test(id) || !input) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID или JSON");
  if (Object.prototype.hasOwnProperty.call(input, "pinned")) {
    return responseError(c, rid, 422, "PINNING_NOT_SUPPORTED", "В схеме community_posts нет поля закрепления; сначала нужна миграция схемы");
  }
  if (typeof input.hidden !== "boolean") return responseError(c, rid, 422, "VALIDATION_ERROR", "Поддерживается только изменение hidden");
  try {
    const { data, error } = await dbFor(c).from("community_posts").update({ is_deleted: input.hidden })
      .eq("id", id).select("id,is_deleted").maybeSingle();
    if (error) throw error;
    if (!data) return responseError(c, rid, 404, "NOT_FOUND", "Публикация не найдена");
    return c.json(ok({ id, hidden: Boolean(data.is_deleted), pinned: false }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось обновить публикацию");
  }
});

parity.delete("/community/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID публикации");
  try {
    const { data, error } = await dbFor(c).from("community_posts").update({ is_deleted: true })
      .eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return responseError(c, rid, 404, "NOT_FOUND", "Публикация не найдена");
    return c.json(ok({ deleted: true, id }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось скрыть публикацию");
  }
});
}
