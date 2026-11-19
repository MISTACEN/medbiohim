import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { createServiceClient } from "../../lib/supabase";
import { err } from "./shared";

import type { Block8Router } from "./types";

export function registerInviteAcceptRoutes(block8: Block8Router) {
block8.get("/invites/:token", requireAuth, async (c) => {
  const rid = requestId();
  const token = (c.req.param("token") || "").replace(/[^0-9a-f]/gi, "").slice(0, 64);
  if (!token) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный токен");
  const service = createServiceClient(c.env);
  if (!service) return err(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { data, error: readError } = await service
      .from("group_invites")
      .select("id,group_id,expires_at,revoked_at,uses,max_uses,groups(name,code)")
      .eq("token", token).maybeSingle();
    if (readError) throw readError;
    const invite = data as any;
    const group = invite ? (Array.isArray(invite.groups) ? invite.groups[0] : invite.groups) : null;
    const expired = invite?.expires_at ? Date.parse(invite.expires_at) < Date.now() : false;
    const exhausted = invite?.max_uses != null && Number(invite.uses) >= Number(invite.max_uses);
    const valid = Boolean(invite) && !invite.revoked_at && !expired && !exhausted;
    // Уже подана ли заявка этого пользователя / состоит ли он в группе.
    const userId = c.get("user").id;
    let myRequest: string | null = null;
    let member = false;
    if (invite) {
      const [reqRes, memberRes] = await Promise.all([
        service.from("group_join_requests")
          .select("status").eq("group_id", invite.group_id).eq("user_id", userId).maybeSingle(),
        service.from("group_memberships")
          .select("group_id").eq("group_id", invite.group_id).eq("user_id", userId).eq("is_active", true).limit(1),
      ]);
      if (reqRes.error) throw reqRes.error;
      if (memberRes.error) throw memberRes.error;
      myRequest = reqRes.data ? String((reqRes.data as any).status) : null;
      member = Boolean(memberRes.data?.length);
    }
    return c.json(ok({
      valid,
      group_name: group?.name || group?.code || null,
      reason: !invite ? "Ссылка не найдена" : invite.revoked_at ? "Ссылка отозвана" : expired ? "Срок ссылки истёк" : exhausted ? "Лимит ссылки исчерпан" : null,
      my_request: myRequest,
      member,
    }, rid));
  } catch (infoError) {
    console.error("[block8:invite-info]", infoError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Информация о ссылке недоступна");
  }
});

block8.post("/invites/:token/join", requireAuth, async (c) => {
  const rid = requestId();
  const token = (c.req.param("token") || "").replace(/[^0-9a-f]/gi, "").slice(0, 64);
  if (!token) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный токен");
  const service = createServiceClient(c.env);
  if (!service) return err(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { data: invite, error: inviteError } = await service
      .from("group_invites")
      .select("id,group_id,expires_at,revoked_at,uses,max_uses")
      .eq("token", token).maybeSingle();
    if (inviteError) throw inviteError;
    const row = invite as any;
    const expired = row?.expires_at ? Date.parse(row.expires_at) < Date.now() : false;
    const exhausted = row?.max_uses != null && Number(row.uses) >= Number(row.max_uses);
    if (!row || row.revoked_at || expired || exhausted) {
      return err(c, rid, 410, "INVITE_INVALID", "Ссылка недействительна");
    }
    const userId = c.get("user").id;
    const { data: membership } = await service
      .from("group_memberships")
      .select("group_id").eq("group_id", row.group_id).eq("user_id", userId).eq("is_active", true).limit(1);
    if (membership?.length) return err(c, rid, 409, "ALREADY_MEMBER", "Вы уже состоите в этой группе");
    const { data: existing } = await service
      .from("group_join_requests")
      .select("id,status").eq("group_id", row.group_id).eq("user_id", userId).maybeSingle();
    if (existing && String((existing as any).status) === "pending") {
      return c.json(ok({ status: "pending", created: false }, rid));
    }
    if (existing && String((existing as any).status) === "approved") {
      return err(c, rid, 409, "ALREADY_MEMBER", "Заявка уже подтверждена");
    }
    if (existing) {
      const { error: updateError } = await service
        .from("group_join_requests")
        .update({ status: "pending", decided_by: null, decided_at: null, invite_id: row.id, created_at: new Date().toISOString() })
        .eq("id", (existing as any).id);
      if (updateError) throw updateError;
      return c.json(ok({ status: "pending", created: false }, rid), 200);
    }
    const { error: insertError } = await service
      .from("group_join_requests")
      .insert({ group_id: row.group_id, user_id: userId, invite_id: row.id, status: "pending" });
    if (insertError) throw insertError;
    await service.from("group_invites").update({ uses: Number(row.uses || 0) + 1 }).eq("id", row.id);
    return c.json(ok({ status: "pending", created: true }, rid), 201);
  } catch (joinError) {
    console.error("[block8:invite-join]", joinError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось подать заявку");
  }
});
}
