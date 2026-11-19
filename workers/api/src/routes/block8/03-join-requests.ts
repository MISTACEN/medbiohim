import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { canAdminister, callerRoles } from "../../lib/permissions";
import { createServiceClient } from "../../lib/supabase";
import { UUID, err } from "./shared";

import type { Block8Router } from "./types";

export function registerJoinRequestRoutes(block8: Block8Router) {
block8.get("/groups/join-requests", requireAuth, async (c) => {
  const rid = requestId();
  const userId = c.get("user").id;
  const service = createServiceClient(c.env);
  if (!service) return err(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const roles = await callerRoles(service, userId);
    const isAdmin = canAdminister(roles);
    let groupIds: string[] = [];
    if (!isAdmin) {
      const { data: mine, error: mineError } = await service
        .from("group_memberships")
        .select("group_id").eq("user_id", userId).eq("role_in_group", "starosta").eq("is_active", true).limit(50);
      if (mineError) throw mineError;
      groupIds = (mine || []).map((row: any) => String(row.group_id));
      if (!groupIds.length) return c.json(ok({ items: [] }, rid));
    }
    let query = service
      .from("group_join_requests")
      .select("id,group_id,user_id,status,created_at,groups(name,code),users(full_name,display_name,email)")
      .eq("status", "pending").order("created_at", { ascending: false }).limit(200);
    if (!isAdmin) query = query.in("group_id", groupIds);
    const { data, error: readError } = await query;
    if (readError) throw readError;
    const items = (data || []).map((row: any) => {
      const group = Array.isArray(row.groups) ? row.groups[0] : row.groups;
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      return {
        id: String(row.id),
        group_id: String(row.group_id),
        group_name: group?.name || group?.code || null,
        user_id: String(row.user_id),
        user_name: user?.full_name || user?.display_name || user?.email || "Студент",
        created_at: row.created_at,
      };
    });
    return c.json(ok({ items }, rid));
  } catch (listError) {
    console.error("[block8:join-requests]", listError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Заявки недоступны");
  }
});

block8.post("/groups/join-requests/:id/decide", requireAuth, async (c) => {
  const rid = requestId();
  const requestIdParam = c.req.param("id") || "";
  if (!UUID.test(requestIdParam)) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID заявки");
  let input: any = {};
  try { input = await c.req.json(); } catch { return err(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const decision = String(input?.decision || "");
  if (decision !== "approve" && decision !== "reject") {
    return err(c, rid, 422, "VALIDATION_ERROR", "decision: approve или reject");
  }
  const userId = c.get("user").id;
  const service = createServiceClient(c.env);
  if (!service) return err(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const roles = await callerRoles(service, userId);
    const isAdmin = canAdminister(roles);
    const { data: request, error: readError } = await service
      .from("group_join_requests").select("id,group_id,user_id,status").eq("id", requestIdParam).maybeSingle();
    if (readError) throw readError;
    const joinRequest = request as any;
    if (!joinRequest) return err(c, rid, 404, "NOT_FOUND", "Заявка не найдена");
    if (!isAdmin) {
      const { data: starosta } = await service
        .from("group_memberships")
        .select("group_id").eq("group_id", joinRequest.group_id).eq("user_id", userId)
        .eq("role_in_group", "starosta").eq("is_active", true).limit(1);
      if (!starosta?.length) return err(c, rid, 403, "FORBIDDEN", "Решение принимает староста группы");
    }
    if (joinRequest.status !== "pending") {
      return err(c, rid, 409, "ALREADY_DECIDED", "Заявка уже рассмотрена");
    }
    const now = new Date().toISOString();
    if (decision === "approve") {
      // В группу без дубликата активного членства.
      const { data: membership } = await service
        .from("group_memberships")
        .select("id,is_active").eq("group_id", joinRequest.group_id).eq("user_id", joinRequest.user_id).limit(1);
      const existing = (membership || [])[0] as any;
      if (existing) {
        if (!existing.is_active) {
          const { error: reactivateError } = await service
            .from("group_memberships").update({ is_active: true }).eq("id", existing.id);
          if (reactivateError) throw reactivateError;
        }
      } else {
        const { error: insertError } = await service
          .from("group_memberships")
          .insert({ group_id: joinRequest.group_id, user_id: joinRequest.user_id, role_in_group: "student", is_active: true });
        if (insertError) throw insertError;
      }
    }
    const { error: decideError } = await service
      .from("group_join_requests")
      .update({ status: decision === "approve" ? "approved" : "rejected", decided_by: userId, decided_at: now })
      .eq("id", requestIdParam);
    if (decideError) throw decideError;
    return c.json(ok({ status: decision === "approve" ? "approved" : "rejected" }, rid));
  } catch (decideError) {
    console.error("[block8:join-decide]", decideError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить решение");
  }
});
}
