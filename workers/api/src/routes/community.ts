import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, requireAdmin, type AuthVariables } from "../middleware/auth";

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
    // SA3: у поста показываем автора (имя + факт наличия аватара). Один
    // запрос по списку авторов вместо join на каждый пост; наружу отдаём
    // только имя и признак аватара — не профиль целиком.
    const items = Array.isArray(data) ? [...data] : [];
    const authorIds = [...new Set(items.map((post: any) => String(post.author_id || "")).filter(Boolean))];
    if (authorIds.length) {
      const { data: authors, error: authorsError } = await supabase
        .from("users")
        .select("id,full_name,avatar_key")
        .in("id", authorIds);
      if (authorsError) {
        // Не роняем ленту из-за имён: посты важнее подписи автора.
        console.error("[community:authors]", authorsError);
      } else {
        const byId = new Map((authors || []).map((row: any) => [String(row.id), row]));
        for (const post of items as any[]) {
          const author = byId.get(String(post.author_id || ""));
          post.author_name = author?.full_name || null;
          post.author_has_avatar = Boolean(author?.avatar_key);
        }
      }
    }
    return c.json(ok({ items, group_id: groupId || null }, rid));
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

/**
 * FA5: доступ к посту — тот же, что к ленте: пост группы виден только её
 * участникам, общий пост — всем авторизованным.
 */
async function assertPostAccess(supabase: any, userId: string, postId: string): Promise<{ post?: any; error?: "not_found" | "forbidden" | "db" }> {
  const { data: post, error } = await supabase
    .from("community_posts")
    .select("id,author_id,group_id,title")
    .eq("id", postId)
    .maybeSingle();
  if (error) return { error: "db" };
  if (!post) return { error: "not_found" };
  if (post.group_id) {
    const membership = await assertGroupMember(supabase, userId, String(post.group_id));
    if (membership === "error") return { error: "db" };
    if (membership === "denied") return { error: "forbidden" };
  }
  return { post };
}

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

community.patch("/posts/:id", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const postId = String(c.req.param("id") || "");
  if (!GROUP_ID.test(postId)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID поста", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: { title?: string; body?: string } = {};
  try { payload = await c.req.json(); } catch {}
  const title = String(payload.title || "").trim();
  const text = String(payload.body || "").trim();
  if (!title || !text) {
    const { body, status } = fail("VALIDATION", "Заголовок и текст обязательны", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await supabase
      .from("community_posts")
      .update({ title: title.slice(0, 200), body: text.slice(0, 10000) })
      .eq("id", postId)
      .eq("author_id", user.id)
      .select("id,title,body")
      .maybeSingle();
    if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Не удалось изменить пост", 503, rid); return c.json(body, status as 503); }
    if (!data) { const { body, status } = fail("NOT_FOUND", "Пост не найден (править можно только свой)", 404, rid); return c.json(body, status as 404); }
    return c.json(ok({ post: data }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось изменить пост", 503, rid);
    return c.json(body, status as 503);
  }
});

community.post("/posts/:id/report", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const postId = String(c.req.param("id") || "");
  if (!GROUP_ID.test(postId)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID поста", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: { reason?: string } = {};
  try { payload = await c.req.json(); } catch {}
  const reason = String(payload.reason || "").trim();
  if (!reason) {
    const { body, status } = fail("VALIDATION", "Опишите причину жалобы", 422, rid);
    return c.json(body, status as 422);
  }
  if (reason.length > 500) {
    const { body, status } = fail("VALIDATION", "Причина жалобы длиннее 500 знаков", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const access = await assertPostAccess(supabase, user.id, postId);
    if (access.error === "db") { const { body, status } = fail("DB_UNAVAILABLE", "Не удалось отправить жалобу", 503, rid); return c.json(body, status as 503); }
    if (access.error === "not_found") { const { body, status } = fail("NOT_FOUND", "Пост не найден", 404, rid); return c.json(body, status as 404); }
    if (access.error === "forbidden") { const { body, status } = fail("FORBIDDEN", "Вы не состоите в этой группе", 403, rid); return c.json(body, status as 403); }
    const { data, error } = await supabase
      .from("community_reports")
      .insert({ post_id: postId, reporter_user_id: user.id, reason })
      .select("id,status,created_at")
      .single();
    if (error) {
      // Повторная жалоба того же студента на тот же пост — 409, а не «отправлено».
      if (String((error as any).code || "") === "23505") {
        const { body, status } = fail("ALREADY_REPORTED", "Вы уже отправляли жалобу на этот пост", 409, rid);
        return c.json(body, status as 409);
      }
      console.error("[community:report]", error);
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось отправить жалобу", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ report: data }, rid), 201);
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось отправить жалобу", 503, rid);
    return c.json(body, status as 503);
  }
});

// ── Модерская очередь жалоб (только админ) ────────────────────────────────
community.get("/admin/reports", requireAdmin, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("community_reports")
      .select("id,post_id,reason,status,created_at,resolved_at,community_posts(title,author_id,group_id),users(full_name)")
      .order("status", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Очередь жалоб недоступна", 503, rid); return c.json(body, status as 503); }
    const items = (data || []).map((row: any) => ({
      id: row.id,
      post_id: row.post_id,
      post_title: (Array.isArray(row.community_posts) ? row.community_posts[0]?.title : row.community_posts?.title) || null,
      reporter_name: (Array.isArray(row.users) ? row.users[0]?.full_name : row.users?.full_name) || null,
      reason: row.reason,
      status: row.status,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
    }));
    return c.json(ok({ items }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Очередь жалоб недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

community.patch("/admin/reports/:id", requireAdmin, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const reportId = String(c.req.param("id") || "");
  if (!GROUP_ID.test(reportId)) {
    const { body, status } = fail("VALIDATION", "Некорректный ID жалобы", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: { status?: string } = {};
  try { payload = await c.req.json(); } catch {}
  const status = String(payload.status || "");
  if (!["resolved", "dismissed"].includes(status)) {
    const { body, status } = fail("VALIDATION", "Статус: resolved или dismissed", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await supabase
      .from("community_reports")
      .update({ status, resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq("id", reportId)
      .select("id,status")
      .maybeSingle();
    if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Не удалось обновить жалобу", 503, rid); return c.json(body, status as 503); }
    if (!data) { const { body, status } = fail("NOT_FOUND", "Жалоба не найдена", 404, rid); return c.json(body, status as 404); }
    return c.json(ok({ report: data }, rid));
  } catch {
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось обновить жалобу", 503, rid);
    return c.json(body, status as 503);
  }
});

export default community;
