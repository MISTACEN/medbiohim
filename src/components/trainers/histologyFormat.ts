/**
 * Строка ответа тренажёра гистологии.
 *
 * Раньше здесь же жили «форматы заданий» (`cards` / `complex`) и разбор старых
 * ссылок. Форматы объединены: диагностикум и тренировка по карточкам — один
 * экран, выбирать до начала работы больше нечего.
 */
import type { TrainingQuestion } from "@/lib/content-api";

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
