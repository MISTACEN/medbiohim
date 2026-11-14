/**
 * Окно ближайших событий для /academic/state и /study.
 *
 * Модуль без зависимостей: его целиком импортирует тест (`node --test`
 * снимает типы), поэтому логику объединения окон можно проверить напрямую.
 */

export type UpcomingEventRow = {
  id?: string | null;
  date?: string | null;
  start_time?: string | null;
  event_kind?: string | null;
  schedules?: { is_active?: boolean | null } | Array<{ is_active?: boolean | null }> | null;
};

function isActiveRow(event: UpcomingEventRow): boolean {
  const schedule = Array.isArray(event.schedules) ? event.schedules[0] : event.schedules;
  return schedule?.is_active !== false;
}

function byDateAndTime(a: UpcomingEventRow, b: UpcomingEventRow): number {
  return String(a.date).localeCompare(String(b.date))
    || String(a.start_time || "").localeCompare(String(b.start_time || ""));
}

/**
 * Ближайшие события: аттестации не вытесняются занятиями.
 *
 * Раньше upstream брал одно окно занятий с лимитом 100 и отсекал первые 30:
 * обычных пар на две недели больше, чем окно, поэтому коллоквиум или КР через
 * две недели не попадали ни в сводку, ни в план подготовки на /study.
 *
 * Поэтому порядок такой: аттестации получают места первыми (по дате), остаток
 * лимита заполняют ближайшие занятия, итог снова сортируется по дате.
 */
export function mergeUpcomingEventRows<T extends UpcomingEventRow>(
  assessmentRows: T[],
  classRows: T[],
  limit = 30,
): T[] {
  const assessments = new Map<string, T>();
  for (const row of assessmentRows || []) {
    if (row?.id) assessments.set(String(row.id), row);
  }
  const classes = new Map<string, T>();
  for (const row of classRows || []) {
    if (row?.id && !assessments.has(String(row.id))) classes.set(String(row.id), row);
  }

  const pickedAssessments = [...assessments.values()].filter(isActiveRow).sort(byDateAndTime).slice(0, limit);
  const usedIds = new Set(pickedAssessments.map((row) => String(row.id)));
  const rest = [...classes.values()]
    .filter((row) => isActiveRow(row) && !usedIds.has(String(row.id)))
    .sort(byDateAndTime)
    .slice(0, Math.max(0, limit - pickedAssessments.length));

  return [...pickedAssessments, ...rest].sort(byDateAndTime);
}
