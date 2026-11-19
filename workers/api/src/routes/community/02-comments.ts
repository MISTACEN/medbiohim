import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { assertPostAccess, GROUP_ID } from "./shared";

import type { CommunityRouter } from "./types";

export function registerCommentRoutes(community: CommunityRouter) {
community.get("/posts/:id/comments", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const postId = String(c.req.param("id") || "");
  if (!GROUP_ID.test(postId)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID поста", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const access = await assertPostAccess(supabase, user.id, postId);
    if (access.error === "db") { const { body, status } = fail("DB_UNAVAILABLE", "Комментарии недоступны", 503, rid); return c.json(body, status as 503); }
    if (access.error === "not_found") { const { body, status } = fail("NOT_FOUND", "Пост не найден", 404, rid); return c.json(body, status as 404); }
    if (access.error === "forbidden") { const { body, status } = fail("FORBIDDEN", "Вы не состоите в этой группе", 403, rid); return c.json(body, status as 403); }
    const { data, error } = await supabase
      .from("community_comments")
      .select("id,post_id,user_id,body,created_at,updated_at,users(full_name)")
      .eq("post_id", postId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Комментарии недоступны", 503, rid); return c.json(body, status as 503); }
    const items = (data || []).map((row: any) => ({
      id: row.id,
      post_id: row.post_id,
      user_id: row.user_id,
      author_name: Array.isArray(row.users) ? row.users[0]?.full_name || null : row.users?.full_name || null,
      body: row.body,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
    return c.json(ok({ items }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Комментарии недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

community.post("/posts/:id/comments", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const postId = String(c.req.param("id") || "");
  if (!GROUP_ID.test(postId)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID поста", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: { body?: string } = {};
  try { payload = await c.req.json(); } catch {}
  const text = String(payload.body || "").trim();
  if (!text) {
    const { body, status } = fail("VALIDATION", "Комментарий не может быть пустым", 422, rid);
    return c.json(body, status as 422);
  }
  if (text.length > 2000) {
    const { body, status } = fail("VALIDATION", "Комментарий длиннее 2000 знаков", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const access = await assertPostAccess(supabase, user.id, postId);
    if (access.error === "db") { const { body, status } = fail("DB_UNAVAILABLE", "Не удалось прокомментировать", 503, rid); return c.json(body, status as 503); }
    if (access.error === "not_found") { const { body, status } = fail("NOT_FOUND", "Пост не найден", 404, rid); return c.json(body, status as 404); }
    if (access.error === "forbidden") { const { body, status } = fail("FORBIDDEN", "Вы не состоите в этой группе", 403, rid); return c.json(body, status as 403); }
    const { data, error } = await supabase
      .from("community_comments")
      .insert({ post_id: postId, user_id: user.id, body: text })
      .select("id,post_id,user_id,body,created_at")
      .single();
    if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Не удалось прокомментировать", 503, rid); return c.json(body, status as 503); }
    return c.json(ok({ comment: { ...data, author_name: (user as any).user_metadata?.full_name || null } }, rid), 201);
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось прокомментировать", 503, rid);
    return c.json(body, status as 503);
  }
});

community.patch("/posts/:id/comments/:commentId", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const commentId = String(c.req.param("commentId") || "");
  if (!GROUP_ID.test(commentId)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID комментария", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: { body?: string } = {};
  try { payload = await c.req.json(); } catch {}
  const text = String(payload.body || "").trim();
  if (!text) {
    const { body, status } = fail("VALIDATION", "Комментарий не может быть пустым", 422, rid);
    return c.json(body, status as 422);
  }
  if (text.length > 2000) {
    const { body, status } = fail("VALIDATION", "Комментарий длиннее 2000 знаков", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await supabase
      .from("community_comments")
      .update({ body: text, updated_at: new Date().toISOString() })
      .eq("id", commentId)
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .select("id,body,updated_at")
      .maybeSingle();
    if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Не удалось изменить комментарий", 503, rid); return c.json(body, status as 503); }
    if (!data) { const { body, status } = fail("NOT_FOUND", "Комментарий не найден (править можно только свой)", 404, rid); return c.json(body, status as 404); }
    return c.json(ok({ comment: data }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось изменить комментарий", 503, rid);
    return c.json(body, status as 503);
  }
});

community.delete("/posts/:id/comments/:commentId", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const commentId = String(c.req.param("commentId") || "");
  if (!GROUP_ID.test(commentId)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID комментария", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await supabase
      .from("community_comments")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", commentId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Не удалось удалить комментарий", 503, rid); return c.json(body, status as 503); }
    if (!data) { const { body, status } = fail("NOT_FOUND", "Комментарий не найден (удалять можно только свой)", 404, rid); return c.json(body, status as 404); }
    return c.json(ok({ deleted: true, id: commentId }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось удалить комментарий", 503, rid);
    return c.json(body, status as 503);
  }
});
}
