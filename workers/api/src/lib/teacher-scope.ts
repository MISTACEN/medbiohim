/**
 * Область преподавателя (план §10).
 *
 * Роль `teacher` сама по себе не даёт доступа к чужим группам и работам.
 * Область складывается из записей `teacher_assignments` (группа или студент)
 * и явного `homeworks.assigned_teacher`. Администратор область не использует:
 * он видит всё, и это проверяется отдельно в вызывающем коде.
 *
 * Если таблицы назначений ещё нет (миграция не применена), модуль работает
 * fail-closed: область пустая, доступ к чужим объектам не выдаётся.
 */

export type TeacherScope = {
  teacherId: string;
  groups: string[];
  students: string[];
  available: boolean;
};

export type ScopedObject = {
  createdBy?: unknown;
  assignedTeacher?: unknown;
  groupIds?: Array<string | null | undefined>;
  studentIds?: Array<string | null | undefined>;
};

const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

function emptyScope(teacherId: string, available: boolean): TeacherScope {
  return { teacherId, groups: [], students: [], available };
}

/** Читает назначения преподавателя. Ошибку БД не скрывает от вызывающего. */
export async function loadTeacherScope(db: any, teacherId: string): Promise<TeacherScope> {
  if (!teacherId) return emptyScope("", false);
  const { data, error } = await db
    .from("teacher_assignments")
    .select("group_id,student_id")
    .eq("teacher_id", teacherId)
    .limit(500);
  if (error) {
    const code = String((error as { code?: unknown }).code || "");
    if (MISSING_TABLE.has(code)) {
      console.warn("[teacher-scope] teacher_assignments is not migrated yet; fail closed");
      return emptyScope(teacherId, false);
    }
    throw error;
  }
  const groups = new Set<string>();
  const students = new Set<string>();
  for (const row of data || []) {
    const groupId = String((row as { group_id?: unknown }).group_id || "");
    const studentId = String((row as { student_id?: unknown }).student_id || "");
    if (groupId) groups.add(groupId);
    if (studentId) students.add(studentId);
  }
  return { teacherId, groups: [...groups], students: [...students], available: true };
}

/**
 * Правила области, в порядке приоритета:
 *  1. преподаватель — автор объекта;
 *  2. преподаватель явно назначен проверяющим;
 *  3. объект относится к назначенной группе;
 *  4. объект принадлежит назначенному студенту.
 */
export function isWithinTeachingScope(scope: TeacherScope, target: ScopedObject): boolean {
  if (!scope.teacherId) return false;
  if (target.createdBy && String(target.createdBy) === scope.teacherId) return true;
  if (target.assignedTeacher && String(target.assignedTeacher) === scope.teacherId) return true;
  for (const groupId of target.groupIds || []) {
    if (groupId && scope.groups.includes(String(groupId))) return true;
  }
  for (const studentId of target.studentIds || []) {
    if (studentId && scope.students.includes(String(studentId))) return true;
  }
  return false;
}

/**
 * Предметы преподавателя (`teacher_subjects`). До миграции таблицы нет —
 * возвращаем пустой список: кабинет работает по опубликованному каталогу.
 */
export async function loadTeacherSubjectIds(db: any, teacherId: string): Promise<string[]> {
  if (!teacherId) return [];
  const { data, error } = await db
    .from("teacher_subjects")
    .select("subject_id")
    .eq("teacher_id", teacherId)
    .limit(200);
  if (error) {
    const code = String((error as { code?: unknown }).code || "");
    if (MISSING_TABLE.has(code)) return [];
    throw error;
  }
  const ids: string[] = (data || [])
    .map((row: { subject_id?: unknown }) => String(row.subject_id || ""))
    .filter((value: string): value is string => Boolean(value));
  return [...new Set(ids)];
}

/** Краткое описание области для интерфейса кабинета. */
export function describeScope(scope: TeacherScope): {
  groups: number;
  students: number;
  active: boolean;
  available: boolean;
} {
  return {
    groups: scope.groups.length,
    students: scope.students.length,
    active: scope.available && (scope.groups.length > 0 || scope.students.length > 0),
    available: scope.available,
  };
}
