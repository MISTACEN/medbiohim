import { requireAuth } from "../../middleware/auth";
import { ok, requestId } from "../../lib/response";
import { STRICT_ADMINS, UUID, bodyJson, error, gate, type AdminApp } from "./shared";

/**
 * Пользователи, роли и академическая привязка (группа/курс/семестр).
 */
export function registerUsers(admin: AdminApp) {

  // User and role administration is restricted to administrators only.
  admin.get("/users", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase");
    if (!await gate(c, STRICT_ADMINS)) return;
    // Поиск и фильтры считаются на сервере: раньше список был жёстко «последние 100»,
    // и найти студента по почте или группе можно было только глазами по всей странице.
    const q = (c.req.query("q") || "").trim().slice(0, 120);
    const roleFilter = (c.req.query("role") || "").trim().toLowerCase();
    const groupFilter = (c.req.query("group_id") || "").trim();
    const limit = Math.min(Math.max(Number(c.req.query("limit") || 50), 1), 200);
    const offset = Math.max(Number(c.req.query("offset") || 0), 0);
    if (roleFilter && !["admin", "moderator", "teacher", "student"].includes(roleFilter)) {
      return error(c, rid, 422, "VALIDATION_ERROR", "Неизвестная роль");
    }
    if (groupFilter && !UUID.test(groupFilter)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный group_id");
    const emptyPage = () => c.json(ok({ items: [], total: 0, limit, offset }, rid));
    try {
      let allowedIds: string[] | null = null;
      if (roleFilter) {
        const { data: role, error: roleError } = await db.from("roles").select("id").eq("code", roleFilter).maybeSingle();
        if (roleError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось применить фильтр по роли");
        if (!role?.id) return emptyPage();
        const { data: roleRows, error: roleRowsError } = await db.from("user_roles").select("user_id").eq("role_id", role.id).limit(5000);
        if (roleRowsError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось применить фильтр по роли");
        allowedIds = [...new Set((roleRows || []).map((row: any) => String(row.user_id || "")).filter(Boolean))];
        if (!allowedIds.length) return emptyPage();
      }
      if (groupFilter) {
        const { data: memberRows, error: memberRowsError } = await db.from("group_memberships").select("user_id")
          .eq("group_id", groupFilter).eq("is_active", true).limit(5000);
        if (memberRowsError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось применить фильтр по группе");
        const memberIds = new Set((memberRows || []).map((row: any) => String(row.user_id || "")));
        allowedIds = allowedIds ? allowedIds.filter((id) => memberIds.has(id)) : [...memberIds];
        if (!allowedIds.length) return emptyPage();
      }
      let query = db.from("users").select("id,email,full_name,course_number,semester,created_at", { count: "exact" });
      if (allowedIds) query = query.in("id", allowedIds);
      if (q) {
        // Символы, ломающие синтаксис PostgREST `or`, вырезаем: поиск не должен падать от запятой.
        const pattern = q.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
        if (pattern) query = query.or(`email.ilike.%${pattern}%,full_name.ilike.%${pattern}%`);
      }
      const { data, count: totalUsers, error: dbError } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (dbError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить пользователей");
      const ids = (data || []).map((u: any) => u.id).filter(Boolean);
      const roleMap: Record<string, string[]> = {};
      if (ids.length) {
        const { data: roles, error: rolesError } = await db.from("user_roles").select("user_id,roles(code)").in("user_id", ids);
        if (rolesError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить роли пользователей");
        for (const row of roles || []) {
          const role = Array.isArray((row as any).roles) ? (row as any).roles[0] : (row as any).roles;
          (roleMap[(row as any).user_id] ||= []).push(String(role?.code || ""));
        }
      }
      const userIds = (data || []).map((u: any) => u.id).filter(Boolean);
      const groupMap: Record<string, any> = {};
      if (userIds.length) {
        const { data: memberships, error: membershipsError } = await db.from("group_memberships").select("user_id,group_id,groups(name,code,course_number)").in("user_id", userIds).eq("is_active", true);
        if (membershipsError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить группы пользователей");
        for (const membership of memberships || []) {
          const group = Array.isArray((membership as any).groups) ? (membership as any).groups[0] : (membership as any).groups;
          groupMap[(membership as any).user_id] = { group_id: (membership as any).group_id, group_name: group?.name || null, group_code: group?.code || null, course_number: group?.course_number || null };
        }
      }
      return c.json(ok({ items: (data || []).map((u: any) => ({ ...u, roles: roleMap[u.id] || [], ...(groupMap[u.id] || {}) })), total: totalUsers ?? (data || []).length, limit, offset }, rid));
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить пользователей"); }
  });
  admin.post("/users/roles", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase"), user = c.get("user"), input = await bodyJson(c);
    if (!await gate(c, STRICT_ADMINS)) return;
    const userId = String(input?.user_id || ""), roleCode = String(input?.role || ""), action = String(input?.action || "assign");
    if (!UUID.test(userId) || !["admin","moderator","teacher","student"].includes(roleCode) || !["assign","revoke"].includes(action)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректные user_id, role или action");
    try {
      const { data: role, error: roleError } = await db.from("roles").select("id,code").eq("code", roleCode).maybeSingle();
      if (roleError || !role) return error(c, rid, 503, "ROLE_UNAVAILABLE", "Роль не найдена");
      if (action === "revoke" && roleCode === "admin" && userId === user.id) {
        const { data: allRoleRows, error: adminError } = await db.from("user_roles").select("user_id,roles(code)").limit(2000);
        if (adminError) return error(c, rid, 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить количество администраторов");
        const adminIds = new Set((allRoleRows || []).filter((row: any) => {
          const roleValue = Array.isArray(row.roles) ? row.roles[0] : row.roles;
          return roleValue?.code === "admin";
        }).map((row: any) => row.user_id));
        if (adminIds.size <= 1) return error(c, rid, 409, "LAST_ADMIN", "Нельзя снять роль последнего администратора");
      }
      if (action === "assign") {
        const { data: existing, error: existingError } = await db.from("user_roles").select("user_id").eq("user_id", userId).eq("role_id", role.id).maybeSingle();
        if (existingError) return error(c, rid, 503, "ROLE_WRITE_FAILED", "Не удалось проверить назначенную роль");
        if (!existing) {
          const { error: writeError } = await db.from("user_roles").insert({ user_id: userId, role_id: role.id });
          if (writeError) return error(c, rid, 503, "ROLE_WRITE_FAILED", "Не удалось назначить роль");
        }
      } else {
        const { error: writeError } = await db.from("user_roles").delete().eq("user_id", userId).eq("role_id", role.id);
        if (writeError) return error(c, rid, 503, "ROLE_WRITE_FAILED", "Не удалось снять роль");
      }
      const { data: rows } = await db.from("user_roles").select("roles(code)").eq("user_id", userId).limit(20);
      const roles = (rows || []).map((row: any) => { const r = Array.isArray(row.roles) ? row.roles[0] : row.roles; return String(r?.code || ""); }).filter(Boolean);
      return c.json(ok({ roles, session_refresh_required: userId === user.id }, rid));
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "ROLE_WRITE_FAILED", "Не удалось изменить роли пользователя"); }
  });

  // Assign group / course / semester to a user (admin CMS).
  admin.put("/users/:id/academic", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase");
    if (!await gate(c, STRICT_ADMINS)) return;
    const userId = c.req.param("id") ?? "";
    if (!UUID.test(userId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID пользователя");
    const input = await bodyJson(c);
    if (!input) return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
    const groupId = String(input.group_id || "").trim();
    if (!UUID.test(groupId)) return error(c, rid, 422, "VALIDATION_ERROR", "group_id обязателен (UUID)");
    const semester = input.semester != null ? Number(input.semester) : null;
    const courseNumber = input.course_number != null ? Number(input.course_number) : input.course != null ? Number(input.course) : null;
    try {
      const { data: group, error: groupError } = await db
        .from("groups")
        .select("id,name,code,course_number,is_active")
        .eq("id", groupId)
        .maybeSingle();
      if (groupError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось проверить группу");
      if (!group || group.is_active === false) return error(c, rid, 404, "NOT_FOUND", "Активная группа не найдена");

      // Ensure the target membership is active before deactivating any previous membership.
      const { data: existing, error: existingError } = await db
        .from("group_memberships")
        .select("id")
        .eq("user_id", userId)
        .eq("group_id", groupId)
        .limit(1)
        .maybeSingle();
      if (existingError) return error(c, rid, 503, "DB_ERROR", "Не удалось проверить членство в группе");
      if (existing?.id) {
        const { error: mErr } = await db
          .from("group_memberships")
          .update({ is_active: true, role_in_group: "student" })
          .eq("id", existing.id);
        if (mErr) return error(c, rid, 503, "DB_ERROR", "Не удалось обновить членство в группе");
      } else {
        const { error: mErr } = await db.from("group_memberships").insert({
          user_id: userId,
          group_id: groupId,
          role_in_group: "student",
          is_active: true,
        });
        if (mErr) return error(c, rid, 503, "DB_ERROR", "Не удалось создать членство в группе");
      }
      const { error: deactivateError } = await db
        .from("group_memberships")
        .update({ is_active: false })
        .eq("user_id", userId)
        .neq("group_id", groupId)
        .eq("is_active", true);
      if (deactivateError) return error(c, rid, 503, "DB_ERROR", "Группа назначена, но не удалось закрыть прежнее членство");

      const userPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const resolvedSemester = semester != null && Number.isFinite(semester) ? semester : null;
      const resolvedCourse =
        courseNumber != null && Number.isFinite(courseNumber)
          ? courseNumber
          : group.course_number ?? null;
      if (resolvedSemester != null) userPatch.semester = resolvedSemester;
      if (resolvedCourse != null) userPatch.course_number = resolvedCourse;

      const { data: userRow, error: userError } = await db
        .from("users")
        .update(userPatch)
        .eq("id", userId)
        .select("id,email,full_name,course_number,semester")
        .maybeSingle();
      if (userError) return error(c, rid, 503, "DB_ERROR", "Членство сохранено, но профиль users не обновлён");

      return c.json(
        ok(
          {
            user: userRow,
            group_id: groupId,
            group: {
              id: group.id,
              name: group.name,
              code: group.code,
              course: group.course_number ?? null,
              course_number: group.course_number ?? null,
              semester: resolvedSemester,
            },
            semester: userRow?.semester ?? resolvedSemester,
            course_number: userRow?.course_number ?? resolvedCourse,
          },
          rid
        )
      );
    } catch {
      return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить академические данные");
    }
  });
}
