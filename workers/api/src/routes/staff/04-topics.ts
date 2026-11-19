import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, dbFor, rolesOf, error, notifyManagers } from "./shared";

import { FIX_TABLES, describeValue, isFixTarget } from "../../lib/quickfix";


import type { StaffRouter } from "./types";

export function registerTopicRoutes(staff: StaffRouter) {
staff.post("/topics/merge", requireAuth, async (c) => {
  const rid = requestId();
  const roles = await rolesOf(c).catch((): string[] => []);
  const actorRole = roles.includes("admin") ? "admin" : roles.includes("moderator") ? "moderator" : "";
  if (!actorRole) return error(c, rid, 403, "FORBIDDEN", "Темы объединяет модератор");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const sourceId = String(input.source_topic_id || input.source || "");
  const targetId = String(input.target_topic_id || input.target || "");
  if (!UUID.test(sourceId) || !UUID.test(targetId) || sourceId === targetId) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Нужны разные source_topic_id и target_topic_id");
  }
  const db = dbFor(c);
  const [{ data: source }, { data: target }] = await Promise.all([
    db.from("topics").select("id,title,module_id").eq("id", sourceId).maybeSingle(),
    db.from("topics").select("id,title,module_id").eq("id", targetId).maybeSingle(),
  ]);
  if (!source || !target) return error(c, rid, 404, "NOT_FOUND", "Тема не найдена");
  if (source.module_id && target.module_id && source.module_id !== target.module_id) {
    return error(c, rid, 422, "MODULE_MISMATCH", "Темы из разных модулей: сначала перенесите тему, затем объединяйте");
  }
  const [{ data: tests }, { data: questions }] = await Promise.all([
    db.from("tests").select("id").eq("topic_id", sourceId).limit(1000),
    db.from("questions").select("id").eq("topic_id", sourceId).limit(5000),
  ]);
  const testIds = (tests || []).map((row: any) => row.id);
  const questionIds = (questions || []).map((row: any) => row.id);
  const preview = { source, target, tests: testIds.length, questions: questionIds.length };
  if (input.preview === true || input.dry_run === true) return c.json(ok({ preview, applied: false }, rid));
  if (testIds.length) await db.from("tests").update({ topic_id: targetId }).in("id", testIds);
  if (questionIds.length) await db.from("questions").update({ topic_id: targetId }).in("id", questionIds);
  await db.from("topics").update({ archived_at: new Date().toISOString() }).eq("id", sourceId);
  const { data: action } = await db.from("moderation_actions").insert({
    actor_id: c.get("user").id,
    actor_role: actorRole,
    action: "merge_topics",
    target_type: "topics",
    target_id: targetId,
    before: { source_topic_id: sourceId, test_ids: testIds, question_ids: questionIds },
    after: { target_topic_id: targetId },
    reason: input.reason ? String(input.reason).slice(0, 1000) : `Слияние «${source.title}» → «${target.title}»`,
    revertible_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }).select("*").maybeSingle();
  await notifyManagers(c, "Темы объединены", `${source.title} → ${target.title} (${testIds.length} тестов, ${questionIds.length} вопросов)`, "/admin/moderation");
  return c.json(ok({ preview, applied: true, action }, rid));
});
}
