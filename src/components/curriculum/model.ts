export type CurriculumItem = {
  id: string;
  title?: string;
  description?: string | null;
  item_type?: string | null;
  course_number?: number | null;
  semester?: number | null;
  planned_date?: string | null;
  due_at?: string | null;
  is_required?: boolean | null;
  order_index?: number | null;
  metadata?: Record<string, unknown> | null;
  subjects?: { name?: string; slug?: string; course_number?: number; semester?: number } | Array<{ name?: string; slug?: string; course_number?: number; semester?: number }> | null;
};

export type AcademicRow = {
  id?: string;
  target_type?: string;
  target_id?: string;
  learning_status?: string;
  academic_status?: string;
  execution_status?: string;
  note?: string | null;
};

export const typeLabels: Record<string, string> = {
  lecture: "Лекция",
  practice: "Практика",
  lab: "Лабораторная",
  seminar: "Семинар",
  exam: "Экзамен",
  credit: "Зачёт",
  other: "Другое",
};

export function subjectName(item: CurriculumItem) {
  const value = Array.isArray(item.subjects) ? item.subjects[0] : item.subjects;
  return value?.name || "";
}

export function subjectSlug(item: CurriculumItem) {
  const value = Array.isArray(item.subjects) ? item.subjects[0] : item.subjects;
  return value?.slug || "";
}

export function hours(item: CurriculumItem) {
  const meta = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const lecture = Number((meta as any).lecture_hours ?? (meta as any).hours_lecture ?? 0) || 0;
  const practice = Number((meta as any).practice_hours ?? (meta as any).hours_practice ?? 0) || 0;
  const total = Number((meta as any).total_hours ?? lecture + practice) || lecture + practice;
  return { lecture, practice, total };
}
