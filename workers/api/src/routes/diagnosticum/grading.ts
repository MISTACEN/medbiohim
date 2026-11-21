/**
 * Проверка ответа и подсказки диагностикума.
 *
 * Вынесено из `model.ts` (сборка задания), чтобы оба файла оставались в
 * архитектурном бюджете. Импортирует только типы и константы — обратной
 * зависимости от `grading.ts` в `model.ts` нет.
 */
import {
  HINT_PENALTY,
  guideStructures,
  stringList,
  text,
  type AnswerKey,
  type GuideRow,
  type PartFeedback,
  type GradeResult,
  type Submitted,
} from "./model";

export type { PartFeedback, GradeResult } from "./model";

/**
 * Проверка ответа. Часть считается верной только при точном совпадении набора:
 * недобор и лишние варианты одинаково ломают диагноз.
 */
export function gradeAnswer(answers: AnswerKey, submitted: Submitted, hintsUsed = 0): GradeResult {
  const parts: PartFeedback[] = Object.entries(answers.parts).map(([partId, key]) => {
    const selected = new Set(
      (submitted[partId] ?? []).map((value) => String(value).trim()).filter(Boolean),
    );
    const expected = new Set(key.correct.map(String));
    const missing = [...expected].filter((id) => !selected.has(id));
    const extra = [...selected].filter((id) => !expected.has(id));
    return {
      part_id: partId,
      correct: missing.length === 0 && extra.length === 0,
      missing,
      extra,
      explanation: key.explanation,
    };
  });

  const ratio = parts.length ? parts.filter((part) => part.correct).length / parts.length : 0;
  const penalty = Math.max(0, Math.floor(hintsUsed)) * HINT_PENALTY;
  return {
    correct: parts.length > 0 && parts.every((part) => part.correct),
    score: Math.max(0, Math.round(ratio * 100) - penalty),
    parts,
  };
}

/** Подсказка уровня 1–4. Ответ не раскрывается ни на одном уровне. */
export function hintFor(
  guide: GuideRow,
  level: number,
  structureTitles: Record<string, string> = {},
): string | null {
  const title = (slug: string) => structureTitles[slug] || slug.replace(/-/g, " ");
  if (level === 1) {
    const system = text(guide.system) || text(guide.section);
    return system ? `Это препарат системы: ${system}.` : null;
  }
  if (level === 2) {
    const labels = guideStructures(guide).slice(0, 3).map(title);
    return labels.length ? `Ищи характерные структуры: ${labels.join(", ")}.` : null;
  }
  if (level === 3) {
    return text(guide.low_magnification) ? `Малое увеличение: ${text(guide.low_magnification)}` : null;
  }
  if (level === 4) {
    const steps = stringList(guide.steps);
    if (steps.length) return `Методика поиска: ${steps.join(" ")}`;
    return text(guide.high_magnification) ? `Большое увеличение: ${text(guide.high_magnification)}` : null;
  }
  return null;
}
