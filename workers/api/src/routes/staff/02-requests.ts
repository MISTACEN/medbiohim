import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, MANAGERS, dbFor, rolesOf, isStarostaOf, error, notifyUser, notifyManagers } from "./shared";

import { FIX_TABLES, describeValue, isFixTarget } from "../../lib/quickfix";


import type { StaffRouter } from "./types";

export function registerRequestRoutes(staff: StaffRouter) {
staff.post("/requests", requireAuth, async (c) => {
  const rid = requestId();
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const kind = String(input.kind || "");
  if (!["course_change", "admission_year_change", "material_publish", "role_change"].includes(kind)) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Неизвестный тип запроса");
  }
  const groupId = input.group_id ? String(input.group_id) : "";
  if (groupId && !UUID.test(groupId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректная группа");
  if (groupId && !(await isStarostaOf(c, groupId))) return error(c, rid, 403, "FORBIDDEN", "Запрос по группе отправляет её староста");
  const roles = await rolesOf(c).catch((): string[] => []);
  if (kind === "role_change" && !roles.includes("admin")) return error(c, rid, 403, "FORBIDDEN", "Роли меняет администратор");
  if (kind === "material_publish" && !roles.some((role) => MANAGERS.includes(role))) return error(c, rid, 403, "FORBIDDEN", "Публикацию для других групп одобряет модератор");
  const { data, error: insertError } = await dbFor(c).from("staff_requests").insert({
    kind,
    requester_id: c.get("user").id,
    group_id: groupId || null,
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    reason: input.reason ? String(input.reason).slice(0, 1000) : null,
  }).select("*").maybeSingle();
  if (insertError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось отправить запрос");
  await notifyManagers(c, "Новый запрос от старосты", `${kind}: ${input.reason || "без комментария"}`, "/admin/moderation");
  return c.json(ok({ request: data }, rid), 201);
});

staff.get("/requests", requireAuth, async (c) => {
  const rid = requestId();
  const roles = await rolesOf(c).catch((): string[] => []);
  const isAdmin = roles.includes("admin");
  const status = String(c.req.query("status") || "").trim();
  let query = dbFor(c).from("staff_requests").select("*").order("created_at", { ascending: false }).limit(100);
  if (!isAdmin) query = query.eq("requester_id", c.get("user").id);
  if (["pending", "approved", "rejected"].includes(status)) query = query.eq("status", status);
  const { data, error: readError } = await query;
  if (readError) return error(c, rid, 503, "DB_UNAVAILABLE", "Запросы недоступны");
  return c.json(ok({ items: data || [], can_review: isAdmin }, rid));
});

staff.patch("/requests/:id", requireAuth, async (c) => {
  const rid = requestId();
  const roles = await rolesOf(c).catch((): string[] => []);
  if (!roles.includes("admin")) return error(c, rid, 403, "FORBIDDEN", "Запросы подтверждает администратор");
  const requestIdValue = c.req.param("id") || "";
  if (!UUID.test(requestIdValue)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const approve = input.approve === true || input.status === "approved";
  const db = dbFor(c);
  const { data: request } = await db.from("staff_requests").select("*").eq("id", requestIdValue).maybeSingle();
  if (!request) return error(c, rid, 404, "NOT_FOUND", "Запрос не найден");
  if (request.status !== "pending") return error(c, rid, 409, "ALREADY_REVIEWED", "Запрос уже рассмотрен");
  const payload = request.payload && typeof request.payload === "object" ? request.payload : {};
  if (approve) {
    if (request.kind === "course_change" && request.group_id) {
      const course = Number(payload.course_number);
      if (!Number.isInteger(course) || course < 1 || course > 12) return error(c, rid, 422, "VALIDATION_ERROR", "В запросе некорректный курс");
      await db.from("groups").update({ course_number: course }).eq("id", request.group_id);
      // Курс в профиле студента — снимок группы; обновляем его вместе с группой,
      // иначе дашборд продолжит показывать старый курс.
      const { data: members } = await db.from("group_memberships")
        .select("user_id").eq("group_id", request.group_id).eq("is_active", true).limit(1000);
      const memberIds = (members || []).map((row: any) => String(row.user_id)).filter(Boolean);
      if (memberIds.length) await db.from("users").update({ course_number: course }).in("id", memberIds);
    }
    if (request.kind === "admission_year_change" && request.group_id) {
      const year = Number(payload.admission_year);
      if (!Number.isInteger(year) || year < 1990 || year > 2100) return error(c, rid, 422, "VALIDATION_ERROR", "В запросе некорректный год поступления");
      await db.from("groups").update({ admission_year: year }).eq("id", request.group_id);
    }
    if (request.kind === "material_publish") {
      const itemId = String(payload.workshop_item_id || payload.item_id || "");
      if (!UUID.test(itemId)) return error(c, rid, 422, "VALIDATION_ERROR", "В запросе нет материала");
      await db.from("workshop_items").update({ status: "published", published_at: new Date().toISOString() }).eq("id", itemId);
    }
    if (request.kind === "role_change") {
      const userId = String(payload.user_id || "");
      const code = String(payload.role_code || "").toLowerCase();
      if (!UUID.test(userId) || !code) return error(c, rid, 422, "VALIDATION_ERROR", "Нужны user_id и role_code");
      const { data: role } = await db.from("roles").select("id,code").eq("code", code).maybeSingle();
      if (!role) return error(c, rid, 422, "VALIDATION_ERROR", "Роль не найдена");
      await db.from("user_roles").upsert({ user_id: userId, role_id: role.id }, { onConflict: "user_id,role_id" });
    }
  }
  const { data, error: updateError } = await db.from("staff_requests").update({
    status: approve ? "approved" : "rejected",
    reviewed_by: c.get("user").id,
    reviewed_at: new Date().toISOString(),
    resolution_note: input.note ? String(input.note).slice(0, 1000) : null,
  }).eq("id", requestIdValue).select("*").maybeSingle();
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить решение");
  await notifyUser(c, String(request.requester_id), "staff_request",
    approve ? "Запрос одобрен" : "Запрос отклонён",
    input.note ? String(input.note).slice(0, 500) : request.kind, "/group");
  return c.json(ok({ request: data }, rid));
});
}
