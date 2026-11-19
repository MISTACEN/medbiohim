import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, MANAGERS, dbFor, rolesOf, error, notifyManagers, readTarget, recordContentVersion } from "./shared";

import { FIX_TABLES, describeValue, isFixTarget, pickChanges, validateFixPatch } from "../../lib/quickfix";
import type { FixTarget } from "../../lib/quickfix";

import type { StaffRouter } from "./types";

export function registerFixRoutes(staff: StaffRouter) {
staff.post("/fixes/preview", requireAuth, async (c) => {
  const rid = requestId();
  const roles = await rolesOf(c).catch((): string[] => []);
  if (!roles.some((role) => MANAGERS.includes(role))) return error(c, rid, 403, "FORBIDDEN", "Быстрые фиксы доступны модераторам");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const target = input.target || input.table;
  if (!isFixTarget(target)) return error(c, rid, 422, "VALIDATION_ERROR", "Неизвестная таблица");
  const patch = input.patch && typeof input.patch === "object" ? input.patch : {};
  const invalid = validateFixPatch(target, patch);
  if (invalid) return error(c, rid, 422, "VALIDATION_ERROR", invalid);
  try {
    const { row, error: readError } = await readTarget(c, target, String(input.id || ""));
    if (readError || !row) return error(c, rid, readError === "Некорректный идентификатор" ? 422 : 404, readError === "Некорректный идентификатор" ? "VALIDATION_ERROR" : "NOT_FOUND", readError || "Запись не найдена");
    const changes = pickChanges(target, row, patch);
    return c.json(ok({
      target,
      id: row.id,
      changes,
      requires_confirmation: changes.length > 0,
      message: changes.length ? `Изменится полей: ${changes.length}` : "Изменений нет",
    }, rid));
  } catch {
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось построить предпросмотр");
  }
});

staff.post("/fixes/apply", requireAuth, async (c) => {
  const rid = requestId();
  const roles = await rolesOf(c).catch((): string[] => []);
  const actorRole = roles.includes("admin") ? "admin" : roles.includes("moderator") ? "moderator" : "";
  if (!actorRole) return error(c, rid, 403, "FORBIDDEN", "Быстрые фиксы доступны модераторам");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const target = input.target || input.table;
  if (!isFixTarget(target)) return error(c, rid, 422, "VALIDATION_ERROR", "Неизвестная таблица");
  const patch = input.patch && typeof input.patch === "object" ? input.patch : {};
  const invalid = validateFixPatch(target, patch);
  if (invalid) return error(c, rid, 422, "VALIDATION_ERROR", invalid);
  const db = dbFor(c);
  try {
    const { row, error: readError } = await readTarget(c, target, String(input.id || ""));
    if (readError || !row) return error(c, rid, readError === "Некорректный идентификатор" ? 422 : 404, readError === "Некорректный идентификатор" ? "VALIDATION_ERROR" : "NOT_FOUND", readError || "Запись не найдена");
    const changes = pickChanges(target, row, patch);
    if (!changes.length) return error(c, rid, 422, "NO_CHANGES", "Изменений нет");
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const change of changes) { before[change.field] = change.before; after[change.field] = change.after; }
    const { error: updateError } = await db.from(FIX_TABLES[target]).update(after).eq("id", row.id);
    if (updateError) throw updateError;
    await recordContentVersion(c, FIX_TABLES[target], String(row.id), row, c.get("user").id, "staff_quickfix");
    const { data: action, error: actionError } = await db.from("moderation_actions").insert({
      actor_id: c.get("user").id,
      actor_role: actorRole,
      action: "quick_fix",
      target_type: target,
      target_id: row.id,
      before,
      after,
      reason: input.reason ? String(input.reason).slice(0, 1000) : null,
      revertible_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).select("*").maybeSingle();
    if (actionError) console.error("[staff:quickfix-action]", actionError);
    await notifyManagers(c, "Быстрый фикс применён",
      `${target}: ${changes.map((change) => `${change.label} ${describeValue(change.before)} → ${describeValue(change.after)}`).join("; ")}`,
      "/admin/moderation");
    return c.json(ok({ action, changes, revertible_until: action?.revertible_until ?? null }, rid));
  } catch (applyError) {
    console.error("[staff:quickfix]", applyError);
    return error(c, rid, 503, "FIX_FAILED", "Не удалось применить фикс");
  }
});

staff.get("/fixes", requireAuth, async (c) => {
  const rid = requestId();
  const roles = await rolesOf(c).catch((): string[] => []);
  if (!roles.some((role) => MANAGERS.includes(role))) return error(c, rid, 403, "FORBIDDEN", "Журнал доступен модераторам");
  const { data, error: readError } = await dbFor(c).from("moderation_actions")
    .select("*").order("created_at", { ascending: false }).limit(100);
  if (readError) return error(c, rid, 503, "DB_UNAVAILABLE", "Журнал фиксов недоступен");
  return c.json(ok({ items: data || [] }, rid));
});

staff.post("/fixes/:id/revert", requireAuth, async (c) => {
  const rid = requestId();
  const roles = await rolesOf(c).catch((): string[] => []);
  if (!roles.some((role) => MANAGERS.includes(role))) return error(c, rid, 403, "FORBIDDEN", "Откат доступен модераторам");
  const actionId = c.req.param("id") || "";
  if (!UUID.test(actionId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const db = dbFor(c);
  const { data: action } = await db.from("moderation_actions").select("*").eq("id", actionId).maybeSingle();
  if (!action) return error(c, rid, 404, "NOT_FOUND", "Действие не найдено");
  if (action.reverted_at) return error(c, rid, 409, "ALREADY_REVERTED", "Действие уже отменено");
  if (Date.parse(String(action.revertible_until)) < Date.now()) return error(c, rid, 409, "REVERT_WINDOW_EXPIRED", "Окно отката (24 часа) истекло");
  if (!isFixTarget(action.target_type)) return error(c, rid, 422, "VALIDATION_ERROR", "У действия нет отката");
  const before = action.before && typeof action.before === "object" ? action.before : {};
  if (!Object.keys(before).length) return error(c, rid, 422, "VALIDATION_ERROR", "Нет данных для отката");
  try {
    if (action.action === "merge_topics") {
      const moved = before as { test_ids?: string[]; question_ids?: string[]; source_topic_id?: string };
      if (Array.isArray(moved.test_ids) && moved.test_ids.length) {
        await db.from("tests").update({ topic_id: moved.source_topic_id }).in("id", moved.test_ids);
      }
      if (Array.isArray(moved.question_ids) && moved.question_ids.length) {
        await db.from("questions").update({ topic_id: moved.source_topic_id }).in("id", moved.question_ids);
      }
      if (moved.source_topic_id) await db.from("topics").update({ archived_at: null }).eq("id", moved.source_topic_id);
    } else {
      const fixTarget = action.target_type as FixTarget;
      const { error: revertError } = await db.from(FIX_TABLES[fixTarget]).update(before).eq("id", action.target_id);
      if (revertError) throw revertError;
    }
    const { error: markError } = await db.from("moderation_actions").update({
      reverted_at: new Date().toISOString(), reverted_by: c.get("user").id,
    }).eq("id", actionId);
    if (markError) throw markError;
    await notifyManagers(c, "Быстрый фикс отменён",
      `${action.target_type} ${action.target_id}: поля ${Object.keys(before).join(", ")}`,
      "/admin/moderation");
    return c.json(ok({ reverted: true }, rid));
  } catch (revertError) {
    console.error("[staff:revert]", revertError);
    return error(c, rid, 503, "REVERT_FAILED", "Не удалось откатить действие");
  }
});
}
