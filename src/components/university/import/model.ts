/** Нормализация JSON из Bridge в пакет импорта (без React). */

export type SubjectRow = {
  id: string;
  name: string;
  slug?: string | null;
};

export type RawOption =
  | string
  | {
      label?: unknown;
      text?: unknown;
      value?: unknown;
      correct?: unknown;
      is_correct?: unknown;
    };

export type RawQuestion = {
  question_key?: unknown;
  text?: unknown;
  question?: unknown;
  prompt?: unknown;
  type?: unknown;
  question_type?: unknown;
  options?: unknown;
  answer?: unknown;
  correct?: unknown;
  source?: unknown;
};

export type RawBundle = {
  schema?: unknown;
  test_title?: unknown;
  testTitle?: unknown;
  source?: unknown;
  questions?: unknown;
};

export type SourceMeta = {
  system: string;
  url: string;
  test_title: string;
  collected_at: string;
};

export type NormalizedQuestion = {
  key: string;
  text: string;
  type: "mcq" | "open";
  options: Array<{ label: string; correct: boolean }>;
  answer: string;
  correctCount: number;
  source: SourceMeta;
  warning: string | null;
};

export type NormalizedBundle = {
  testKey: string;
  testTitle: string;
  source: SourceMeta | null;
  questions: NormalizedQuestion[];
  skipped: string[];
};

export type ImportError = { sheet: string; row: number; error: string };

export function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function stableKey(prefix: string, value: string): string {
  return `${prefix}-${hash(value)}`.slice(0, 180);
}

export function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function sourceFrom(raw: unknown, fallbackTitle: string): SourceMeta {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    system: asText(source.system) || "test.fesmu.ru",
    url: asText(source.url) || "http://test.fesmu.ru:8080/",
    test_title: asText(source.test_title) || asText(source.testTitle) || fallbackTitle,
    collected_at: asText(source.collected_at) || new Date().toISOString(),
  };
}

export function parseCorrectIndexes(value: unknown, count: number): number[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s;]+/).filter(Boolean)
      : typeof value === "number"
        ? [value]
        : [];
  const indexes: number[] = [];
  for (const item of values) {
    const numeric = Number(item);
    if (!Number.isInteger(numeric)) continue;
    const zeroBased = numeric >= 1 && numeric <= count ? numeric - 1 : numeric;
    if (zeroBased >= 0 && zeroBased < count && !indexes.includes(zeroBased)) indexes.push(zeroBased);
  }
  return indexes;
}

export function normalizeQuestion(raw: RawQuestion, bundleSource: SourceMeta, bundleTitle: string): NormalizedQuestion | { error: string } {
  const text = asText(raw.text) || asText(raw.question) || asText(raw.prompt);
  if (!text) return { error: "Пустой текст вопроса" };

  const source = sourceFrom(raw.source, bundleTitle || bundleSource.test_title);
  const rawOptions = Array.isArray(raw.options) ? (raw.options as RawOption[]) : [];
  const options = rawOptions
    .map((option) => {
      if (typeof option === "string") return { label: option.trim(), correct: false };
      if (!option || typeof option !== "object") return { label: "", correct: false };
      return {
        label: asText(option.label) || asText(option.text) || asText(option.value),
        correct: option.correct === true || option.is_correct === true,
      };
    })
    .filter((option) => option.label.length > 0);

  const rawType = (asText(raw.type) || asText(raw.question_type)).toLowerCase();
  const openByType = ["open", "text", "number", "sequence", "matching", "conformity"].includes(rawType);
  const correctFromField = parseCorrectIndexes(raw.correct, options.length);
  for (const index of correctFromField) {
    if (options[index]) options[index].correct = true;
  }

  const answerText = asText(raw.answer);
  if (answerText && options.length > 0 && !options.some((option) => option.correct)) {
    const direct = options.findIndex((option) => option.label.toLowerCase() === answerText.toLowerCase());
    if (direct >= 0) {
      options[direct].correct = true;
    } else {
      const indexes = parseCorrectIndexes(answerText, options.length);
      for (const index of indexes) {
        if (options[index]) options[index].correct = true;
      }
    }
  }

  const correctCount = options.filter((option) => option.correct).length;
  let type: "mcq" | "open" = openByType ? "open" : "mcq";
  if (!openByType && options.length === 0 && answerText) type = "open";

  if (type === "mcq" && options.length < 2) return { error: "Для закрытого вопроса нужно минимум два варианта" };
  if (type === "mcq" && correctCount === 0) return { error: "Не отмечен правильный вариант" };

  const keySeed = `${text}|${options.map((option) => `${option.label}:${option.correct ? 1 : 0}`).join("|")}|${source.url}`;
  const providedKey = asText(raw.question_key);
  const key = /^[a-zA-Z0-9_.-]{1,180}$/.test(providedKey) ? providedKey : stableKey("fesmu-test-q", keySeed);
  const answer = type === "open" ? answerText : options.filter((option) => option.correct).map((option) => option.label).join(" | ");
  const warning = type === "open" && !answer ? "Открытый ответ пуст — проверьте перед публикацией" : null;

  return {
    key,
    text,
    type,
    options,
    answer,
    correctCount,
    source,
    warning,
  };
}

export function normalizeBundle(raw: unknown): NormalizedBundle {
  const object = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as RawBundle) : {};
  const rawQuestions = Array.isArray(raw)
    ? raw
    : Array.isArray(object.questions)
      ? object.questions
      : object && typeof object === "object" && ("text" in object || "question" in object)
        ? [object]
        : [];
  const title =
    asText(object.test_title) ||
    asText(object.testTitle) ||
    asText((object.source as Record<string, unknown> | undefined)?.test_title) ||
    "Импорт из тестовой системы ДВГМУ";
  const source = sourceFrom(object.source, title);
  const questions: NormalizedQuestion[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const item of rawQuestions) {
    if (!item || typeof item !== "object") {
      skipped.push("Пропущена запись без объекта вопроса");
      continue;
    }
    const normalized = normalizeQuestion(item as RawQuestion, source, title);
    if ("error" in normalized) {
      skipped.push(normalized.error);
      continue;
    }
    if (seen.has(normalized.key)) {
      skipped.push(`Дубликат: ${normalized.text.slice(0, 60)}…`);
      continue;
    }
    seen.add(normalized.key);
    questions.push(normalized);
  }

  const testKey = stableKey("fesmu-test", `${title}|${source.url}`);
  return { testKey, testTitle: title, source, questions, skipped };
}

export function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
