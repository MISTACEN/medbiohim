/**
 * Единая проверка ответа на клиенте (этап B).
 *
 * Закрытые вопросы проверяются по тому же правилу, что и серверный
 * `gradeClosedAnswer`: сравнение множества выбранных вариантов и отдельная
 * проверка последовательности. Открытые ответы делегируются детерминированному
 * грейдеру `src/lib/learning/grading.ts` — второй реализации текстовой проверки
 * в проекте не появляется.
 */
import { gradeActivity } from "../learning/grading";
import { resolveQuestionType } from "./registry";
import type { GradeOutcome, NormalizedQuestion } from "./types";

export type GivenAnswer = string | number | Array<string | number> | null | undefined;

function toTokens(given: GivenAnswer): string[] {
  if (given == null) return [];
  if (Array.isArray(given)) return given.map((item) => String(item ?? "").trim()).filter(Boolean);
  const text = String(given).trim();
  return text ? [text] : [];
}

function letterIndex(token: string): number {
  const upper = token.trim().toUpperCase();
  if (upper.length !== 1) return -1;
  const cyrillic = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ";
  const latin = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const cyr = cyrillic.indexOf(upper);
  if (cyr >= 0) return cyr;
  return latin.indexOf(upper);
}

function optionIndexForToken(question: NormalizedQuestion, token: string): number {
  const value = token.trim();
  if (!value) return -1;
  const options = question.options;
  const byKey = options.findIndex((option) => option.key.toUpperCase() === value.toUpperCase());
  if (byKey >= 0) return byKey;
  const byLabel = options.findIndex((option) => option.label.trim().toLowerCase() === value.toLowerCase());
  if (byLabel >= 0) return byLabel;
  if (/^[0-9]+$/.test(value)) {
    const number = Number(value);
    if (number >= 0 && number < options.length) return number;
    if (number >= 1 && number <= options.length) return number - 1;
    return -1;
  }
  const letter = letterIndex(value);
  if (letter >= 0 && letter < options.length) return letter;
  return -1;
}

function selectedIndexes(question: NormalizedQuestion, given: GivenAnswer): number[] {
  const result = new Set<number>();
  for (const token of toTokens(given)) {
    const index = optionIndexForToken(question, token);
    if (index >= 0) result.add(index);
  }
  return [...result].sort((a, b) => a - b);
}

function policyOf(question: NormalizedQuestion): GradeOutcome["policy"] {
  const descriptor = resolveQuestionType(question.type) ?? resolveQuestionType(question.rawType);
  if (descriptor) return descriptor.grading;
  if (question.kind === "closed") return "closed";
  if (question.kind === "open") return "open";
  return "none";
}

function numericValue(value: string): number | null {
  const normalized = value.replace(",", ".").replace(/[^\d.+-]/g, "");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function emptyOutcome(policy: GradeOutcome["policy"], reason: GradeOutcome["reason"]): GradeOutcome {
  return { isCorrect: null, selectedKeys: [], correctKeys: [], policy, reason };
}

/**
 * Проверяет ответ и возвращает единый результат.
 * `isCorrect === null` означает «проверить нельзя»: нет эталона или тип не поддержан.
 */
export function gradeQuestion(question: NormalizedQuestion, given: GivenAnswer): GradeOutcome {
  const policy = policyOf(question);
  if (policy === "none") return emptyOutcome(policy, "unsupported");
  if (!question.resolved) return emptyOutcome(policy, "unresolved");

  const expectedKeys = question.correctKeys;
  const tokens = toTokens(given);

  if (policy === "open") {
    const expected = question.answer.trim();
    if (!expected) return emptyOutcome(policy, "no-answer");
    if (!tokens.length) return { isCorrect: false, selectedKeys: [], correctKeys: [], policy, reason: "graded" };
    const value = tokens.join(" ");
    if (question.type === "numeric") {
      const target = numericValue(expected);
      const actual = numericValue(value);
      if (target === null || actual === null) return emptyOutcome(policy, "unresolved");
      const result = gradeActivity({ type: "numeric", value: actual, correct: target });
      return { isCorrect: result.correct, selectedKeys: [], correctKeys: [expected], policy, reason: "graded" };
    }
    const result = gradeActivity({ type: "short_text", value, accepted: [expected] });
    return { isCorrect: result.correct, selectedKeys: [], correctKeys: [expected], policy, reason: "graded" };
  }

  // Численный ответ без вариантов: эталон сравнивается как число.
  if (question.type === "numeric" && question.options.length === 0) {
    const target = numericValue(question.answer);
    const actual = numericValue(tokens.join(" "));
    if (target === null) return emptyOutcome(policy, "no-answer");
    if (actual === null) return { isCorrect: false, selectedKeys: [], correctKeys: [String(target)], policy, reason: "graded" };
    const result = gradeActivity({ type: "numeric", value: actual, correct: target });
    return { isCorrect: result.correct, selectedKeys: [], correctKeys: [String(target)], policy, reason: "graded" };
  }

  // Последовательность: порядок важен, сравнение по элементам.
  if (question.requiresOrder && question.orderIndexes.length) {
    const expectedOrder = question.orderIndexes;
    // Как и серверный gradeClosedAnswer: цифры «132» читаются как 1→3→2 (1-based).
    const digits = tokens
      .join("")
      .replace(/[^0-9]/g, "")
      .split("")
      .map((digit) => Number(digit) - 1)
      .filter((index) => index >= 0);
    const single = tokens.length === 1 ? tokens[0] : undefined;
    const actualOrder = digits.length
      ? digits
      : single && single.length > 1 && !/\s/.test(single)
        ? [...single].map((token) => optionIndexForToken(question, token)).filter((index) => index >= 0)
        : tokens.map((token) => optionIndexForToken(question, token)).filter((index) => index >= 0);
    const isCorrect =
      actualOrder.length === expectedOrder.length &&
      actualOrder.every((index, position) => index === expectedOrder[position]);
    return {
      isCorrect,
      selectedKeys: actualOrder.map((index) => question.options[index]?.key).filter((key): key is string => Boolean(key)),
      correctKeys: expectedOrder.map((index) => question.options[index]?.key).filter((key): key is string => Boolean(key)),
      policy,
      reason: "graded",
    };
  }

  // Обычный закрытый вопрос: множества должны совпасть полностью.
  if (!question.correctIndexes.length) return emptyOutcome(policy, "no-answer");
  const expected = new Set(question.correctIndexes);
  const selected = new Set(selectedIndexes(question, given));
  const isCorrect = selected.size === expected.size && [...selected].every((index) => expected.has(index));
  return {
    isCorrect,
    selectedKeys: [...selected].map((index) => question.options[index]?.key).filter((key): key is string => Boolean(key)),
    correctKeys: expectedKeys,
    policy,
    reason: "graded",
  };
}
