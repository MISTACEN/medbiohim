/**
 * Серверная модель полномочий MEDBIOHIM (план §10).
 *
 * Три уровня: роль → capability → область действия. Роль `teacher` сама по
 * себе не даёт административных прав: пользователи, роли, группы, членство,
 * глобальный каталог предметов, доступ к модулям и системные настройки —
 * только `admin`. `moderator` не получает Admin автоматически.
 *
 * Модуль намеренно не дублирует фронтенд-реестр, но совпадает с ним по
 * названиям capabilities; контракт проверяется тестом
 * test/permissions.test.js.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Context } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../middleware/auth";
import { fail, requestId } from "./response";

export const ROLES = ["admin", "teacher", "student", "moderator"] as const;
export type Role = (typeof ROLES)[number];

export type Capability =
  | "admin.users.manage"
  | "admin.roles.manage"
  | "admin.groups.manage"
  | "admin.subjects.manage"
  | "admin.modules.manage"
  | "admin.settings.manage"
  | "admin.audit.view"
  | "teacher.content.manage"
  | "teacher.tests.publish"
  | "teacher.results.view"
  | "teacher.submissions.grade"
  | "workshop.publish"
  | "workshop.moderate"
  | "personal.homework.manage";

const ADMIN_CAPABILITIES: readonly Capability[] = [
  "admin.users.manage",
  "admin.roles.manage",
  "admin.groups.manage",
  "admin.subjects.manage",
  "admin.modules.manage",
  "admin.settings.manage",
  "admin.audit.view",
];

const TEACHER_CAPABILITIES: readonly Capability[] = [
  "teacher.content.manage",
  "teacher.tests.publish",
  "teacher.results.view",
  "teacher.submissions.grade",
  "workshop.publish",
  "personal.homework.manage",
];

const MODERATOR_CAPABILITIES: readonly Capability[] = ["workshop.moderate", "workshop.publish"];
const STUDENT_CAPABILITIES: readonly Capability[] = ["workshop.publish", "personal.homework.manage"];

const CAPABILITIES_BY_ROLE: Record<Role, readonly Capability[]> = {
  admin: [...ADMIN_CAPABILITIES, ...TEACHER_CAPABILITIES, ...MODERATOR_CAPABILITIES],
  teacher: TEACHER_CAPABILITIES,
  moderator: MODERATOR_CAPABILITIES,
  student: STUDENT_CAPABILITIES,
};

type Ctx = Context<{ Bindings: Env; Variables: AuthVariables }>;

/** Разбирает ответ `user_roles(roles(code))` — PostgREST может вернуть объект или массив. */
export function roleCodesFromRows(rows: unknown): string[] {
  const codes = new Set<string>();
  if (!Array.isArray(rows)) return [];
  for (const row of rows) {
    const related = Array.isArray((row as { roles?: unknown })?.roles)
      ? ((row as { roles: unknown[] }).roles)
      : [(row as { roles?: unknown })?.roles];
    for (const role of related) {
      const code = String((role as { code?: unknown })?.code || role || "")
        .trim()
        .toLowerCase();
      if ((ROLES as readonly string[]).includes(code)) codes.add(code);
    }
  }
  return [...codes];
}

export async function callerRoles(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await db
    .from("user_roles")
    .select("roles(code)")
    .eq("user_id", userId)
    .limit(25);
  if (error) throw error;
  return roleCodesFromRows(data);
}

export function capabilitiesFor(roles: readonly string[]): Set<Capability> {
  const result = new Set<Capability>();
  for (const role of roles) {
    const known = (ROLES as readonly string[]).includes(role) ? (role as Role) : null;
    if (!known) continue;
    for (const capability of CAPABILITIES_BY_ROLE[known]) result.add(capability);
  }
  return result;
}

export function hasCapability(roles: readonly string[], capability: Capability): boolean {
  return capabilitiesFor(roles).has(capability);
}

/** Администратор платформы: единственная роль с административными capability. */
export function canAdminister(roles: readonly string[]): boolean {
  return roles.includes("admin");
}

/** Группы, членство, роли и доступ к модулям меняет только admin. */
export function canManageGroups(roles: readonly string[]): boolean {
  return hasCapability(roles, "admin.groups.manage");
}

/** Глобальный каталог предметов — только admin. */
export function canManageGlobalCatalog(roles: readonly string[]): boolean {
  return hasCapability(roles, "admin.subjects.manage");
}

export function canUseTeacherWorkspace(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("teacher");
}

/**
 * Проверка области для учебного объекта. Одной роли недостаточно: результат
 * должен принадлежать назначенной области преподавателя.
 */
export function ownsContent(
  roles: readonly string[],
  userId: string,
  createdBy: unknown,
): boolean {
  if (canAdminister(roles)) return true;
  if (!roles.includes("teacher")) return false;
  return Boolean(userId) && String(createdBy || "") === userId;
}

function deny(c: Ctx, status: 403 | 503, code: string, message: string): false {
  const { body } = fail(code, message, status, requestId());
  c.res = c.json(body, status);
  return false;
}

async function resolveRoles(c: Ctx): Promise<string[] | null> {
  try {
    return await callerRoles(c.get("supabase"), c.get("user").id);
  } catch {
    return null;
  }
}

/** Только администратор. При отказе ответ уже записан в `c.res`. */
export async function requireAdmin(c: Ctx): Promise<boolean> {
  const roles = await resolveRoles(c);
  if (roles === null) {
    return deny(c, 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить права доступа");
  }
  if (canAdminister(roles)) return true;
  return deny(c, 403, "FORBIDDEN", "Требуются права администратора");
}

/** Конкретная capability. При отказе ответ уже записан в `c.res`. */
export async function requireCapability(c: Ctx, capability: Capability): Promise<boolean> {
  const roles = await resolveRoles(c);
  if (roles === null) {
    return deny(c, 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить права доступа");
  }
  if (hasCapability(roles, capability)) return true;
  return deny(c, 403, "FORBIDDEN", "Недостаточно прав для этого действия");
}

/** Администратор или преподаватель с выданной capability. */
export async function requireTeachingCapability(c: Ctx, capability: Capability): Promise<boolean> {
  const roles = await resolveRoles(c);
  if (roles === null) {
    return deny(c, 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить права доступа");
  }
  if (canAdminister(roles)) return true;
  if (canUseTeacherWorkspace(roles) && hasCapability(roles, capability)) return true;
  return deny(c, 403, "FORBIDDEN", "Действие доступно только назначенному преподавателю");
}
