export type Homework = {
  id: string;
  title: string;
  description?: string | null;
  due_at?: string | null;
  due_date?: string | null;
  status?: string | null;
  my_status?: string | null;
  subjects?: { name?: string | null; slug?: string | null } | null;
};

export type Submission = {
  id: string;
  status?: string | null;
  grade?: number | string | null;
  teacher_comment?: string | null;
  text_answer?: string | null;
  submitted_at?: string | null;
  graded_at?: string | null;
};

export type Filter = "active" | "overdue" | "done" | "all";

export const FILTERS: { id: Filter; label: string }[] = [
  { id: "active", label: "Активные" },
  { id: "overdue", label: "Просроченные" },
  { id: "done", label: "Выполненные" },
  { id: "all", label: "Все" },
];

export const SUBMISSION_LABELS: Record<string, string> = {
  submitted: "Сдано, ждёт проверки",
  pending: "На проверке",
  awaiting_review: "На проверке",
  on_review: "На проверке",
  graded: "Проверено",
  returned: "Возвращено на доработку",
};

export function fmtDate(value?: string | null): string {
  if (!value) return "";
  const date = value.slice(0, 10).split("-").reverse().join(".");
  const time = value.includes("T") ? value.slice(11, 16) : "";
  return time ? `${date}, ${time}` : date;
}

export function isOverdue(h: Homework): boolean {
  const deadline = h.due_at || (h.due_date ? `${h.due_date}T23:59` : "");
  return Boolean(deadline) && new Date(deadline).getTime() < Date.now();
}

export function isDone(h: Homework): boolean {
  return String(h.my_status || h.status || "").toLowerCase() === "done";
}
