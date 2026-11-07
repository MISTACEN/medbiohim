/**
 * Общие хелперы подмодулей кабинета преподавателя (routes/teacher/).
 * Роутер собирается в index.ts из доменных файлов.
 */
import type { Env } from "../../env";
import type { AuthVariables } from "../../middleware/auth";
import { fail } from "../../lib/response";
import { loadTeacherSubjectIds } from "../../lib/teacher-scope";

export type TeacherEnv = { Bindings: Env; Variables: AuthVariables };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ASSIGNMENT_ROLES = new Set(["teacher", "curator", "assistant"]);
export const SUBMISSION_FIELDS =
  "id,homework_id,user_id,status,grade,teacher_comment,text_answer,submitted_at,updated_at";

/**
 * В homework_submissions нет колонки graded_at: дата проверки лежит в
 * updated_at. Раньше запрос падал с 42703 и весь кабинет отдавал 503.
 * Контракт клиента сохраняем: graded_at вычисляется из статуса.
 */
function shapeSubmission(row: any) {
  const { updated_at, ...rest } = row || {};
  return {
    ...rest,
    graded_at: String(rest.status || "") === "graded" ? updated_at ?? null : null,
  };
}

export function error(c: any, rid: string, status: number, code: string, message: string) {
  const { body, status: responseStatus } = fail(code, message, status, rid);
  return c.json(body, responseStatus as any);
}

export function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value || "")).filter(Boolean))];
}

type HomeworkRow = {
  id: string;
  title: string;
  group_id: string | null;
  due_at: string | null;
  status: string | null;
  created_at: string | null;
};

/** Задания, доступные преподавателю: свои, по назначенным группам, у админа — все. */
export async function scopedHomeworks(
  db: any,
  isAdmin: boolean,
  userId: string,
  groups: readonly string[],
): Promise<HomeworkRow[]> {
  const queries: Array<PromiseLike<{ data: any[] | null; error: any }>> = [];
  const fields = "id,title,group_id,due_at,status,created_at";
  if (isAdmin) {
    queries.push(db.from("homeworks").select(fields).order("created_at", { ascending: false }).limit(2000));
  } else {
    queries.push(db.from("homeworks").select(fields).eq("created_by", userId).order("created_at", { ascending: false }).limit(1000));
    if (groups.length) {
      queries.push(db.from("homeworks").select(fields).in("group_id", groups as string[]).order("created_at", { ascending: false }).limit(1000));
    }
  }
  const responses = await Promise.all(queries);
  const byId = new Map<string, HomeworkRow>();
  for (const response of responses) {
    if (response.error) throw response.error;
    for (const row of response.data || []) {
      const id = String((row as any).id || "");
      if (id && !byId.has(id)) byId.set(id, row as HomeworkRow);
    }
  }
  return [...byId.values()];
}

/** Работы в области: по доступным заданиям и по назначенным студентам. */
export async function scopedSubmissions(
  db: any,
  isAdmin: boolean,
  homeworkIds: readonly string[],
  students: readonly string[],
  limit = 200,
) {
  const queries: Array<PromiseLike<{ data: any[] | null; error: any }>> = [];
  if (isAdmin) {
    queries.push(
      db.from("homework_submissions").select(SUBMISSION_FIELDS)
        .order("submitted_at", { ascending: false }).limit(limit),
    );
  } else {
    if (homeworkIds.length) {
      queries.push(
        db.from("homework_submissions").select(SUBMISSION_FIELDS)
          .in("homework_id", homeworkIds as string[])
          .order("submitted_at", { ascending: false }).limit(limit),
      );
    }
    if (students.length) {
      queries.push(
        db.from("homework_submissions").select(SUBMISSION_FIELDS)
          .in("user_id", students as string[])
          .order("submitted_at", { ascending: false }).limit(limit),
      );
    }
  }
  const responses = await Promise.all(queries);
  const byId = new Map<string, any>();
  for (const response of responses) {
    if (response.error) throw response.error;
    for (const row of response.data || []) {
      const id = String(row?.id || "");
      if (id && !byId.has(id)) byId.set(id, row);
    }
  }
  return [...byId.values()].map(shapeSubmission).sort((a, b) =>
    String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")),
  ).slice(0, limit);
}

/** Предметы преподавателя с названиями — для кабинета и админки. */
export async function teacherSubjects(db: any, teacherId: string): Promise<Array<{ id: string; name: string }>> {
  const ids = await loadTeacherSubjectIds(db, teacherId);
  if (!ids.length) return [];
  const { data, error: readError } = await db.from("subjects")
    .select("id,name").in("id", ids).limit(200);
  if (readError) throw readError;
  return (data || []).map((row: any) => ({ id: String(row.id), name: String(row.name || "") }));
}

export async function studentDirectory(db: any, studentIds: readonly string[]) {
  if (!studentIds.length) return new Map<string, { name: string; email: string | null }>();
  const { data, error: readError } = await db.from("users")
    .select("id,full_name,display_name,email").in("id", studentIds as string[]).limit(1000);
  if (readError) throw readError;
  const map = new Map<string, { name: string; email: string | null }>();
  for (const row of data || []) {
    map.set(String(row.id), {
      name: String(row.display_name || row.full_name || row.email || "Студент"),
      email: row.email ? String(row.email) : null,
    });
  }
  return map;
}

export type { Env, AuthVariables };

/**
 * Виден ли учителю результат по тесту (аналитика/ведомость/ручная проверка):
 * только свои тесты (created_by) или подключённые админом (teacher_visible).
 * Директива владельца 2026-11-07: аналитика и ФИО — только на таких тестах.
 */
export async function canSeeTestResults(
  service: any,
  roles: readonly string[],
  userId: string,
  testId: string,
): Promise<boolean> {
  if (roles.includes("admin")) return true;
  const { data, error } = await service
    .from("tests")
    .select("id,created_by,teacher_visible")
    .eq("id", testId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  return (
    String((data as any).created_by || "") === userId ||
    (data as any).teacher_visible === true
  );
}

/** ID тестов, результаты которых видны учителю (батч-вариант для списков). */
export async function visibleResultTestIds(
  service: any,
  roles: readonly string[],
  userId: string,
  testIds: readonly string[],
): Promise<Set<string>> {
  if (roles.includes("admin")) return new Set(testIds.map(String));
  const unique = [...new Set(testIds.map(String))].filter(Boolean);
  if (!unique.length) return new Set();
  const { data, error } = await service
    .from("tests")
    .select("id,created_by,teacher_visible")
    .in("id", unique as string[])
    .limit(500);
  if (error) throw error;
  const allowed = new Set<string>();
  for (const row of data || []) {
    if (
      String((row as any).created_by || "") === userId ||
      (row as any).teacher_visible === true
    ) {
      allowed.add(String((row as any).id));
    }
  }
  return allowed;
}

/** Порог малой выборки для агрегатов (решение владельца: N=5). */
export const MIN_SAMPLE_SIZE = 5;
