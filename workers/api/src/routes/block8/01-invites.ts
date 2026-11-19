import { ok, requestId } from "../../lib/response";
import { requireAuth, requireAdmin } from "../../middleware/auth";
import { createServiceClient } from "../../lib/supabase";
import { UUID, err, randomToken } from "./shared";

import type { Block8Router } from "./types";

export function registerInviteRoutes(block8: Block8Router) {
block8.post("/admin/groups/:id/invites", requireAuth, requireAdmin, async (c) => {
  const rid = requestId();
  const groupId = c.req.param("id") || "";
  if (!UUID.test(groupId)) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID группы");
  let input: any = {};
  try { input = await c.req.json(); } catch { /* тело необязательно */ }
  const days = Number(input?.expires_in_days) || 30;
  if (days < 1 || days > 365) return err(c, rid, 422, "VALIDATION_ERROR", "expires_in_days: 1..365");
  const service = createServiceClient(c.env);
  if (!service) return err(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { data: group, error: groupError } = await service
      .from("groups").select("id,name").eq("id", groupId).maybeSingle();
    if (groupError) throw groupError;
    if (!group) return err(c, rid, 404, "NOT_FOUND", "Группа не найдена");
    const token = randomToken();
    const { data: invite, error: inviteError } = await service
      .from("group_invites")
      .insert({
        group_id: groupId,
        token,
        created_by: c.get("user").id,
        expires_at: new Date(Date.now() + days * 86400000).toISOString(),
      })
      .select("id,token,expires_at,created_at")
      .single();
    if (inviteError) throw inviteError;
    return c.json(ok({ invite, group_name: (group as any).name, url: `/invite/${token}` }, rid), 201);
  } catch (createError) {
    console.error("[block8:invite-create]", createError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось создать ссылку");
  }
});

block8.get("/admin/groups/:id/invites", requireAuth, requireAdmin, async (c) => {
  const rid = requestId();
  const groupId = c.req.param("id") || "";
  if (!UUID.test(groupId)) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID группы");
  const service = createServiceClient(c.env);
  if (!service) return err(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { data, error: readError } = await service
      .from("group_invites")
      .select("id,token,expires_at,revoked_at,uses,max_uses,created_at")
      .eq("group_id", groupId).order("created_at", { ascending: false }).limit(50);
    if (readError) throw readError;
    return c.json(ok({ items: data || [] }, rid));
  } catch (listError) {
    console.error("[block8:invite-list]", listError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Ссылки недоступны");
  }
});

block8.delete("/admin/groups/invites/:inviteId", requireAuth, requireAdmin, async (c) => {
  const rid = requestId();
  const inviteId = c.req.param("inviteId") || "";
  if (!UUID.test(inviteId)) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID ссылки");
  const service = createServiceClient(c.env);
  if (!service) return err(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { error: revokeError } = await service
      .from("group_invites").update({ revoked_at: new Date().toISOString() })
      .eq("id", inviteId).is("revoked_at", null);
    if (revokeError) throw revokeError;
    return c.json(ok({ revoked: true }, rid));
  } catch (revokeError) {
    console.error("[block8:invite-revoke]", revokeError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось отозвать ссылку");
  }
});
}
