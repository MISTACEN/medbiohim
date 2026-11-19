import type { AcademicState, Dashboard } from "@/lib/api";
import type { SubjectCard } from "@/lib/guards";

/** Строка ответа API главной: поля читаются по нескольким именам. */
export type DashRow = Record<string, unknown>;

/** Строка каталога предметов: источник control_type и slug (как на /subjects). */
export type CatalogRow = {
  id: string;
  control_type?: string | null;
  slug?: string | null;
  course_number?: number | null;
  semester?: number | null;
};

/** Окно экзаменационной сессии из getScheduleMeta → periods. */
export type ExamWindow = { start: string; end: string };

/** Сколько дней до сессии считаем «аттестация близко» (как на /subjects). */
export const EXAM_HIGHLIGHT_DAYS = 90;

/**
 * D9: совокупный результат загрузки главной — один объект на несколько
 * параллельных запросов (dashboard, academic state, subjects, каталог, сессии).
 */
export type DashboardBundle = {
  dash: Dashboard | null;
  dashError: string | null;
  academic: AcademicState | null;
  academicError: string | null;
  subjects: SubjectCard[];
  subjectsError: string | null;
  /** Каталог предметов по id — источник control_type для бейджей аттестации. */
  catalog: Record<string, CatalogRow>;
  /** Окна экзаменационных сессий курса/семестра пользователя. */
  examWindows: ExamWindow[];
};

// Стабильные пустые значения: `?? []` и `?? {}` создавали новый объект на
// каждый рендер и делали зависимости useMemo нестабильными.
export const EMPTY_SUBJECTS: SubjectCard[] = [];
export const EMPTY_CATALOG: Record<string, CatalogRow> = {};
export const EMPTY_EXAM_WINDOWS: ExamWindow[] = [];

export const EMPTY_BUNDLE: DashboardBundle = {
  dash: null,
  dashError: null,
  academic: null,
  academicError: null,
  subjects: [],
  subjectsError: null,
  catalog: {},
  examWindows: [],
};

export function str(row: DashRow | null | undefined, ...keys: string[]): string {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (value == null || value === "") continue;
    return String(value);
  }
  return "";
}

/** YYYY-MM-DD в таймзоне платформы + N дней (без переходов через Intl). */
export function datePlusDays(parts: { year: number; month: number; day: number }, days: number): string {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function homeworkStatus(row: DashRow): string {
  return str(row, "my_status", "submission_status", "status").toLowerCase();
}

const HOMEWORK_STATUS_LABELS: Record<string, string> = {
  open: "не сдано",
  assigned: "не сдано",
  pending: "не сдано",
  submitted: "сдано",
  graded: "оценено",
  done: "выполнено",
  overdue: "просрочено",
  rework: "на доработку",
};

/** Статус задания по-русски: в карточке не должно быть сырого «open». */
export function homeworkStatusLabel(row: DashRow): string {
  const status = homeworkStatus(row);
  if (!status) return "";
  return HOMEWORK_STATUS_LABELS[status] || status;
}

export function homeworkPending(row: DashRow): boolean {
  const status = homeworkStatus(row);
  return !["submitted", "graded", "done", "сдано", "оценено"].includes(status);
}

/**
 * Тип аттестации предмета. control_type в БД хранится русским текстом
 * («Зачет»/«Экзамен») или ключом (credit/exam) — как на /subjects.
 */
export function controlInfo(raw: unknown): { label: string; isExam: boolean } | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/диф.*зач|^дифф/i.test(text)) return { label: "Дифф. зачёт", isExam: false };
  if (/зач|^credit$/.test(lower)) return { label: "Зачёт", isExam: false };
  if (/экз|^exam$/.test(lower)) return { label: "Экзамен", isExam: true };
  return { label: text, isExam: false };
}
