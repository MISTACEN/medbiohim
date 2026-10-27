/**
 * Кто вообще может открыть `/admin`. Список совпадает с серверным: воркер
 * пускает admin/moderator/teacher (`MANAGERS` в `workers/api/src/routes/admin.ts`),
 * а разделы пользователей, БД, импорта и Telegram — только role=admin
 * (`STRICT_ADMINS`). Клиентская проверка лишь прячет недоступное; решение
 * всегда принимает сервер.
 */
export const STAFF_ROLES = ["admin", "moderator", "teacher"] as const;
export const STRICT_ADMIN_ROLES = ["admin"] as const;

export function normalizeRoles(roles: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(roles)) return [];
  return [
    ...new Set(
      roles
        .map((role) => String(role || "").trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export function hasAnyRole(
  roles: readonly unknown[] | null | undefined,
  allowed: readonly string[] = STAFF_ROLES
): boolean {
  return normalizeRoles(roles).some((role) => allowed.includes(role));
}

/** Может ли пользователь открыть админ-панель вообще. */
export function isStaff(roles: readonly unknown[] | null | undefined): boolean {
  return hasAnyRole(roles, STAFF_ROLES);
}

/** Доступ только для администратора: пользователи, база, импорт, webhook, перенос контента. */
export function isStrictAdmin(roles: readonly unknown[] | null | undefined): boolean {
  return hasAnyRole(roles, STRICT_ADMIN_ROLES);
}

/** Виден ли пункт навигации этому набору ролей. */
export function canSeeAdminItem(
  item: { strictAdmin?: boolean },
  roles: readonly unknown[] | null | undefined
): boolean {
  return item.strictAdmin ? isStrictAdmin(roles) : isStaff(roles);
}
