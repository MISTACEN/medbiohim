/**
 * Type guards на границе API: сервер мог вернуть не то, чего ждёт UI,
 * и вместо «cannot read property of undefined» страница должна честно
 * показать пустое состояние или ошибку (D3 из TECH-AUDIT-PLAN-2026-10-27).
 *
 * Правила:
 * - guard возвращает boolean, ничего не бросает;
 * - проверяются только поля, которые реально использует UI;
 * - массивы фильтруются guard'ом целиком (filterSafe).
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(v: unknown): boolean {
  return typeof v === "string" && v.length > 0;
}

function optStr(v: unknown): boolean {
  return v === undefined || v === null || typeof v === "string" || typeof v === "number";
}

/** Объявление с главной и в списке: id, заголовок/текст не пустые. */
export type Announcement = {
  id: string;
  title: string;
  body?: string;
  pinned?: boolean;
  created_at?: string;
};

export function isAnnouncement(value: unknown): value is Announcement {
  if (!isRecord(value)) return false;
  return str(value.id) && (str(value.title) || str(value.body) || str(value.text));
}

/** Профиль пользователя (AuthProvider bootstrap, /auth/me). */
export type Profile = {
  id: string;
  email?: string;
  full_name?: string;
  display_name?: string;
  role?: string;
};

export function isProfile(value: unknown): value is Profile {
  if (!isRecord(value)) return false;
  return str(value.id);
}

/** Карточка предмета из /subjects. */
export type SubjectCard = {
  id: string;
  name: string;
  slug?: string | null;
  course_number?: number | null;
  semester?: number | null;
};

export function isSubjectCard(value: unknown): value is SubjectCard {
  if (!isRecord(value)) return false;
  return str(value.id) && str(value.name);
}

/** Запись расписания из /schedule и planner. */
export type ScheduleRow = {
  id: string;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  subject_name?: string | null;
  subject_id?: string | null;
  is_cancelled?: boolean | null;
};

export function isScheduleRow(value: unknown): value is ScheduleRow {
  if (!isRecord(value)) return false;
  return str(value.id) && optStr(value.date) && /^\d{4}-\d{2}-\d{2}/.test(String(value.date ?? ""));
}

/** Тест из хаба тестов. */
export type TestItem = {
  id: string;
  title: string;
  subject_id?: string | null;
  is_published?: boolean | null;
};

export function isTestItem(value: unknown): value is TestItem {
  if (!isRecord(value)) return false;
  return str(value.id) && (str(value.title) || str(value.name));
}

/** Фильтрует массив неизвестных объектов guard'ом; не-массивы дают пустой список. */
export function filterSafe<T>(items: unknown, guard: (item: unknown) => item is T): T[] {
  if (!Array.isArray(items)) return [];
  return items.filter(guard);
}
