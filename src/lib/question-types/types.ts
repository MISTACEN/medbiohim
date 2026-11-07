/**
 * Общая модель вопроса для клиента (этап B целевой архитектуры).
 *
 * Контракт повторяет серверную нормализацию `integrations/cloudflare-api/src/question-format.js`
 * (is_closed / options[key, label, correct] / requires_order / allow_multiple),
 * но не переизобретает разбор шести исторических форматов `answer`: это делает сервер.
 * Клиент получает уже нормализованный payload и приводит его к одному виду.
 */

export type QuestionKind = "closed" | "open" | "unsupported";

/** Что можно проверить детерминированно. */
export type GradingPolicy = "closed" | "open" | "cloze" | "none";

export type QuestionTypeId =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "numeric"
  | "short_text"
  | "formula"
  | "ordering"
  | "matching"
  | "cloze"
  | "open_text"
  | "image_hotspot"
  | "clinical_case"
  | "structure_formula"
  | "lab_experiment";

export type QuestionTypeDescriptor = {
  id: QuestionTypeId;
  /** Полное название для настроек и редактора. */
  label: string;
  /** Короткая подпись для бейджей и списков (совместима с текущим UI). */
  shortLabel: string;
  kind: QuestionKind;
  grading: GradingPolicy;
  /** Легаси-написания из БД, Worker и старых банков. */
  aliases: readonly string[];
  /** Есть ли тип в единой образовательной модели (`src/lib/learning/types.ts`). */
  inActivityModel: boolean;
  notes?: string;
};

export type NormalizedOption = {
  key: string;
  id?: string;
  label: string;
  correct?: boolean;
  image_file_id?: string;
};

export type NormalizedQuestion = {
  id?: string;
  type: QuestionTypeId | "unknown";
  /** Исходное написание типа из payload. */
  rawType: string;
  kind: QuestionKind;
  text: string;
  answer: string;
  options: NormalizedOption[];
  correctKeys: string[];
  correctIndexes: number[];
  orderIndexes: number[];
  requiresOrder: boolean;
  allowMultiple: boolean;
  /** Есть ли чем проверить ответ. */
  resolved: boolean;
  answerDisplay: string;
};

export type GradeReason = "graded" | "unresolved" | "no-answer" | "unsupported";

export type GradeOutcome = {
  /** null — проверить нельзя (нет эталона или тип не поддержан). */
  isCorrect: boolean | null;
  selectedKeys: string[];
  correctKeys: string[];
  policy: GradingPolicy;
  reason: GradeReason;
};

/** Минимальный контракт серверного payload, который приходит в клиент. */
export type ServerQuestionLike = {
  id?: string | number | null;
  type?: string | null;
  text?: string | null;
  body?: string | null;
  answer?: unknown;
  answer_display?: string | null;
  options?: unknown;
  is_closed?: boolean | null;
  allow_multiple?: boolean | null;
  requires_order?: boolean | null;
  correct_keys?: unknown;
  correct_indexes?: unknown;
  order_indexes?: unknown;
};
