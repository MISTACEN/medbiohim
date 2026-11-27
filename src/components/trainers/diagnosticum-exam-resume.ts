/**
 * Преобразования ответа серверной серии в состояние раннера.
 * Вынесено из компонента ради бюджета строк и единого места для формы данных.
 */
import type {
  DiagnosticumAttempt,
  DiagnosticumSession,
  DiagnosticumSessionItem,
  DiagnosticumSessionReview,
} from "@/lib/diagnosticum-api";

export function attemptFromItem(item: DiagnosticumSessionItem): DiagnosticumAttempt {
  return {
    attempt_id: item.attempt_id,
    mode: "exam",
    section: item.section,
    question: item.question,
    hints_total: item.hints_total,
    hints_used: 0,
  };
}

/** Итог серии из `GET /sessions/:id` — чтобы разбор не пропадал после reload. */
export function reviewFromSession(data: DiagnosticumSession): DiagnosticumSessionReview {
  return {
    session_id: data.session_id,
    status: "finished",
    total: data.total,
    answered: data.items.filter((item) => item.answered).length,
    skipped: data.items.filter((item) => !item.answered).length,
    correct_count: Number(data.correct_count ?? data.items.filter((item) => item.correct).length),
    score: Number(data.score ?? 0),
    items: data.items,
  };
}
