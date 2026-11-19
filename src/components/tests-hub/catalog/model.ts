import { ClipboardCheck, FlaskConical, History } from "lucide-react";

export type View = "tests" | "chemistry" | "history";

/** Серверный статус попытки — студенту нужен русский текст, а не сырой enum. */
const ATTEMPT_STATUS: Record<string, string> = {
  completed: "завершён",
  finished: "завершён",
  graded: "проверен",
  active: "идёт",
  in_progress: "идёт",
  started: "идёт",
  pending: "ожидает проверки",
  expired: "время истекло",
  abandoned: "прерван",
  cancelled: "отменён",
};

export function attemptStatusText(status: unknown): string {
  const key = String(status || "").trim().toLowerCase();
  return ATTEMPT_STATUS[key] || "—";
}

export const VIEWS: Array<{ id: View; label: string; Icon: typeof ClipboardCheck }> = [
  { id: "tests", label: "Тесты и банки", Icon: ClipboardCheck },
  { id: "chemistry", label: "Химия", Icon: FlaskConical },
  { id: "history", label: "История попыток", Icon: History },
];
