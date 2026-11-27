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
  | "schema"
  | "exam"
  | "electronogram";

export type DiagnosticumSection = {
  section: string;
  total: number;
  systems: string[];
  /** Позиции набора без методички: показываем «18 из 19», а не молчим. */
  missing?: number;
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
  /** Задание уже отвечено — восстанавливать серию с него нельзя. */
  answered?: boolean;
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

/** Как проверяли свободный ответ: точное совпадение, правило или ИИ. */
export type DiagnosticumTextOutcome = {
  input: string;
  target: string;
  verdict: "correct" | "incorrect" | "unsure";
  confidence: number;
  source: "exact" | "contains" | "fuzzy" | "ai" | "none";
  reason?: string;
};

export type DiagnosticumResult = {
  correct: boolean;
  score: number;
  hints_used: number;
  /** В экзамене разбор не приходит: сервер отдаёт только балл. */
  parts?: DiagnosticumPartFeedback[];
  /** Вердикты по частям, отвеченным словами (только вне экзамена). */
  text?: Record<string, DiagnosticumTextOutcome>;
  guide_key?: string;
  section?: string;
  exam?: boolean;
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
  /** Старый карточный движок: отдельная шкала, отдельный блок. */
  legacy?: { available: boolean; total: number; completed: number; avg_percent: number };
};

/** Короткая карточка серии для истории. */
export type DiagnosticumSessionSummary = {
  session_id: string;
  mode: DiagnosticumMode;
  title: string;
  section: string;
  status: "in_progress" | "finished" | "abandoned";
  total: number;
  score: number | null;
  correct_count: number | null;
  timer_sec: number | null;
  created_at: string | null;
  finished_at: string | null;
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

/**
 * Ответ на задание: `submitted` — выбранные id, `submittedText` — части,
 * отвеченные словами. Сервер сам решает, что проверять правилами, а что ИИ.
 */
export function submitDiagnosticumAnswer(
  attemptId: string,
  submitted: Record<string, string[]>,
  submittedText?: Record<string, string>,
) {
  return api<DiagnosticumResult>(endpoints.diagnosticum.answer(), {
    method: "POST",
    body: JSON.stringify({
      attempt_id: attemptId,
      submitted,
      ...(submittedText && Object.keys(submittedText).length ? { submitted_text: submittedText } : {}),
    }),
  });
}

/** Вопрос серверной серии: без ответа — только задание, с разбором — эталон. */
export type DiagnosticumSessionItem = {
  attempt_id: string;
  index: number;
  section: string;
  /**
   * Ключ методички. Сервер отдаёт его только в завершённой серии: в статусе
   * in_progress он раскрывал правильный вариант до ответа.
   */
  guide_key?: string;
  question: DiagnosticumQuestion;
  answered: boolean;
  hints_total: number;
  correct?: boolean;
  score?: number;
  parts?: DiagnosticumPartFeedback[];
  answers?: Record<string, { correct: string[]; explanation?: string }>;
};

export type DiagnosticumSession = {
  session_id: string;
  mode: DiagnosticumMode;
  section: string;
  timer_sec: number | null;
  status: "in_progress" | "finished" | "abandoned";
  total: number;
  score?: number | null;
  correct_count?: number | null;
  finished_at?: string | null;
  /** Выбранные карточки, которые не вошли в серию (ЭМ, снимок без методички). */
  missing?: string[];
  items: DiagnosticumSessionItem[];
};

export type DiagnosticumSessionReview = {
  session_id: string;
  status: "finished";
  total: number;
  answered: number;
  skipped: number;
  correct_count: number;
  score: number;
  items: DiagnosticumSessionItem[];
};

/** Серия на сервере: состав и порядок не теряются при перезагрузке. */
export function startDiagnosticumSession(input: {
  mode: DiagnosticumMode;
  section?: string;
  length?: number;
  timer_sec?: number | null;
  /** «Своя серия»: разбор ровно этих карточек банка. */
  card_ids?: string[];
}) {
  return api<DiagnosticumSession>(endpoints.diagnosticum.sessions(), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getDiagnosticumSession(sessionId: string) {
  return api<DiagnosticumSession>(endpoints.diagnosticum.session(sessionId));
}

/** Свои серии: список для «Истории» (новые сверху). */
export function getDiagnosticumSessions() {
  return api<{ items: DiagnosticumSessionSummary[]; total: number; migrated?: boolean }>(
    endpoints.diagnosticum.sessions(),
  );
}

export function finishDiagnosticumSession(sessionId: string) {
  return api<DiagnosticumSessionReview>(endpoints.diagnosticum.sessionFinish(sessionId), {
    method: "POST",
  });
}

/** Текущее задание попытки — восстановление экзамена после перезагрузки. */
export function getDiagnosticumAttempt(attemptId: string) {
  return api<DiagnosticumAttempt>(endpoints.diagnosticum.attempt(attemptId));
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
