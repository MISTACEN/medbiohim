/**
 * Детерминированная проверка ответов.
 *
 * Правило проекта: для точных ответов оценка считается кодом, а не моделью.
 * Открытый ответ проверяется по смысловым элементам с частичным зачётом —
 * и это тоже детерминированно, чтобы результат не менялся между попытками.
 * AI-проверка может быть подсказкой, но не единственным способом оценивания.
 */

export type OpenCriterion = {
  /** Стабильный идентификатор критерия (для истории ответов). */
  id: string;
  /** Что должен сказать студент — попадает в разбор. */
  label: string;
  /** Любое из перечисленных слов/основ считается раскрытием критерия. */
  any: string[];
  /** Вес критерия, по умолчанию 1. */
  weight?: number;
};

export type ActivityAnswer =
  | { type: "single_choice"; selected: number | null; correct: number }
  | { type: "multiple_choice"; selected: number[]; correct: number[] }
  | { type: "true_false"; selected: boolean | null; correct: boolean }
  | {
      type: "numeric";
      value: number | null;
      correct: number;
      /** Абсолютный допуск. */
      tolerance?: number;
      /** Относительный допуск в процентах от эталона. */
      tolerancePercent?: number;
    }
  | { type: "short_text"; value: string; accepted: string[] }
  | { type: "formula"; value: string; accepted: string[] }
  | { type: "ordering"; value: string[]; correct: string[] }
  | { type: "matching"; value: Record<string, string>; correct: Record<string, string> }
  | { type: "open_text"; value: string; criteria: OpenCriterion[]; threshold?: number };

export type GradeResult = {
  type: ActivityAnswer["type"];
  /** Доля выполнения 0…1. */
  score: number;
  /** 0…100, округлено. */
  percent: number;
  /** Полностью верно (все критерии/варианты). */
  correct: boolean;
  /** Достигнут порог зачёта. */
  passed: boolean;
  /** Человеческий разбор: что зачтено и чего не хватило. */
  feedback: string;
  /** Раскрытые критерии / совпавшие пары. */
  matched: string[];
  /** Нераскрытые критерии / ошибки. */
  missed: string[];
};

const PUNCTUATION = /[^\p{L}\p{N}]+/gu;

/** Нормализация свободного текста: регистр, ё, пунктуация, пробелы. */
export function normalizeAnswerText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(PUNCTUATION, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const SUPERSCRIPTS: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁺": "+",
  "⁻": "-",
};

/**
 * Нормализация химической записи: убирает пробелы, приводит подстрочные и
 * надстрочные символы к обычным цифрам. Порядок атомов не переставляется —
 * это было бы уже не строковым сравнением, а разбором формулы.
 */
export function normalizeFormulaText(value: unknown): string {
  let text = String(value ?? "").normalize("NFKC").toLowerCase();
  text = text.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (ch) => String(SUBSCRIPT_DIGITS.indexOf(ch)));
  text = text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, (ch) => SUPERSCRIPTS[ch] ?? ch);
  return text.replace(/\s+/g, "").replace(/[∙⋅]/g, "·");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Совпадение по основе слова: «конкурент» находит «конкурентного», но не
 * «неконкурентного» внутри другого слова. Проверяем границу слова слева.
 */
export function containsStem(haystack: string, needle: string): boolean {
  const hay = normalizeAnswerText(haystack);
  const word = normalizeAnswerText(needle);
  if (!hay || !word) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(word)}`, "u").test(hay);
}

function percent(score: number): number {
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

function baseResult(
  type: ActivityAnswer["type"],
  score: number,
  passedThreshold: number,
): GradeResult {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
  return {
    type,
    score: normalized,
    percent: percent(normalized),
    correct: normalized >= 0.999,
    passed: normalized >= passedThreshold,
    feedback: "",
    matched: [],
    missed: [],
  };
}

function gradeSingleChoice(answer: Extract<ActivityAnswer, { type: "single_choice" }>): GradeResult {
  const result = baseResult("single_choice", 0, 1);
  if (answer.selected === null || !Number.isInteger(answer.selected)) {
    result.feedback = "Ответ не выбран.";
    return result;
  }
  if (answer.selected === answer.correct) {
    result.score = 1;
    result.percent = 100;
    result.correct = true;
    result.passed = true;
    result.feedback = "Верно.";
  } else {
    result.feedback = "Выбран другой вариант. Разберите объяснение к вопросу.";
  }
  return result;
}

function gradeMultipleChoice(
  answer: Extract<ActivityAnswer, { type: "multiple_choice" }>,
): GradeResult {
  const correct = [...new Set(answer.correct)];
  const selected = [...new Set(answer.selected)];
  if (!correct.length) {
    return baseResult("multiple_choice", 0, 1);
  }
  const correctSet = new Set(correct);
  const selectedSet = new Set(selected);
  const hits = correct.filter((index) => selectedSet.has(index));
  const wrong = selected.filter((index) => !correctSet.has(index));
  const score = Math.max(0, (hits.length - wrong.length) / correct.length);
  const result = baseResult("multiple_choice", score, 1);
  result.matched = hits.map((index) => `вариант ${index + 1}`);
  result.missed = [
    ...correct.filter((index) => !selectedSet.has(index)).map((index) => `не отмечен вариант ${index + 1}`),
    ...wrong.map((index) => `лишний вариант ${index + 1}`),
  ];
  result.feedback = result.correct
    ? "Все верные варианты отмечены."
    : `Верно ${hits.length} из ${correct.length}, лишних ${wrong.length}.`;
  return result;
}

function gradeNumeric(answer: Extract<ActivityAnswer, { type: "numeric" }>): GradeResult {
  const result = baseResult("numeric", 0, 1);
  const value = answer.value;
  if (value === null || typeof value !== "number" || !Number.isFinite(value)) {
    result.feedback = "Численный ответ не введён.";
    return result;
  }
  if (!Number.isFinite(answer.correct)) {
    result.feedback = "У вопроса не задан эталонный ответ.";
    return result;
  }
  const tolerance = Math.abs(answer.tolerance ?? 0);
  const relative = (Math.abs(answer.tolerancePercent ?? 0) / 100) * Math.abs(answer.correct);
  const diff = Math.abs(value - answer.correct);
  if (diff <= tolerance + relative + 1e-12) {
    result.score = 1;
    result.percent = 100;
    result.correct = true;
    result.passed = true;
    result.feedback = "Верно.";
  } else {
    const allowed = tolerance + relative;
    result.feedback = allowed > 0
      ? `Расхождение ${diff.toPrecision(3)} больше допуска ${allowed.toPrecision(3)}.`
      : `Не совпадает с эталоном (расхождение ${diff.toPrecision(3)}).`;
  }
  return result;
}

function gradeAcceptedText(
  type: "short_text" | "formula",
  value: string,
  accepted: string[],
  normalize: (input: unknown) => string,
): GradeResult {
  const result = baseResult(type, 0, 1);
  const normalized = normalize(value);
  if (!normalized) {
    result.feedback = "Ответ пустой.";
    return result;
  }
  const variants = accepted.map(normalize).filter(Boolean);
  if (variants.includes(normalized)) {
    result.score = 1;
    result.percent = 100;
    result.correct = true;
    result.passed = true;
    result.feedback = "Верно.";
    return result;
  }
  result.feedback = "Ответ не совпал ни с одним допустимым вариантом.";
  return result;
}

/** Длина наибольшей общей подпоследовательности — частичный зачёт порядка. */
function longestCommonSubsequence(a: string[], b: string[]): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      table[i][j] = a[i - 1] === b[j - 1]
        ? table[i - 1][j - 1] + 1
        : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  return table[rows - 1][cols - 1];
}

function gradeOrdering(answer: Extract<ActivityAnswer, { type: "ordering" }>): GradeResult {
  const correct = answer.correct;
  if (!correct.length) return baseResult("ordering", 0, 1);
  const value = answer.value.slice(0, correct.length);
  const score = longestCommonSubsequence(value, correct) / correct.length;
  const result = baseResult("ordering", score, 1);
  result.matched = value.filter((item, index) => correct[index] === item);
  result.missed = correct.filter((item, index) => value[index] !== item);
  result.feedback = result.correct
    ? "Порядок верный."
    : `На своих местах ${result.matched.length} из ${correct.length}.`;
  return result;
}

function gradeMatching(answer: Extract<ActivityAnswer, { type: "matching" }>): GradeResult {
  const keys = Object.keys(answer.correct);
  if (!keys.length) return baseResult("matching", 0, 1);
  const normalize = (value: string) => normalizeAnswerText(value);
  const hits = keys.filter((key) => normalize(answer.value[key] ?? "") === normalize(answer.correct[key]));
  const score = hits.length / keys.length;
  const result = baseResult("matching", score, 1);
  result.matched = hits;
  result.missed = keys.filter((key) => !hits.includes(key));
  result.feedback = result.correct
    ? "Все пары верные."
    : `Верно ${hits.length} из ${keys.length} пар.`;
  return result;
}

function gradeOpenText(answer: Extract<ActivityAnswer, { type: "open_text" }>): GradeResult {
  const criteria = answer.criteria.filter((criterion) => criterion.any.some((word) => normalizeAnswerText(word)));
  const threshold = Math.max(0, Math.min(1, answer.threshold ?? 0.6));
  if (!criteria.length) {
    const empty = baseResult("open_text", 0, threshold);
    empty.feedback = "У вопроса не заданы критерии проверки.";
    return empty;
  }
  const totalWeight = criteria.reduce((sum, criterion) => sum + Math.max(0.0001, criterion.weight ?? 1), 0);
  let earned = 0;
  const matched: string[] = [];
  const missed: string[] = [];
  for (const criterion of criteria) {
    const hit = criterion.any.some((word) => containsStem(answer.value, word));
    if (hit) {
      earned += Math.max(0.0001, criterion.weight ?? 1);
      matched.push(criterion.label);
    } else {
      missed.push(criterion.label);
    }
  }
  const result = baseResult("open_text", earned / totalWeight, threshold);
  result.matched = matched;
  result.missed = missed;
  if (result.correct) {
    result.feedback = "Раскрыты все смысловые элементы.";
  } else if (!normalizeAnswerText(answer.value)) {
    result.feedback = "Ответ пустой.";
  } else {
    result.feedback = `Раскрыто ${matched.length} из ${criteria.length} элементов.`;
  }
  return result;
}

/** Единая точка проверки: интерфейс и сервер используют одно правило. */
export function gradeActivity(answer: ActivityAnswer): GradeResult {
  switch (answer.type) {
    case "single_choice":
      return gradeSingleChoice(answer);
    case "multiple_choice":
      return gradeMultipleChoice(answer);
    case "true_false": {
      const result = baseResult("true_false", answer.selected === answer.correct ? 1 : 0, 1);
      result.feedback = answer.selected === null
        ? "Ответ не выбран."
        : result.correct
          ? "Верно."
          : "Утверждение оценено неверно.";
      return result;
    }
    case "numeric":
      return gradeNumeric(answer);
    case "short_text":
      return gradeAcceptedText("short_text", answer.value, answer.accepted, normalizeAnswerText);
    case "formula":
      return gradeAcceptedText("formula", answer.value, answer.accepted, normalizeFormulaText);
    case "ordering":
      return gradeOrdering(answer);
    case "matching":
      return gradeMatching(answer);
    case "open_text":
      return gradeOpenText(answer);
  }
}
