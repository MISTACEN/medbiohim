import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const progress = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

progress.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const [subjects, topics] = await Promise.all([
      supabase
        .from("user_subject_progress")
        .select("user_id,subject_id,percent,completed_topics_count,last_activity_at,updated_at")
        .eq("user_id", user.id)
        .limit(200),
      supabase
        .from("user_topic_progress")
        .select("user_id,topic_id,status,percent,last_activity_at")
        .eq("user_id", user.id)
        .limit(500),
    ]);
    if (subjects.error && topics.error) {
      console.error("[progress:read]", { subjectError: subjects.error.message, topicError: topics.error.message });
      const { body, status } = fail("DB_UNAVAILABLE", "Прогресс недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({
      items: subjects.data || [],
      topics: topics.data || [],
      summary: {
        subjects_count: (subjects.data || []).length,
        topics_count: (topics.data || []).length,
        completed_topics_count: (subjects.data || []).reduce((sum, row) => sum + Number(row.completed_topics_count || 0), 0),
      },
    }, rid));
  } catch (error) {
    console.error("[progress:read]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Прогресс недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

export default progress;
