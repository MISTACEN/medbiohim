import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const community = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * Проверка членства в группе. Клиент присылает group_id из profile, но верить
 * ему нельзя: обсуждения учебной группы видны только её участникам.
 */
async function assertGroupMember(supabase: any, userId: string, groupId: string) {
  const { data, error } = await supabase
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return "error" as const;
  return data ? ("member" as const) : ("denied" as const);
}

const GROUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

community.get("/posts", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const user = c.get("user");
  // Раньше group_id из UI молча игнорировался, и «обсуждения группы» были общей лентой.
  const groupId = (c.req.query("group_id") || "").trim();
  if (groupId && !GROUP_ID.test(groupId)) {
    const { body, status } = fail("VALIDATION", "Некорректный group_id", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    if (groupId) {
      const membership = await assertGroupMember(supabase, user.id, groupId);
      if (membership === "error") {
        const { body, status } = fail("DB_UNAVAILABLE", "Сообщество недоступно", 503, rid);
        return c.json(body, status as 503);
      }
      if (membership === "denied") {
        const { body, status } = fail("FORBIDDEN", "Вы не состоите в этой группе", 403, rid);
        return c.json(body, status as 403);
      }
    }
    let query = supabase
      .from("community_posts")
      .select("id,title,body,author_id,created_at,group_id")
      .order("created_at", { ascending: false })
      .limit(50);
    // Без выбранной группы показываем только общую ленту, а не посты чужих групп.
    query = groupId ? query.eq("group_id", groupId) : query.is("group_id", null);
    const { data, error } = await query;
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Сообщество недоступно", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [], group_id: groupId || null }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Сообщество недоступно", 503, rid);
    return c.json(body, status as 503);
  }
});

community.post("/posts", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: { title?: string; body?: string; group_id?: string } = {};
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const targetGroup = String(payload.group_id || "").trim();
  if (targetGroup && !GROUP_ID.test(targetGroup)) {
    const { body, status } = fail("VALIDATION", "Некорректный group_id", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    if (targetGroup) {
      const membership = await assertGroupMember(supabase, user.id, targetGroup);
      if (membership === "error") {
        const { body, status } = fail("DB_UNAVAILABLE", "Не удалось опубликовать", 503, rid);
        return c.json(body, status as 503);
      }
      if (membership === "denied") {
        const { body, status } = fail("FORBIDDEN", "Вы не состоите в этой группе", 403, rid);
        return c.json(body, status as 403);
      }
    }
    const { data, error } = await supabase
      .from("community_posts")
      .insert({
        author_id: user.id,
        title: String(payload.title || "").slice(0, 200),
        body: String(payload.body || "").slice(0, 10000),
        group_id: targetGroup || null,
      })
      .select("id,title,created_at")
      .maybeSingle();
    if (error) {
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось опубликовать", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось опубликовать", 503, rid);
    return c.json(body, status as 503);
  }
});

export default community;
