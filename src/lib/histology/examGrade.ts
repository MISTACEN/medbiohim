/** Оценка за «Режим экзамена» по шкале преподавателя.
 *
 *  3 — все три задания выполнены правильно;
 *  4 — дополнительно описать клетку по памятке;
 *  5 — максимально подробно ответить на последний теоретический вопрос.
 *
 *  Шкала накопительная: «4» требует базы и памятки, «5» — базы, памятки и
 *  углублённого ответа на теоретический вопрос (detailKeyPoints задания 3).
 *  Функция чистая и не знает про React — покрыта unit-тестами.
 */

import type { SelfWorkCheckResult } from "./selfWorkTypes";

export type ExamGradeInput = {
  task1: SelfWorkCheckResult;
  task2: SelfWorkCheckResult;
  task3: SelfWorkCheckResult;
  /** Задание 4 — вопросы открытого типа: открывает «4». */
  openType?: SelfWorkCheckResult | null;
  /** Устаревший путь (описание клетки по памятке); учитывается, если openType не задан. */
  memo?: SelfWorkCheckResult | null;
  /** Углублённая проверка теоретического вопроса (detailKeyPoints) — открывает «5». */
  theoryDetail?: SelfWorkCheckResult | null;
};

export type ExamGradeResult = {
  /** 0 — база не выполнена (ниже «3»). */
  grade: 0 | 3 | 4 | 5;
  label: string;
  /** Пояснения: что зачтено и чего не хватает до следующей оценки. */
  notes: string[];
  /** Все три задания выполнены правильно. */
  baseComplete: boolean;
};

const BASE_TASKS: Array<[keyof Omit<ExamGradeInput, "memo" | "theoryDetail">, string]> = [
  ["task1", "Задание 1 (осевые органы)"],
  ["task2", "Задание 2 (электронограмма)"],
  ["task3", "Задание 3 (теория)"],
];

export function computeExamGrade(input: ExamGradeInput): ExamGradeResult {
  const notes: string[] = [];

  for (const [key, name] of BASE_TASKS) {
    const result = input[key];
    if (!result) continue;
    notes.push(
      result.complete
        ? `${name}: выполнено (${result.score}/${result.max}).`
        : `${name}: не зачтено — потеряно пунктов: ${result.misses.length} (${result.score}/${result.max}).`,
    );
  }

  const baseComplete = BASE_TASKS.every(([key]) => input[key]?.complete === true);
  if (!baseComplete) {
    return {
      grade: 0,
      label: "Ниже «3» — нужно выполнить все три задания правильно",
      notes,
      baseComplete: false,
    };
  }

  notes.push("Все три задания выполнены правильно — базовая оценка «3».");
  let grade: 3 | 4 | 5 = 3;

  // «4» открывает четвёртое задание — вопросы открытого типа (в старых темах —
  // описание клетки по памятке). Ключ openType в вызове означает режим открытых
  // вопросов, даже если результат ещё не получен (openType: null).
  const usesOpenType = Object.prototype.hasOwnProperty.call(input, "openType");
  const fourth = usesOpenType ? input.openType ?? null : input.memo ?? null;
  const fourthName = usesOpenType ? "вопросы открытого типа" : "описание клетки по памятке";
  if (fourth?.complete) {
    grade = 4;
    notes.push(`Четвёртое задание (${fourthName}) выполнено — «4».`);
  } else if (fourth) {
    notes.push(`До «4»: четвёртое задание (${fourthName}) неполное (${fourth.score}/${fourth.max}) — добавь потерянные пункты.`);
  } else {
    notes.push(`До «4»: выполни четвёртое задание — ${fourthName}.`);
  }

  const detail = input.theoryDetail ?? null;
  if (grade >= 4) {
    if (!detail) {
      notes.push("До «5»: ответь на последний теоретический вопрос максимально подробно (углублённые пункты).");
    } else if (detail.complete) {
      grade = 5;
      notes.push("Теоретический вопрос раскрыт максимально подробно — «5».");
    } else {
      notes.push(`До «5»: в развёрнутом ответе не хватает пунктов (${detail.score}/${detail.max}).`);
    }
  }

  return {
    grade,
    label: grade === 5 ? "Оценка «5»" : grade === 4 ? "Оценка «4»" : "Оценка «3»",
    notes,
    baseComplete: true,
  };
}

/** Подпись оценки для интерфейса. */
export function examGradeLabel(result: ExamGradeResult): string {
  return result.grade === 0 ? "Не зачтено" : `${result.grade}`;
}
