/**
 * Клиент диагностикума гистологии.
 *
 * Вопрос приходит с сервера без ключа ответа: правильные варианты известны
 * только после `submitDiagnosticumAnswer`. Поэтому интерфейс не может
 * «подсмотреть» ответ до отправки — он физически не приходит в браузер.
 */
import { api } from "./api";
import { endpoints } from "./endpoints";

export type DiagnosticumMode =
  | "identify"
  | "structures"
  | "differential"
  | "complex"
  | "schema";

export type DiagnosticumSection = {
  section: string;
  total: number;
  systems: string[];
};

export type DiagnosticumOverview = {
  sections: DiagnosticumSection[];
  modes: { mode: DiagnosticumMode; title: string }[];
  total_guides: number;
  total_cards: number;
  migrated: boolean;
};

export type DiagnosticumOption = { id: string; label: string };

export type DiagnosticumPart = {
  id: string;
  kind: "single" | "multi";
  title: string;
  options: DiagnosticumOption[];
};

export type DiagnosticumQuestion = {
  prompt: string;
  image_card_id: string;
  parts: DiagnosticumPart[];
};

export type DiagnosticumAttempt = {
  attempt_id: string;
  mode: DiagnosticumMode;
  section: string;
  question: DiagnosticumQuestion;
  hints_total: number;
  hints_used: number;
};

export type DiagnosticumHint = {
  level: number;
  hint: string;
  hints_used: number;
  hints_total: number;
};

export type DiagnosticumPartFeedback = {
  part_id: string;
  correct: boolean;
  missing: string[];
  extra: string[];
  explanation: string;
};

export type DiagnosticumResult = {
  correct: boolean;
  score: number;
  hints_used: number;
  parts: DiagnosticumPartFeedback[];
  guide_key: string;
  section: string;
};

export type DiagnosticumStats = {
  migrated: boolean;
  answered: number;
  correct: number;
  correct_rate: number;
  avg_score: number;
  hints: number;
  by_mode: { mode: string; title: string; total: number; correct: number; correct_rate: number }[];
  by_section: { section: string; total: number; correct: number; correct_rate: number }[];
  weak_sections: string[];
};

export function getDiagnosticumOverview() {
  return api<DiagnosticumOverview>(endpoints.diagnosticum.root());
}

export function startDiagnosticumAttempt(input: { mode: DiagnosticumMode; section?: string }) {
  return api<DiagnosticumAttempt>(endpoints.diagnosticum.start(), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Без `level` сервер выдаёт следующую подсказку по порядку. */
export function requestDiagnosticumHint(attemptId: string, level?: number) {
  return api<DiagnosticumHint>(endpoints.diagnosticum.hint(), {
    method: "POST",
    body: JSON.stringify({ attempt_id: attemptId, level }),
  });
}

export function submitDiagnosticumAnswer(
  attemptId: string,
  submitted: Record<string, string[]>,
) {
  return api<DiagnosticumResult>(endpoints.diagnosticum.answer(), {
    method: "POST",
    body: JSON.stringify({ attempt_id: attemptId, submitted }),
  });
}

export function getDiagnosticumStats() {
  return api<DiagnosticumStats>(endpoints.diagnosticum.stats());
}

export type DiagnosticumMistake = {
  card_id: string;
  guide_key: string;
  section: string;
  score: number | null;
  created_at: string;
};

export type DiagnosticumMistakes = {
  items: DiagnosticumMistake[];
  total: number;
  migrated: boolean;
};

/** Очередь повторения — id карточек для deep-link `?cards=` тренажёра. */
export function getDiagnosticumMistakes() {
  return api<DiagnosticumMistakes>(endpoints.diagnosticum.mistakes());
}
