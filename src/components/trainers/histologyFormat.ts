/**
 * Формат задания тренажёра гистологии и разбор старых ссылок.
 *
 * Формат — то, что раньше было отдельной вкладкой «Диагностикум»: карточки
 * препаратов и разбор препарата. Вынесено из HistologyTrainer, чтобы компонент
 * укладывался в архитектурный лимит и логика ссылок тестировалась отдельно.
 */
import type { TrainingQuestion } from "@/lib/content-api";
import type { DiagnosticumMode } from "@/lib/diagnosticum-api";

export type TrainingFormat = "cards" | "complex";

export const TRAINING_FORMATS: Array<{ id: TrainingFormat; label: string }> = [
  { id: "cards", label: "Карточки препаратов" },
  { id: "complex", label: "Разбор препарата" },
];

/** Старые ссылки на отдельные режимы диагностикума ведут в объединённый разбор. */
const LEGACY_FORMATS = new Set<DiagnosticumMode>([
  "identify",
  "structures",
  "differential",
  "schema",
]);

export function formatFromParams(params: { get(key: string): string | null }): TrainingFormat {
  const raw = params.get("format");
  const found = TRAINING_FORMATS.find((item) => item.id === raw);
  if (found) return found.id;
  if (raw && LEGACY_FORMATS.has(raw as DiagnosticumMode)) return "complex";
  // Старые ссылки на отдельный диагностикум.
  return params.get("section") === "diagnosticum" ? "complex" : "cards";
}

export type AnswerRow = {
  id: string;
  question_id: string;
  order: number;
  user_answer?: string | null;
  is_correct?: boolean | null;
  is_skipped?: boolean;
  options: Array<{ id: string; label: string; correct?: boolean }>;
  question_snapshot: TrainingQuestion;
  review_snapshot?: any;
};
