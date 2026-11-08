/**
 * Блок 8: инвайт-ссылки в группы с подтверждением старосты + тревожная кнопка.
 *
 * Инвайты: администратор создаёт ссылку /invite/<token>; студент по ссылке
 * оставляет заявку; староста группы (group_memberships.role_in_group='starosta')
 * подтверждает — запись в группу делает воркер service-клиентом.
 * SOS: студент отправляет короткое сообщение, админ видит и закрывает.
 */
import { Hono } from "hono";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, requireAdmin, type AuthVariables } from "../middleware/auth";
import { callerRoles, canAdminister } from "../lib/permissions";
import { createServiceClient } from "../lib/supabase";
import type { Env } from "../env";

type Vars = { Bindings: Env; Variables: AuthVariables };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function err(c: any, rid: string, status: number, code: string, message: string) {
  const { body, status: s } = fail(code, message, status, rid);
  return c.json(body, s as any);
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const block8 = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/* ------------------------------ Инвайты ------------------------------ */

// Администратор: создать инвайт-ссылку группы.
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

// Администратор: список активных ссылок группы.
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

// Администратор: отозвать ссылку.
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

// Студент: информация по токену (страница /invite/:token).
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

// Студент: подать заявку по токену.
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

// Староста/админ: заявки на вступление в мои группы.
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

// Староста/админ: решение по заявке — подтверждение добавляет в группу.
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

/* ------------------------- Тревожная кнопка -------------------------- */

// Студент: отправить SOS.
block8.post("/sos", requireAuth, async (c) => {
  const rid = requestId();
  let input: any = {};
  try { input = await c.req.json(); } catch { return err(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const message = String(input?.message || "").trim();
  if (!message) return err(c, rid, 422, "VALIDATION_ERROR", "Опишите проблему");
  if (message.length > 2000) return err(c, rid, 413, "PAYLOAD_TOO_LARGE", "Сообщение слишком длинное");
  const pageUrl = String(input?.page_url || "").slice(0, 500) || null;
  const service = createServiceClient(c.env);
  if (!service) return err(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    // Антифлуд: не больше 5 SOS в час от одного пользователя (считаем открытые).
    const userId = c.get("user").id;
    const { count, error: floodError } = await service
      .from("sos_reports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "open")
      .gte("created_at", new Date(Date.now() - 3600000).toISOString());
    if (floodError) throw floodError;
    if (Number(count || 0) >= 5) {
      return err(c, rid, 429, "RATE_LIMITED", "Слишком много обращений — подождите, администратор уже видит ваши сообщения");
    }
    const { data, error: insertError } = await service
      .from("sos_reports")
      .insert({ user_id: userId, message, page_url: pageUrl })
      .select("id,created_at")
      .single();
    if (insertError) throw insertError;
    return c.json(ok({ report: data }, rid), 201);
  } catch (sosError) {
    console.error("[block8:sos-create]", sosError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось отправить обращение");
  }
});

// Админ: список SOS.
block8.get("/admin/sos", requireAuth, requireAdmin, async (c) => {
  const rid = requestId();
  const service = createServiceClient(c.env);
  if (!service) return err(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { data, error: readError } = await service
      .from("sos_reports")
      .select("id,user_id,message,page_url,status,created_at,users!sos_reports_user_id_fkey(full_name,display_name,email)")
      .order("created_at", { ascending: false }).limit(200);
    if (readError) throw readError;
    const items = (data || []).map((row: any) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      return { ...row, users: undefined, user_name: user?.full_name || user?.display_name || user?.email || "—" };
    });
    return c.json(ok({ items }, rid));
  } catch (listError) {
    console.error("[block8:sos-list]", listError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Обращения недоступны");
  }
});

// Админ: закрыть SOS.
block8.post("/admin/sos/:id/close", requireAuth, requireAdmin, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return err(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID");
  const service = createServiceClient(c.env);
  if (!service) return err(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { error: closeError } = await service
      .from("sos_reports")
      .update({ status: "closed", closed_by: c.get("user").id, closed_at: new Date().toISOString() })
      .eq("id", id).eq("status", "open");
    if (closeError) throw closeError;
    return c.json(ok({ closed: true }, rid));
  } catch (closeError) {
    console.error("[block8:sos-close]", closeError);
    return err(c, rid, 503, "DB_UNAVAILABLE", "Не удалось закрыть обращение");
  }
});

export default block8;
