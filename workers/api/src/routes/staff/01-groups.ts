import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { effectiveCourse, groupDisplayName } from "../../lib/groupIdentity";
import { UUID, MANAGERS, dbFor, rolesOf, membershipsOf, isStarostaOf, error, notifyUser } from "./shared";

import { FIX_TABLES, describeValue, isFixTarget } from "../../lib/quickfix";


import type { StaffRouter } from "./types";

export function registerGroupRoutes(staff: StaffRouter) {
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
}
