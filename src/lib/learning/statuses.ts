/**
 * Канонические статусы подготовки — единая модель для всех страниц
 * (TECH-AUDIT: полный продукт §2 «Статусы»).
 *
 * Проблема, которую решает модуль: одна и та же суть («задание сделано»,
 * «тема не начата», «просрочено») на разных страницах выражалась разными
 * строками — my_status, submission_status, homeworkStatus() в /schedule,
 * статусы карточек на главной. Здесь одно место истины с функциями вывода
 * из реальных полей бэкенда. Фиктивных статусов нет: каждый выводится из
 * данных, которые реально приходят из API (homework_progress,
 * homework_submissions, planner).
 */

/** Канонический статус элемента подготовки. */
export type PrepStatus =
  | "not_started" // не начато
  | "in_progress" // изучается / выполняется
  | "done" // выполнено
  | "submitted" // сдано (отправлено преподавателю)
  | "graded" // оценено преподавателем
  | "failed" // не сдано / возврат на доработку
  | "rework" // требуется отработка
  | "review" // повторить (SRS-очередь)
  | "overdue"; // просрочено (не выполнено к сроку)

export const PREP_STATUS_ORDER: readonly PrepStatus[] = [
  "overdue",
  "failed",
  "rework",
  "not_started",
  "in_progress",
  "review",
  "done",
  "submitted",
  "graded",
];

/** Человекочитаемые подписи — один источник для UI. */
export const PREP_STATUS_LABELS: Record<PrepStatus, string> = {
  not_started: "Не начато",
  in_progress: "Изучается",
  done: "Выполнено",
  submitted: "Сдано",
  graded: "Оценено",
  failed: "Не сдано",
  rework: "Отработка",
  review: "Повторить",
  overdue: "Просрочено",
};

/** Токены темы: цвет статуса задаётся дизайн-системой, не сырыми классами. */
export const PREP_STATUS_TONE: Record<PrepStatus, "ok" | "warn" | "critical" | "muted" | "primary"> = {
  not_started: "muted",
  in_progress: "primary",
  done: "ok",
  submitted: "ok",
  graded: "ok",
  failed: "critical",
  rework: "warn",
  review: "warn",
  overdue: "critical",
};

const DONE_STATUSES = new Set(["done", "completed", "graded"]);

/**
 * Статус домашнего задания из полей planner/dashboard.
 * Приоритет: оценка/сдача → выполнено → просрочено → не начато.
 * `today` — YYYY-MM-DD в таймзоне студента (передаёт вызывающий UI).
 */
export function homeworkPrepStatus(h: {
  my_status?: string | null;
  my_completed?: boolean | null;
  submission_status?: string | null;
  status?: string | null;
  due_date?: string | null;
  due_at?: string | null;
}, today: string): PrepStatus {
  const myStatus = String(h.my_status || "").toLowerCase();
  const submission = String(h.submission_status || "").toLowerCase();
  const recordStatus = String(h.status || "").toLowerCase();
  const completed = h.my_completed === true || myStatus === "done" || DONE_STATUSES.has(recordStatus);

  // «returned» — преподаватель вернул работу на доработку.
  if (submission === "returned") return "rework";
  if (submission === "graded") return "graded";
  if (submission === "submitted") return "submitted";
  if (myStatus === "submitted" || recordStatus === "submitted") return "submitted";
  if (completed) return "done";

  const due = String(h.due_date || h.due_at?.slice(0, 10) || "");
  if (due && due < today && !completed) return "overdue";
  return "not_started";
}

/**
 * Статус темы подготовки: собирается из её заданий.
 * Правило честности: тема не объявляется «готовой», пока есть незакрытые
 * задания; при отсутствии заданий статус «не начато», а не выдумка.
 */
export function topicPrepStatus(items: Array<{ status: PrepStatus }>): PrepStatus {
  if (!items.length) return "not_started";
  if (items.some((i) => i.status === "overdue")) return "overdue";
  if (items.some((i) => i.status === "rework" || i.status === "failed")) return "rework";
  if (items.every((i) => i.status === "graded" || i.status === "submitted" || i.status === "done")) return "done";
  if (items.some((i) => i.status === "in_progress" || i.status === "submitted" || i.status === "review")) return "in_progress";
  return "not_started";
}

/** Готовность (0–100) по набору элементов: выполненные — полный вес. */
export function prepReadiness(items: Array<{ status: PrepStatus }>): number {
  if (!items.length) return 0;
  const weight = (s: PrepStatus): number => {
    switch (s) {
      case "graded":
      case "submitted":
      case "done":
        return 1;
      case "in_progress":
      case "review":
        return 0.5;
      case "rework":
        return 0.25;
      default:
        return 0;
    }
  };
  return Math.round((items.reduce((acc, i) => acc + weight(i.status), 0) / items.length) * 100);
}

/** Нуждается ли элемент во внимании студента прямо сейчас. */
export function needsAttention(s: PrepStatus): boolean {
  return s === "overdue" || s === "rework" || s === "failed";
}
