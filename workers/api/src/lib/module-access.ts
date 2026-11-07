/**
 * Централизованный доступ к разделам (концепция §5, Access Control).
 *
 * Три уровня проверки согласованы: навигация показывает только разрешённые
 * разделы (GET /access/my-modules), Worker отсекает закрытые маршруты
 * (moduleGate), RLS не отдаёт клиенту чужие разрешения и групповые правила.
 *
 * Правила разрешения (в порядке приоритета):
 *  1. admin — всегда всё;
 *  2. индивидуальный deny — запрет сильнее всего;
 *  3. индивидуальный allow;
 *  4. групповой deny;
 *  5. групповой allow;
 *  6. режим раздела по умолчанию: open — всем, restricted — никому без выдачи.
 *
 * Просроченные записи (expires_at < now) не учитываются. Если таблиц ещё нет
 * (миграция не применена), доступ открывается (fail-open): закрыть весь сайт
 * из-за отсутствующей миграции нельзя; решение сознательное и задокументировано
 * в MODULAR_MIGRATION_HANDOFF.md.
 */
import type { Context, Next } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import { createServiceClient } from "./supabase";
import { fail, requestId } from "./response";
import {
  MISSING_TABLE,
  isExpired,
  resolveAccess,
  type EffectiveAccess,
  type GrantRow,
  type ModuleRow,
} from "./module-access-rules";

export { pickGrantMode, resolveAccess } from "./module-access-rules";
export type { GrantMode, GrantRow, ModuleMode, ModuleRow, EffectiveAccess } from "./module-access-rules";

/**
 * Разделы, закрытые для преподавателя даже при обходе студенческой навигации.
 * Workshop — peer-sharing студентов; роль teacher в него не допускается (план §40).
 */
const STUDENT_ONLY_MODULE_KEYS = new Set(["workshop"]);

function groupByModule(rows: GrantRow[]): Record<string, GrantRow[]> {
  const map: Record<string, GrantRow[]> = {};
  for (const row of rows) {
    const key = String(row.module_key || "");
    if (!key) continue;
    (map[key] ||= []).push(row);
  }
  return map;
}

/** Реестр разделов. missing = true, если миграция ещё не применена. */
export async function loadModuleRegistry(db: any): Promise<{
  modules: ModuleRow[];
  missing: boolean;
}> {
  const { data, error } = await db
    .from("app_modules")
    .select("key,title,sort_order,default_mode,is_active")
    .order("sort_order").limit(200);
  const code = String((error as any)?.code || "");
  if (MISSING_TABLE.has(code)) {
    console.warn("[module-access] app_modules is not migrated yet; fail-open");
    return { modules: [], missing: true };
  }
  if (error) throw error;
  return { modules: (data || []) as ModuleRow[], missing: false };
}

/** Группы пользователя по активному членству. */
export async function userGroupIds(db: any, userId: string): Promise<string[]> {
  const { data, error } = await db
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(100);
  if (error) throw error;
  const rows = (data || []) as Array<{ group_id?: unknown }>;
  return [...new Set(rows.map((row) => String(row.group_id || "")).filter(Boolean))];
}

/** Индивидуальные разрешения пользователя (только его строки). */
export async function userModuleGrants(db: any, userId: string): Promise<Record<string, GrantRow[]>> {
  const { data, error } = await db
    .from("user_module_access")
    .select("id,module_key,mode,expires_at")
    .eq("user_id", userId)
    .limit(500);
  if (error) throw error;
  return groupByModule(((data || []) as GrantRow[]).filter((row) => !isExpired(row)));
}

/** Групповые разрешения указанных групп. */
export async function groupModuleGrants(
  db: any,
  groupIds: readonly string[],
): Promise<Record<string, GrantRow[]>> {
  if (!groupIds.length) return {};
  const { data, error } = await db
    .from("group_module_access")
    .select("id,group_id,module_key,mode,expires_at")
    .in("group_id", [...groupIds] as string[])
    .limit(20000);
  if (error) throw error;
  return groupByModule(((data || []) as GrantRow[]).filter((row) => !isExpired(row)));
}

/**
 * Эффективный доступ пользователя. `extraGroupIds` — группы, найденные вне
 * активного членства (например, прямые назначения преподавателю).
 */
export async function effectiveModuleAccess(
  env: Env,
  userId: string,
  roles: readonly string[],
  extraGroupIds: readonly string[] = [],
): Promise<EffectiveAccess & { modules: ModuleRow[] }> {
  if (roles.includes("admin")) {
    const allowed = new Set<string>(["*"]);
    return { allowed, granted: allowed, denied: new Set(), resolved: true, modules: [] };
  }
  const service = createServiceClient(env);
  if (!service) {
    // Service-ключ не сконфигурирован: разделы не вычислить — открываем (fail-open).
    console.warn("[module-access] service client unavailable; fail-open");
    const allowed = new Set<string>(["*"]);
    return { allowed, granted: new Set<string>(), denied: new Set<string>(), resolved: false, modules: [] };
  }
  const registry = await loadModuleRegistry(service);
  if (registry.missing) {
    return {
      allowed: new Set<string>(["*"]),
      granted: new Set<string>(),
      denied: new Set<string>(),
      resolved: false,
      modules: [],
    };
  }
  const groupIds = [...new Set([...(await userGroupIds(service, userId)), ...extraGroupIds])];
  const [userGrants, groupGrants] = await Promise.all([
    userModuleGrants(service, userId),
    groupModuleGrants(service, groupIds),
  ]);
  const access = resolveAccess(registry.modules, userGrants, groupGrants);
  return { ...access, modules: registry.modules };
}

type GateContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

/**
 * Промежуточный слой маршрута: пропускает только тех, кому открыт раздел.
 * Ставится после requireAuth. teacher обходит разделы студента: его границы
 * задают capability и область, а не студенческая навигация.
 */
export function moduleGate(
  moduleKey: string,
  options: { denyRoles?: readonly string[] } = {},
) {
  return async (c: GateContext, next: Next) => {
    const rid = requestId();
    const db = c.get("supabase");
    try {
      const { data, error } = await db
        .from("user_roles")
        .select("roles(code)")
        .eq("user_id", c.get("user").id)
        .limit(25);
      if (error) throw error;
      const roles = (data || []).map((row: any) =>
        String((Array.isArray(row.roles) ? row.roles[0] : row.roles)?.code || "").toLowerCase(),
      ).filter(Boolean);
      if (roles.includes("admin")) return next();
      // Преподаватель обходит студенческую навигацию (его границы задают
      // capability и область), но студенческие peer-пространства закрыты
      // явным отказом: иначе раздел с default_mode=open его бы пропустил.
      if (roles.includes("teacher")) {
        if (!STUDENT_ONLY_MODULE_KEYS.has(moduleKey)) return next();
        const { body: deniedBody, status: deniedStatus } = fail(
          "MODULE_FORBIDDEN",
          "Раздел доступен только студентам: это пространство взаимопомощи.",
          403,
          rid,
        );
        return c.json(deniedBody, deniedStatus as 403);
      }
      const access = await effectiveModuleAccess(c.env, c.get("user").id, roles);
      if (access.allowed.has("*") || access.allowed.has(moduleKey)) return next();
      const { body, status } = fail(
        "MODULE_FORBIDDEN",
        "Раздел не открыт для вашей учётной записи. Попросите администратора выдать доступ.",
        403,
        rid,
      );
      return c.json(body, status as 403);
    } catch (gateError) {
      // БД недоступна: не блокируем весь сайт, но фиксируем инцидент.
      console.error("[module-access:gate]", moduleKey, gateError);
      return next();
    }
  };
}
