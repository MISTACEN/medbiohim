/**
 * Три независимых уровня полномочий (план, §10):
 *   роль → доступ к модулю → действие в области (scope).
 *
 * Здесь только роль и capability: проверка принадлежности объекта и RLS
 * выполняются на сервере. Клиентская функция нужна, чтобы не показывать
 * недоступное, и не заменяет серверную проверку.
 *
 * Ключевое ограничение из плана: роль teacher не даёт административных
 * полномочий. Группы, роли, глобальный каталог и доступ к модулям — только
 * admin. Модератор не получает Admin-консоль автоматически.
 */

export const ROLES = ["admin", "teacher", "student", "moderator"] as const;
export type Role = (typeof ROLES)[number];

export type Capability =
  // Администрирование платформы.
  | "admin.users.manage"
  | "admin.roles.manage"
  | "admin.groups.manage"
  | "admin.subjects.manage"
  | "admin.modules.manage"
  | "admin.settings.manage"
  | "admin.audit.view"
  // Кабинет преподавателя.
  | "teacher.content.manage"
  | "teacher.tests.publish"
  | "teacher.results.view"
  | "teacher.submissions.grade"
  // Студенческие и общие возможности.
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
  student: STUDENT_CAPABILITIES,
  moderator: MODERATOR_CAPABILITIES,
};

export function normalizeRoles(roles: readonly unknown[] | null | undefined): Role[] {
  if (!Array.isArray(roles)) return [];
  const known = new Set<string>(ROLES);
  return [
    ...new Set(
      roles
        .map((role) => String(role ?? "").trim().toLowerCase())
        .filter((role): role is Role => known.has(role)),
    ),
  ];
}

export function hasRole(roles: readonly unknown[] | null | undefined, role: Role): boolean {
  return normalizeRoles(roles).includes(role);
}

/** Capability считается выданной, если её даёт хотя бы одна роль. */
export function capabilitiesFor(roles: readonly unknown[] | null | undefined): Set<Capability> {
  const result = new Set<Capability>();
  for (const role of normalizeRoles(roles)) {
    for (const capability of CAPABILITIES_BY_ROLE[role]) result.add(capability);
  }
  return result;
}

export function hasCapability(
  roles: readonly unknown[] | null | undefined,
  capability: Capability,
): boolean {
  return capabilitiesFor(roles).has(capability);
}

/**
 * Админ-консоль — только admin. Teacher и moderator работают в своих
 * пространствах и не должны видеть Admin даже в навигации.
 */
export function canEnterAdminConsole(roles: readonly unknown[] | null | undefined): boolean {
  return hasRole(roles, "admin");
}

/** Кабинет преподавателя доступен teacher и admin; модератор туда не входит. */
export function canUseTeacherWorkspace(roles: readonly unknown[] | null | undefined): boolean {
  const normalized = normalizeRoles(roles);
  return normalized.includes("admin") || normalized.includes("teacher");
}

/** Группы и членство создаёт и меняет только администратор. */
export function canManageGroups(roles: readonly unknown[] | null | undefined): boolean {
  return hasCapability(roles, "admin.groups.manage");
}

/** Глобальный каталог предметов и его структура — только администратор. */
export function canManageGlobalCatalog(roles: readonly unknown[] | null | undefined): boolean {
  return hasCapability(roles, "admin.subjects.manage");
}

/**
 * Проверка области для учебного объекта. Роль сама по себе недостаточна:
 * нужен активный scope конкретного преподавателя.
 */
export type TeachingScope = {
  groupIds: readonly string[];
  studentIds: readonly string[];
  active: boolean;
  expiresAt?: string | null;
};

export function isScopeActive(scope: TeachingScope | null | undefined, now = new Date()): boolean {
  if (!scope || !scope.active) return false;
  if (!scope.expiresAt) return true;
  const expiry = new Date(scope.expiresAt);
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry.getTime() > now.getTime();
}

export function scopeCoversStudent(
  scope: TeachingScope | null | undefined,
  studentId: string,
  groupIds: readonly string[] = [],
  now = new Date(),
): boolean {
  if (!isScopeActive(scope, now)) return false;
  const target = scope!;
  if (studentId && target.studentIds.includes(studentId)) return true;
  return groupIds.some((groupId) => target.groupIds.includes(groupId));
}

/** Объект, к которому применяется область преподавателя. */
export type ScopedTeachingTarget = {
  createdBy?: string | null;
  assignedTeacher?: string | null;
  groupIds?: Array<string | null | undefined>;
  studentIds?: Array<string | null | undefined>;
};

/**
 * Правила области, совпадающие с серверными (`workers/api/src/lib/teacher-scope.ts`):
 * авторство, явное назначение проверяющим, назначенная группа, назначенный
 * студент. Клиентская копия нужна только для скрытия недоступного; решение
 * принимает сервер.
 */
export function isWithinTeachingScope(
  scope: TeachingScope | null | undefined,
  teacherId: string,
  target: ScopedTeachingTarget,
): boolean {
  if (!isScopeActive(scope) || !teacherId) return false;
  if (target.createdBy && String(target.createdBy) === teacherId) return true;
  if (target.assignedTeacher && String(target.assignedTeacher) === teacherId) return true;
  for (const groupId of target.groupIds || []) {
    if (groupId && scope!.groupIds.includes(String(groupId))) return true;
  }
  for (const studentId of target.studentIds || []) {
    if (studentId && scope!.studentIds.includes(String(studentId))) return true;
  }
  return false;
}
