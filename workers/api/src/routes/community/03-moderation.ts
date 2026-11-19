import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { assertPostAccess, GROUP_ID } from "./shared";

import type { CommunityRouter } from "./types";

export function registerModerationRoutes(community: CommunityRouter) {
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
}
