import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, dbFor, error, isStaff, loadItem, notify, readSettings } from "./shared";
import type { WorkshopApp } from "./shared";

export function registerModeration(workshop: WorkshopApp) {
workshop.get("/moderation/queue", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await isStaff(c))) return error(c, rid, 403, "FORBIDDEN", "Очередь доступна модераторам");
  const limit = Math.max(1, Math.min(100, Number(c.req.query("limit") || 50)));
  const { data, error: readError } = await dbFor(c).from("workshop_items")
    .select("id,author_id,subject_id,title,summary,kind,tags,status,report_count,personal_data_flags,created_at,version_no")
    .in("status", ["pending", "hidden"]).order("created_at", { ascending: true }).limit(limit);
  if (readError) return error(c, rid, 503, "DB_UNAVAILABLE", "Очередь недоступна");
  return c.json(ok({ items: data || [], moderation_mode: (await readSettings(c)).moderation_mode }, rid));
});

workshop.post("/moderation/items/:id", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const action = String(input.action || "");
  if (!["approve", "reject", "hide", "unhide"].includes(action)) return error(c, rid, 422, "VALIDATION_ERROR", "Действие: approve, reject, hide или unhide");
  const db = dbFor(c);
  const { item } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  const staff = await isStaff(c);
  // Староста курирует материалы своей группы, но не публикует их на весь сайт.
  let starosta = false;
  if (!staff && item.group_id) {
    const { data: membership } = await db.from("group_memberships").select("role_in_group")
      .eq("group_id", item.group_id).eq("user_id", c.get("user").id).eq("is_active", true).maybeSingle();
    starosta = String(membership?.role_in_group || "") === "starosta";
  }
  if (!staff && (!starosta || !["hide", "unhide"].includes(action))) {
    return error(c, rid, 403, "FORBIDDEN", "Действие доступно модераторам");
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), moderation_note: input.note ? String(input.note).slice(0, 1000) : null };
  if (action === "approve") { patch.status = "published"; patch.previous_status = null; patch.published_at = new Date().toISOString(); patch.hidden_by = null; patch.hidden_until = null; }
  if (action === "reject") { patch.status = "rejected"; patch.previous_status = null; patch.published_at = null; }
  if (action === "hide") {
    // Запоминаем прежний статус: снятие скрытия не должно публиковать
    // материал, который ещё не прошёл модерацию.
    patch.previous_status = item.status === "hidden" ? item.previous_status : item.status;
    patch.status = "hidden";
    patch.hidden_by = c.get("user").id;
    patch.hidden_until = input.hidden_until ? String(input.hidden_until).slice(0, 40) : null;
  }
  if (action === "unhide") {
    patch.status = ["published", "pending", "rejected", "draft"].includes(String(item.previous_status)) ? item.previous_status : "pending";
    patch.previous_status = null;
    patch.hidden_by = null;
    patch.hidden_until = null;
  }
  const { data, error: updateError } = await db.from("workshop_items").update(patch).eq("id", id).select("*").maybeSingle();
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось изменить статус");
  const titles: Record<string, string> = {
    approve: "Материал опубликован",
    reject: "Материал отклонён",
    hide: "Материал скрыт модератором",
    unhide: "Материал снова опубликован",
  };
  await notify(c, String(item.author_id), titles[action], `${item.title}${input.note ? ` — ${String(input.note).slice(0, 300)}` : ""}`, "/workshop");
  return c.json(ok({ item: data }, rid));
});

workshop.get("/moderation/reports", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await isStaff(c))) return error(c, rid, 403, "FORBIDDEN", "Жалобы доступны модераторам");
  const { data, error: readError } = await dbFor(c).from("workshop_reports")
    .select("id,item_id,reporter_user_id,reason,status,created_at,item:workshop_items(id,title,status,author_id)")
    .order("created_at", { ascending: false }).limit(100);
  if (readError) return error(c, rid, 503, "DB_UNAVAILABLE", "Жалобы недоступны");
  return c.json(ok({ items: data || [] }, rid));
});

workshop.patch("/moderation/reports/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await isStaff(c))) return error(c, rid, 403, "FORBIDDEN", "Жалобы разбирают модераторы");
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const status = String(input.status || "");
  if (!["resolved", "dismissed"].includes(status)) return error(c, rid, 422, "VALIDATION_ERROR", "Статус: resolved или dismissed");
  const { data, error: updateError } = await dbFor(c).from("workshop_reports").update({
    status, resolved_by: c.get("user").id, resolved_at: new Date().toISOString(),
  }).eq("id", id).select("*").maybeSingle();
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось закрыть жалобу");
  return c.json(ok({ report: data }, rid));
});
}
