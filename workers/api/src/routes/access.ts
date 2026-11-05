import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, requireAdmin, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";
import { effectiveModuleAccess, loadModuleRegistry } from "../lib/module-access";

/**
 * Управление доступом к разделам (концепция §5).
 *
 * /access/my-modules — только разрешённые пользователю разделы (для навигации).
 * /access/admin/* — выдача, отзыв, режимы по умолчанию и журнал. Всё под
 * requireAdmin: преподаватель и модератор этой поверхности не видят.
 */
const access = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODULE_KEY = /^[a-z][a-z0-9-]{0,63}$/;

function error(c: any, rid: string, status: number, code: string, message: string) {
  const { body, status: responseStatus } = fail(code, message, status, rid);
  return c.json(body, responseStatus as any);
}

async function audit(
  db: any,
  actorId: string,
  action: string,
  scope: string,
  target: string | null,
  moduleKey: string | null,
  details: Record<string, unknown> = {},
) {
  const { error: auditError } = await db.from("access_audit_log").insert({
    actor_id: actorId,
    action,
    scope,
    target,
    module_key: moduleKey,
    details,
  });
  if (auditError) throw auditError;
}

/** Разделы, открытые текущему пользователю. Каталог чужих прав не раскрывается. */
access.get("/my-modules", requireAuth, async (c) => {
  const rid = requestId();
  const userId = c.get("user").id;
  try {
    const db = c.get("supabase");
    const { data, error: rolesError } = await db
      .from("user_roles")
      .select("roles(code)")
      .eq("user_id", userId)
      .limit(25);
    if (rolesError) throw rolesError;
    const roles = (data || []).map((row: any) =>
      String((Array.isArray(row.roles) ? row.roles[0] : row.roles)?.code || "").toLowerCase(),
    ).filter(Boolean);
    const isAdmin = roles.includes("admin");
    const isTeacher = roles.includes("teacher");
    // admin/teacher видят весь активный реестр: их границы задают capability,
    // а не студенческие разделы. Шорткат effectiveModuleAccess для admin не
    // возвращает список модулей, поэтому для staff читаем реестр напрямую.
    let source;
    if (isAdmin || isTeacher) {
      const service = createServiceClient(c.env);
      if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
      const registry = await loadModuleRegistry(service);
      source = registry.modules;
    } else {
      const accessResult = await effectiveModuleAccess(c.env, userId, roles);
      source = accessResult.resolved === false
        ? accessResult.modules
        : accessResult.modules.filter((item) => accessResult.allowed.has(item.key));
    }
    return c.json(ok({
      items: source
        .filter((item) => item.is_active)
        .map((item) => ({ key: item.key, title: item.title })),
      staff: isAdmin || isTeacher,
      resolved: true,
    }, rid));
  } catch (readError) {
    console.error("[access:my-modules]", readError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось получить доступные разделы");
  }
});

/** Реестр разделов с режимами по умолчанию. */
access.get("/admin/modules", requireAdmin, async (c) => {
  const rid = requestId();
  try {
    const service = createServiceClient(c.env);
    const { modules, missing } = await loadModuleRegistry(service);
    if (missing) return error(c, rid, 503, "MIGRATION_MISSING", "Миграция module_access не применена");
    return c.json(ok({ items: modules }, rid));
  } catch (readError) {
    console.error("[access:admin-modules]", readError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Реестр разделов недоступен");
  }
});

/** Режим раздела по умолчанию: open (виден всем) или restricted (по выдаче). */
access.patch("/admin/modules/:key", requireAdmin, async (c) => {
  const rid = requestId();
  const key = c.req.param("key") || "";
  if (!MODULE_KEY.test(key)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный ключ раздела");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input?.default_mode != null) {
    if (!["open", "restricted"].includes(String(input.default_mode))) {
      return error(c, rid, 422, "VALIDATION_ERROR", "default_mode: open или restricted");
    }
    patch.default_mode = String(input.default_mode);
  }
  if (input?.is_active != null) patch.is_active = input.is_active === true;
  if (!("default_mode" in patch) && !("is_active" in patch)) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Нет полей для обновления");
  }
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { data, error: updateError } = await service
      .from("app_modules")
      .update(patch)
      .eq("key", key)
      .select("key,title,default_mode,is_active")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Раздел не найден");
    await audit(service, c.get("user").id,
      "default_mode" in patch ? "set_default" : "toggle_active",
      "module", key, key, patch);
    return c.json(ok({ module: data }, rid));
  } catch (writeError) {
    console.error("[access:set-module]", writeError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось изменить раздел");
  }
});

/** Разрешения пользователя или группы: ?scope=user|group&target=<uuid>. */
access.get("/admin/grants", requireAdmin, async (c) => {
  const rid = requestId();
  const scope = String(c.req.query("scope") || "user");
  const target = String(c.req.query("target") || "");
  if (!["user", "group"].includes(scope)) return error(c, rid, 422, "VALIDATION_ERROR", "scope: user или group");
  if (!UUID.test(target)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный target");
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const table = scope === "user" ? "user_module_access" : "group_module_access";
    const column = scope === "user" ? "user_id" : "group_id";
    const { data, error: readError } = await service
      .from(table)
      .select("id,module_key,mode,expires_at,note,created_by,created_at,app_modules(title)")
      .eq(column, target)
      .order("created_at", { ascending: false })
      .limit(500);
    if (readError) throw readError;
    const items = (data || []).map((row: any) => {
      const moduleInfo = Array.isArray(row.app_modules) ? row.app_modules[0] : row.app_modules;
      return {
        id: row.id,
        module_key: row.module_key,
        module_title: moduleInfo?.title || row.module_key,
        mode: row.mode,
        expires_at: row.expires_at,
        note: row.note,
        created_at: row.created_at,
      };
    });
    let targetName: string | null = null;
    if (scope === "user") {
      const { data: person } = await service
        .from("users").select("display_name,full_name,email").eq("id", target).maybeSingle();
      targetName = person
        ? String(person.display_name || person.full_name || person.email || "Пользователь")
        : null;
    } else {
      const { data: group } = await service
        .from("groups").select("name,code").eq("id", target).maybeSingle();
      targetName = group ? String(group.name || group.code || "Группа") : null;
    }
    return c.json(ok({ scope, target, target_name: targetName, items }, rid));
  } catch (readError) {
    console.error("[access:grants]", readError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Разрешения недоступны");
  }
});

/** Выдать или изменить разрешение (allow/deny, опционально со сроком). */
access.post("/admin/grants", requireAdmin, async (c) => {
  const rid = requestId();
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const scope = String(input?.scope || "user");
  const targetId = String(input?.target_id || "");
  const moduleKey = String(input?.module_key || "");
  const mode = String(input?.mode || "allow");
  const expiresAt = input?.expires_at ? String(input.expires_at) : null;
  const note = input?.note ? String(input.note).slice(0, 300) : null;
  if (!["user", "group"].includes(scope)) return error(c, rid, 422, "VALIDATION_ERROR", "scope: user или group");
  if (!UUID.test(targetId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный target_id");
  if (!MODULE_KEY.test(moduleKey)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный module_key");
  if (!["allow", "deny"].includes(mode)) return error(c, rid, 422, "VALIDATION_ERROR", "mode: allow или deny");
  if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный срок действия");
  }
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  const table = scope === "user" ? "user_module_access" : "group_module_access";
  const column = scope === "user" ? "user_id" : "group_id";
  try {
    const { data: module } = await service
      .from("app_modules").select("key").eq("key", moduleKey).maybeSingle();
    if (!module) return error(c, rid, 404, "NOT_FOUND", "Раздел не найден");
    const { data, error: writeError } = await service
      .from(table)
      .upsert({
        [column]: targetId,
        module_key: moduleKey,
        mode,
        expires_at: expiresAt,
        note,
        granted_by: c.get("user").id,
        updated_at: new Date().toISOString(),
      }, { onConflict: `${column},module_key` })
      .select("id,module_key,mode,expires_at")
      .maybeSingle();
    if (writeError) throw writeError;
    await audit(service, c.get("user").id, "grant", scope, targetId, moduleKey, { mode, expires_at: expiresAt });
    return c.json(ok({ grant: data }, rid), 201);
  } catch (writeError) {
    console.error("[access:grant]", writeError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить разрешение");
  }
});

/** Отозвать разрешение по id. */
access.delete("/admin/grants/:id", requireAdmin, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  const scope = String(c.req.query("scope") || "user");
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  if (!["user", "group"].includes(scope)) return error(c, rid, 422, "VALIDATION_ERROR", "scope: user или group");
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  const table = scope === "user" ? "user_module_access" : "group_module_access";
  try {
    const { data, error: deleteError } = await service
      .from(table).delete().eq("id", id)
      .select("id,module_key")
      .maybeSingle();
    if (deleteError) throw deleteError;
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Разрешение не найдено");
    await audit(service, c.get("user").id, "revoke", scope, null, String((data as any).module_key), { grant_id: id });
    return c.json(ok({ removed: true, id }, rid));
  } catch (writeError) {
    console.error("[access:revoke]", writeError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось отозвать разрешение");
  }
});

/** Последние действия с правами доступа. */
access.get("/admin/audit", requireAdmin, async (c) => {
  const rid = requestId();
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 50), 1), 200);
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { data, error: readError } = await service
      .from("access_audit_log")
      .select("id,actor_id,action,scope,target,module_key,details,created_at,users(display_name,full_name,email)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (readError) {
      const code = String((readError as any).code || "");
      if (code === "42P01" || code === "PGRST205") {
        return error(c, rid, 503, "MIGRATION_MISSING", "Миграция module_access не применена");
      }
      throw readError;
    }
    const items = (data || []).map((row: any) => {
      const actor = Array.isArray(row.users) ? row.users[0] : row.users;
      return {
        id: row.id,
        action: row.action,
        scope: row.scope,
        target: row.target,
        module_key: row.module_key,
        details: row.details,
        created_at: row.created_at,
        actor_name: actor
          ? String(actor.display_name || actor.full_name || actor.email || "Админ")
          : null,
      };
    });
    return c.json(ok({ items }, rid));
  } catch (readError) {
    console.error("[access:audit]", readError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Журнал доступа недоступен");
  }
});

export default access;
