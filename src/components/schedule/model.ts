/**
 * Чистые правила страницы расписания: статусы ДЗ, группировка занятий,
 * фильтры планировщика, недели семестра.
 *
 * Вынесено из `src/app/schedule/page.tsx` без изменения поведения: раньше эти
 * функции жили внутри компонента на 959 строк и не проверялись ничем, кроме
 * ручного открытия страницы.
 */
import type { ScheduleItem } from "@/lib/api";
import { homeworkPrepStatus } from "@/lib/learning/statuses";
import { compareRu } from "@/lib/collation";
import { addDaysYmd, type SemesterRange } from "./utils";

/** Подписи важных видов события — как в ScheduleCard. */
export const EVENT_KIND_LABELS: Record<string, string> = {
  exam: "экзамен",
  credit: "зачёт",
  colloquium: "коллоквиум",
  control_work: "контрольная",
  assessment: "аттестация",
  retake: "пересдача",
};

/** Трёхзначный контракт UI: done / overdue / pending. */
export type HomeworkState = "done" | "overdue" | "pending";

/** Выводится из канонической модели статусов (`homeworkPrepStatus`). */
export function homeworkState(homework: any, today: string): HomeworkState {
  const canonical = homeworkPrepStatus(homework, today);
  if (canonical === "done" || canonical === "submitted" || canonical === "graded") return "done";
  if (canonical === "overdue" || canonical === "failed") return "overdue";
  return "pending";
}

/** Каноническая подпись, если она не покрыта трёхзначным контрактом. */
export function homeworkStateLabel(homework: any, today: string): string | null {
  const canonical = homeworkPrepStatus(homework, today);
  if (canonical === "rework") return "отработка";
  if (canonical === "submitted") return "сдано";
  if (canonical === "graded") return "оценено";
  return null;
}

/** Своё задание (без группы) или созданное этим пользователем можно править. */
export function homeworkIsEditable(homework: any, userId?: string | null): boolean {
  if (!userId) return false;
  return !homework.group_id || String(homework.created_by || "") === String(userId);
}

/** Занятия по датам, внутри дня — по времени начала. */
export function groupItemsByDate(items: readonly ScheduleItem[]): Map<string, ScheduleItem[]> {
  const grouped = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    if (!item.date) continue;
    grouped.set(item.date, [...(grouped.get(item.date) || []), item]);
  }
  grouped.forEach((list) => list.sort((a, b) => a.start_time.localeCompare(b.start_time)));
  return grouped;
}

export function homeworkSubjects(homeworks: readonly any[]): string[] {
  return Array.from(new Set(homeworks.map((h: any) => String(h.subject_name || "")).filter(Boolean))).sort(compareRu);
}

export type HomeworkFilters = {
  search: string;
  subject: string;
  status: "all" | "active" | "overdue" | "done";
  today: string;
};

/** Поиск по названию и описанию, фильтр по предмету и статусу, сортировка по сроку. */
export function filterHomeworks(homeworks: readonly any[], filters: HomeworkFilters): any[] {
  const query = filters.search.trim().toLowerCase();
  return homeworks
    .filter((h: any) => {
      if (filters.subject && String(h.subject_name || "") !== filters.subject) return false;
      if (query && !`${h.title || ""} ${h.description || ""}`.toLowerCase().includes(query)) return false;
      const state = homeworkState(h, filters.today);
      if (filters.status === "active" && state === "done") return false;
      if (filters.status === "overdue" && state !== "overdue") return false;
      if (filters.status === "done" && state !== "done") return false;
      return true;
    })
    .sort((a: any, b: any) => {
      const dueA = String(a.due_date || a.due_at?.slice(0, 10) || "9999-12-31");
      const dueB = String(b.due_date || b.due_at?.slice(0, 10) || "9999-12-31");
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      return String(a.title || "").localeCompare(String(b.title || ""), "ru");
    });
}

/**
 * ДЗ выбранного занятия: сначала привязка по `schedule_entry_id`, затем
 * совпадение даты и предмета (старые задания без привязки к записи).
 */
export function homeworksForLesson(homeworks: readonly any[], lesson: ScheduleItem | null): any[] {
  if (!lesson) return [];
  return homeworks.filter((h: any) => {
    if (h.schedule_entry_id) return String(h.schedule_entry_id) === String(lesson.id);
    return (
      String(h.due_date || h.due_at?.slice(0, 10) || "") === String(lesson.date) &&
      (!lesson.subject_id || String(h.subject_id || "") === String(lesson.subject_id))
    );
  });
}

export type SemesterWeek = { index: number; start: string; end: string; items: ScheduleItem[] };

/** Недели семестра от `range.from` до `range.to`, не больше 40. */
export function buildSemesterWeeks(allItems: readonly ScheduleItem[], range: SemesterRange): SemesterWeek[] {
  const weeks: SemesterWeek[] = [];
  for (let start = range.from, index = 1; start <= range.to && index <= 40; start = addDaysYmd(start, 7), index += 1) {
    const end = addDaysYmd(start, 6);
    weeks.push({ index, start, end, items: allItems.filter((it) => it.date >= start && it.date <= end) });
  }
  return weeks;
}

export function academicYearLabel(range: SemesterRange): string {
  return `${range.from.slice(0, 4)}/${Number(range.from.slice(0, 4)) + 1}`;
}
