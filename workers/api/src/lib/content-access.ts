/**
 * Владение контентом (план §10).
 *
 * Администратор и модератор работают со всем контентом. Преподаватель — только
 * со своим: чужие лекции, вопросы и материалы ему недоступны, даже если он
 * знает ID. Роль teacher без владения не даёт прав на запись.
 */
import { fail, requestId } from "./response";

export type ContentRole = "admin" | "moderator" | "teacher" | "student";

const CONTENT_MANAGERS = new Set(["admin", "moderator"]);

export function rolesFromRows(rows: unknown): string[] {
  const codes = new Set<string>();
  if (!Array.isArray(rows)) return [];
  for (const row of rows) {
    const related = Array.isArray((row as { roles?: unknown })?.roles)
      ? ((row as { roles: unknown[] }).roles)
      : [(row as { roles?: unknown })?.roles];
    for (const role of related) {
      const code = String((role as { code?: unknown })?.code || role || "").toLowerCase().trim();
      if (code) codes.add(code);
    }
  }
  return [...codes];
}

/** Может ли роль управлять любым контентом (без привязки к автору). */
export function canManageAnyContent(roles: readonly string[]): boolean {
  return roles.some((role) => CONTENT_MANAGERS.has(role));
}

/**
 * Может ли пользователь править объект: менеджеры — всегда, преподаватель —
 * только свой объект и (для опубликованного) только после снятия с публикации.
 */
export function canEditContent(
  roles: readonly string[],
  userId: string,
  ownerId: unknown,
  options: { published?: boolean; allowPublished?: boolean } = {},
): boolean {
  if (canManageAnyContent(roles)) return true;
  if (!roles.includes("teacher")) return false;
  if (!userId || !ownerId || String(ownerId) !== userId) return false;
  if (options.published && options.allowPublished !== true) return false;
  return true;
}

/** Проверка владения с записью отказа в `c.res`. */
export async function requireContentOwnership(
  c: any,
  ownerId: unknown,
  options: { published?: boolean; allowPublished?: boolean } = {},
): Promise<boolean> {
  const rid = requestId();
  try {
    const { data, error } = await c.get("supabase")
      .from("user_roles").select("roles(code)")
      .eq("user_id", c.get("user").id).limit(25);
    if (error) throw error;
    const roles = rolesFromRows(data);
    if (canEditContent(roles, c.get("user").id, ownerId, options)) return true;
    const { body, status } = fail(
      "FORBIDDEN",
      "Этот контент принадлежит другому автору",
      403,
      rid,
    );
    c.res = c.json(body, status as 403);
    return false;
  } catch {
    const { body, status } = fail(
      "ROLE_CHECK_UNAVAILABLE",
      "Не удалось проверить права на контент",
      503,
      rid,
    );
    c.res = c.json(body, status as 503);
    return false;
  }
}
