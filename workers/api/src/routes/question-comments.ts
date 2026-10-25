/**
 * Комментарии к вопросам «Базы вопросов» (перенос фичи старого физического
 * портала: обсуждение под каждым вопросом, роли и модерация).
 *
 * GET    /questions/:questionId/comments  — список (только авторизованные)
 * POST   /questions/:questionId/comments  — создать свой комментарий
 * DELETE /questions/comments/:commentId   — удалить свой комментарий
 *
 * Таблица `question_comments` защищена RLS: select для authenticated,
 * insert/update/delete — только своих строк. Админ-модерация — через
 * сервисный ключ.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const questionComments = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FIELDS = "id,question_id,user_id,body,created_at,users(display_name,avatar_url)";

questionComments.get("/:questionId/comments", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const questionId = String(c.req.param("questionId") || "");
  if (!UUID.test(questionId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID вопроса", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await supabase
      .from("question_comments")
      .select(FIELDS)
      .eq("question_id", questionId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    const items = (data || []).map((row: any) => {
      const profile = Array.isArray(row.users) ? row.users[0] : row.users;
      return {
        id: row.id,
        question_id: row.question_id,
        user_id: row.user_id,
        body: row.body,
        created_at: row.created_at,
        author_name: profile?.display_name || "Студент",
        author_avatar: profile?.avatar_url || null,
      };
    });
    return c.json(ok({ items }, rid));
  } catch (error) {
    console.error("[question-comments:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Комментарии временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

questionComments.post("/:questionId/comments", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const questionId = String(c.req.param("questionId") || "");
  if (!UUID.test(questionId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID вопроса", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: any = {};
  try {
    payload = await c.req.json();
  } catch {}
  const text = String(payload?.body ?? payload?.text ?? "").trim();
  if (!text || text.length > 2000) {
    const { body, status } = fail("VALIDATION_ERROR", "Комментарий: от 1 до 2000 символов", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await supabase
      .from("question_comments")
      .insert({ question_id: questionId, user_id: user.id, body: text })
      .select(FIELDS)
      .single();
    if (error) throw error;
    return c.json(
      ok(
        {
          item: {
            id: data.id,
            question_id: data.question_id,
            user_id: data.user_id,
            body: data.body,
            created_at: data.created_at,
            author_name: (Array.isArray(data.users) ? data.users[0] : data.users)?.display_name || "Студент",
            author_avatar: (Array.isArray(data.users) ? data.users[0] : data.users)?.avatar_url || null,
          },
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[question-comments:create]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить комментарий", 503, rid);
    return c.json(body, status as 503);
  }
});

questionComments.delete("/comments/:commentId", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const commentId = String(c.req.param("commentId") || "");
  if (!UUID.test(commentId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный ID комментария", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    // Мягкое удаление своей строки; RLS не даст чужую.
    const { data, error } = await supabase
      .from("question_comments")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", commentId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Комментарий не найден или это не ваш", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok({ deleted: true }, rid));
  } catch (error) {
    console.error("[question-comments:delete]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось удалить комментарий", 503, rid);
    return c.json(body, status as 503);
  }
});

export default questionComments;
