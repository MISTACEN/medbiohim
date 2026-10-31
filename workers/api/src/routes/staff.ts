import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";
import { effectiveCourse, groupDisplayName } from "../lib/groupIdentity";
import {
  FIX_TABLES,
  describeValue,
  isFixTarget,
  isUuid,
  pickChanges,
  validateFixPatch,
  type FixTarget,
} from "../lib/quickfix";

/**
 * Роли и быстрые фиксы.
 *
 * Староста управляет только своей группой и только «мягкими» параметрами:
 * поток в пределах курса, подгруппы, семестр, ДЗ, заявки. Курс/год поступления
 * меняет администратор по запросу — иначе ломается цепочка групп.
 *
 * Модератор правит контент «на месте»: предпросмотр → применение → откат
 * 24 часа. Каждое действие попадает в moderation_actions и content_versions.
 */
const staff = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGERS = ["moderator", "admin"];

function dbFor(c: any) {
  return createServiceClient(c.env) || c.get("supabase");
}

async function rolesOf(c: any): Promise<string[]> {
  const { data, error } = await c.get("supabase")
    .from("user_roles").select("roles(code)").eq("user_id", c.get("user").id).limit(20);
  if (error) throw error;
  return (data || []).map((row: any) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return String(role?.code || "").toLowerCase();
  }).filter(Boolean);
}

type MembershipSummary = {
  group_id: string;
  group_name: string | null;
  course_number: number | null;
  semester: number | null;
  stream: string | null;
  role_in_group: string;
  subgroup: string | null;
};

async function membershipsOf(c: any): Promise<MembershipSummary[]> {
  const { data } = await dbFor(c).from("group_memberships")
    .select("group_id,role_in_group,subgroup,groups(id,name,course_number,semester,stream,is_active)")
    .eq("user_id", c.get("user").id).eq("is_active", true).limit(50);
  return (data || []).map((row: any) => {
    const group = Array.isArray(row.groups) ? row.groups[0] : row.groups;
    return {
      group_id: row.group_id,
      group_name: group?.name ?? null,
      course_number: group?.course_number ?? null,
      semester: group?.semester ?? null,
      stream: group?.stream ?? null,
      role_in_group: row.role_in_group || "student",
      subgroup: row.subgroup || null,
    };
  });
}

async function isStarostaOf(c: any, groupId: string): Promise<boolean> {
  const db = dbFor(c);
  const { data } = await db.from("group_memberships").select("role_in_group")
    .eq("group_id", groupId).eq("user_id", c.get("user").id).eq("is_active", true).maybeSingle();
  if (String(data?.role_in_group || "") === "starosta") return true;
  return (await rolesOf(c)).includes("admin");
}

function error(c: any, rid: string, status: number, code: string, message: string, details?: unknown) {
  const { body, status: responseStatus } = fail(code, message, status, rid, details as any);
  return c.json(body, responseStatus as any);
}

async function notifyUser(c: any, userId: string, kind: string, title: string, body: string, href?: string) {
  try {
    await dbFor(c).from("notifications").insert({
      user_id: userId, kind, title, body: body.slice(0, 1000), href: href || null,
    });
  } catch (notificationError) {
    console.error("[staff:notify]", notificationError);
  }
}

async function adminIds(c: any): Promise<string[]> {
  try {
    const db = dbFor(c);
    const { data: roleRows } = await db.from("roles").select("id,code").in("code", MANAGERS);
    const ids = (roleRows || []).map((role: any) => role.id);
    if (!ids.length) return [];
    const { data: people } = await db.from("user_roles").select("user_id").in("role_id", ids).limit(1000);
    const found: string[] = [...new Set<string>(((people || []) as any[]).map((row: any) => String(row.user_id)))];
    return found.filter((id) => id !== String(c.get("user").id));
  } catch {
    return [];
  }
}

async function notifyManagers(c: any, title: string, body: string, href: string) {
  for (const userId of await adminIds(c)) await notifyUser(c, userId, "moderation", title, body, href);
}

staff.get("/capabilities", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const roles = await rolesOf(c);
    const memberships = await membershipsOf(c);
    return c.json(ok({
      roles,
      groups: memberships,
      starosta_groups: memberships.filter((row) => row.role_in_group === "starosta").map((row) => row.group_id),
      can: {
        moderate: roles.some((role) => MANAGERS.includes(role)),
        admin: roles.includes("admin"),
        starosta: memberships.some((row) => row.role_in_group === "starosta"),
      },
    }, rid));
  } catch {
    return error(c, rid, 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить права");
  }
});

// ── Староста: группа, состав, подгруппы, семестр, поток, ДЗ ────────────────
staff.get("/groups/:id/manage", requireAuth, async (c) => {
  const rid = requestId();
  const groupId = c.req.param("id") || "";
  if (!UUID.test(groupId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор группы");
  if (!(await isStarostaOf(c, groupId))) return error(c, rid, 403, "FORBIDDEN", "Раздел доступен старосте группы");
  const db = dbFor(c);
  const [{ data: group }, { data: members }, { data: requests }, { data: homeworks }, { data: workshopItems }] = await Promise.all([
    db.from("groups").select("id,name,code,course_number,admission_year,semester,stream,specialty_slug,is_active").eq("id", groupId).maybeSingle(),
    db.from("group_memberships").select("id,user_id,role_in_group,subgroup,course_override,users(id,email,full_name,display_name)").eq("group_id", groupId).eq("is_active", true).limit(500),
    db.from("group_join_requests").select("id,user_id,message,status,created_at,users(full_name,display_name,email)").eq("group_id", groupId).eq("status", "pending").order("created_at", { ascending: true }).limit(100),
    db.from("homeworks").select("id,title,description,due_at,due_date,status,subject_id,created_by,created_at").eq("group_id", groupId).order("created_at", { ascending: false }).limit(100),
    db.from("workshop_items").select("id,title,kind,status,author_id,created_at").eq("group_id", groupId).neq("status", "deleted").order("created_at", { ascending: false }).limit(100),
  ]);
  if (!group) return error(c, rid, 404, "NOT_FOUND", "Группа не найдена");
  const groupCourse = effectiveCourse({ admissionYear: (group as any).admission_year, storedCourse: (group as any).course_number }).course;
  return c.json(ok({
    group: {
      ...group,
      course_number: groupCourse,
      display_name: groupDisplayName({ code: (group as any).code, name: (group as any).name, course: groupCourse, stream: (group as any).stream }),
    },
    members: (members || []).map((row: any) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      const memberCourse = effectiveCourse({
        admissionYear: (group as any).admission_year,
        storedCourse: (group as any).course_number,
        override: row.course_override,
      });
      return {
        membership_id: row.id,
        user_id: row.user_id,
        name: user?.display_name || user?.full_name || user?.email || "Студент",
        email: user?.email ?? null,
        role_in_group: row.role_in_group,
        subgroup: row.subgroup ?? null,
        course_number: memberCourse.course,
        course_source: memberCourse.source,
        course_override: row.course_override ?? null,
      };
    }),
    join_requests: (requests || []).map((row: any) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      return { id: row.id, user_id: row.user_id, name: user?.display_name || user?.full_name || user?.email || "Студент", message: row.message, created_at: row.created_at };
    }),
    homeworks: homeworks || [],
    workshop_items: workshopItems || [],
    locks: { course_number: true, admission_year: true, note: "Курс и год поступления меняет администратор по запросу" },
  }, rid));
});

staff.patch("/groups/:id", requireAuth, async (c) => {
  const rid = requestId();
  const groupId = c.req.param("id") || "";
  if (!UUID.test(groupId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор группы");
  if (!(await isStarostaOf(c, groupId))) return error(c, rid, 403, "FORBIDDEN", "Менять параметры группы может староста");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  // Запрещённые поля не «игнорируем молча»: иначе клиент решит, что курс изменён.
  for (const locked of ["course_number", "course", "admission_year"]) {
    if (Object.prototype.hasOwnProperty.call(input, locked)) {
      return error(c, rid, 422, "LOCKED_FIELD", "Курс и год поступления меняет администратор по запросу", { fields: ["course_number", "admission_year"] });
    }
  }
  const patch: Record<string, unknown> = {};
  if (input.semester !== undefined) {
    const semester = Number(input.semester);
    if (!Number.isInteger(semester) || semester < 1 || semester > 12) return error(c, rid, 422, "VALIDATION_ERROR", "Семестр — целое 1…12");
    patch.semester = semester;
  }
  if (input.stream !== undefined) patch.stream = input.stream ? String(input.stream).trim().slice(0, 50) : null;
  if (!Object.keys(patch).length) return error(c, rid, 422, "VALIDATION_ERROR", "Можно менять семестр и поток в пределах курса");
  const { data: before } = await dbFor(c).from("groups").select("semester,stream,course_number").eq("id", groupId).maybeSingle();
  const { data, error: updateError } = await dbFor(c).from("groups").update(patch).eq("id", groupId).select("id,name,course_number,admission_year,semester,stream").maybeSingle();
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось обновить группу");
  await dbFor(c).from("notifications").insert({
    user_id: c.get("user").id, kind: "group_change", title: "Параметры группы обновлены",
    body: `Было: ${describeValue(before)}, стало: ${describeValue({ ...before, ...patch })}`,
    href: "/group",
  });
  return c.json(ok({ group: data }, rid));
});

staff.patch("/groups/:id/members/:userId", requireAuth, async (c) => {
  const rid = requestId();
  const groupId = c.req.param("id") || "";
  const userId = c.req.param("userId") || "";
  if (!UUID.test(groupId) || !UUID.test(userId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректные идентификаторы");
  if (!(await isStarostaOf(c, groupId))) return error(c, rid, 403, "FORBIDDEN", "Состав подгрупп меняет староста");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const patch: Record<string, unknown> = {};
  // Раньше отсутствие subgroup обнуляло подгруппу при любом другом изменении
  // (например, при заморозке курса). Теперь пишем только присланные поля.
  if (input.subgroup !== undefined) patch.subgroup = input.subgroup ? String(input.subgroup).trim().slice(0, 50) : null;
  if (input.course_override !== undefined) {
    if (input.course_override === null || input.course_override === "") {
      patch.course_override = null;
    } else {
      const course = Number(input.course_override);
      if (!Number.isInteger(course) || course < 1 || course > 8) return error(c, rid, 422, "VALIDATION_ERROR", "Курс для заморозки — целое 1…8");
      patch.course_override = course;
    }
  }
  if (!Object.keys(patch).length) return error(c, rid, 422, "VALIDATION_ERROR", "Можно менять подгруппу и персональный курс");
  if (input.role_in_group !== undefined) {
    // Второго старосту назначает администратор: это меняет права, а не состав.
    if (String(input.role_in_group) !== "student") return error(c, rid, 403, "FORBIDDEN", "Роль в группе меняет администратор");
  }
  const { data, error: updateError } = await dbFor(c).from("group_memberships")
    .update(patch).eq("group_id", groupId).eq("user_id", userId).eq("is_active", true)
    .select("id,user_id,subgroup,course_override").maybeSingle();
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось изменить подгруппу");
  if (!data) return error(c, rid, 404, "NOT_FOUND", "Студент не найден в группе");
  return c.json(ok({ member: data }, rid));
});

staff.patch("/groups/:id/homeworks/:homeworkId", requireAuth, async (c) => {
  const rid = requestId();
  const groupId = c.req.param("id") || "";
  const homeworkId = c.req.param("homeworkId") || "";
  if (!UUID.test(groupId) || !UUID.test(homeworkId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректные идентификаторы");
  if (!(await isStarostaOf(c, groupId))) return error(c, rid, 403, "FORBIDDEN", "ДЗ группы редактирует староста");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = String(input.title || "").trim();
    if (!title || title.length > 300) return error(c, rid, 422, "VALIDATION_ERROR", "Название: 1…300 символов");
    patch.title = title;
  }
  if (input.description !== undefined) patch.description = String(input.description || "").slice(0, 20000);
  if (input.due_at !== undefined) {
    const dueAt = input.due_at ? String(input.due_at) : null;
    if (dueAt && Number.isNaN(Date.parse(dueAt))) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный срок");
    patch.due_at = dueAt;
    patch.due_date = dueAt && /^\d{4}-\d{2}-\d{2}/.test(dueAt) ? dueAt.slice(0, 10) : null;
  }
  if (!Object.keys(patch).length) return error(c, rid, 422, "VALIDATION_ERROR", "Нечего обновлять");
  const db = dbFor(c);
  const { data: homework } = await db.from("homeworks").select("id,group_id").eq("id", homeworkId).maybeSingle();
  if (!homework || String(homework.group_id) !== groupId) return error(c, rid, 404, "NOT_FOUND", "Задание не относится к этой группе");
  const { data, error: updateError } = await db.from("homeworks").update(patch).eq("id", homeworkId).select("*").maybeSingle();
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось обновить задание");
  return c.json(ok({ homework: data }, rid));
});

// ── Заявки на вступление ───────────────────────────────────────────────────
staff.post("/groups/:id/join-requests", requireAuth, async (c) => {
  const rid = requestId();
  const groupId = c.req.param("id") || "";
  if (!UUID.test(groupId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор группы");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const db = dbFor(c);
  const { data: group } = await db.from("groups").select("id,is_active").eq("id", groupId).maybeSingle();
  if (!group || group.is_active === false) return error(c, rid, 404, "NOT_FOUND", "Группа не найдена");
  const { data: membership } = await db.from("group_memberships").select("group_id")
    .eq("user_id", c.get("user").id).eq("is_active", true).limit(1);
  if ((membership || []).length) return error(c, rid, 409, "ALREADY_IN_GROUP", "Сначала выйдите из текущей группы");
  const { error: insertError } = await db.from("group_join_requests").insert({
    group_id: groupId, user_id: c.get("user").id, message: input.message ? String(input.message).slice(0, 500) : null,
  });
  if (insertError) {
    if (String((insertError as any).code) === "23505") return error(c, rid, 409, "ALREADY_REQUESTED", "Заявка уже отправлена");
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось отправить заявку");
  }
  return c.json(ok({ created: true }, rid), 201);
});

staff.patch("/groups/:id/join-requests/:requestId", requireAuth, async (c) => {
  const rid = requestId();
  const groupId = c.req.param("id") || "";
  const requestIdValue = c.req.param("requestId") || "";
  if (!UUID.test(groupId) || !UUID.test(requestIdValue)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректные идентификаторы");
  if (!(await isStarostaOf(c, groupId))) return error(c, rid, 403, "FORBIDDEN", "Заявки подтверждает староста");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const approve = input.approve !== false && input.status !== "rejected";
  const db = dbFor(c);
  const { data: request } = await db.from("group_join_requests")
    .select("id,group_id,user_id,status").eq("id", requestIdValue).eq("group_id", groupId).maybeSingle();
  if (!request) return error(c, rid, 404, "NOT_FOUND", "Заявка не найдена");
  if (request.status !== "pending") return error(c, rid, 409, "ALREADY_REVIEWED", "Заявка уже рассмотрена");
  if (approve) {
    await db.from("group_memberships").update({ is_active: false })
      .eq("user_id", request.user_id).eq("is_active", true).neq("group_id", groupId);
    const { data: existing } = await db.from("group_memberships").select("id,is_active")
      .eq("group_id", groupId).eq("user_id", request.user_id).limit(1);
    const existingRow = (existing || [])[0];
    const write = existingRow
      ? db.from("group_memberships").update({ is_active: true, role_in_group: "student" }).eq("id", existingRow.id)
      : db.from("group_memberships").insert({ group_id: groupId, user_id: request.user_id, is_active: true, role_in_group: "student" });
    const { error: memberError } = await write;
    if (memberError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось добавить студента в группу");
  }
  const { error: updateError } = await db.from("group_join_requests").update({
    status: approve ? "approved" : "rejected",
    reviewed_by: c.get("user").id,
    reviewed_at: new Date().toISOString(),
    resolution_note: input.note ? String(input.note).slice(0, 500) : null,
  }).eq("id", requestIdValue);
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить решение");
  await notifyUser(c, String(request.user_id), "group_join",
    approve ? "Заявка в группу одобрена" : "Заявка в группу отклонена",
    input.note ? String(input.note).slice(0, 500) : "Решение старосты группы", "/");
  return c.json(ok({ status: approve ? "approved" : "rejected" }, rid));
});

// ── Запросы старосты администратору ────────────────────────────────────────
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

// ── Быстрые фиксы: предпросмотр → применение → откат 24 часа ──────────────
async function readTarget(c: any, target: FixTarget, id: string) {
  if (!isUuid(id)) return { row: null, error: "Некорректный идентификатор" };
  const table = FIX_TABLES[target];
  const { data, error: readError } = await dbFor(c).from(table).select("*").eq("id", id).maybeSingle();
  if (readError) throw readError;
  return { row: data, error: data ? null : "Запись не найдена" };
}

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

async function recordContentVersion(c: any, table: string, id: string, data: any, actorId: string, source: string) {
  if (!["questions", "tests", "materials"].includes(table)) return;
  const db = dbFor(c);
  const { data: rows } = await db.from("content_versions").select("version_no")
    .eq("table_name", table).eq("row_key", JSON.stringify({ id }))
    .order("version_no", { ascending: false }).limit(1);
  const versionNo = Number(rows?.[0]?.version_no || 0) + 1;
  await db.from("content_versions").insert({
    table_name: table, row_key: { id }, version_no: versionNo, data, source, actor_user_id: actorId,
  });
}

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

// ── Модератор: слияние дубликатов тем ──────────────────────────────────────
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

// ── Уведомления ────────────────────────────────────────────────────────────
staff.get("/notifications", requireAuth, async (c) => {
  const rid = requestId();
  const { data, error: readError } = await dbFor(c).from("notifications")
    .select("*").eq("user_id", c.get("user").id).order("created_at", { ascending: false }).limit(50);
  if (readError) return error(c, rid, 503, "DB_UNAVAILABLE", "Уведомления недоступны");
  const unread = (data || []).filter((row: any) => !row.read_at).length;
  return c.json(ok({ items: data || [], unread }, rid));
});

staff.post("/notifications/read", requireAuth, async (c) => {
  const rid = requestId();
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  let query = dbFor(c).from("notifications").update({ read_at: new Date().toISOString() })
    .eq("user_id", c.get("user").id).is("read_at", null);
  if (input.id && UUID.test(String(input.id))) query = query.eq("id", String(input.id));
  const { error: updateError } = await query;
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось отметить уведомления");
  return c.json(ok({ read: true }, rid));
});

export default staff;
