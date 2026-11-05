/**
 * Приведение серверного payload вопроса к единой модели клиента.
 *
 * Границы ответственности: сервер уже разобрал исторические форматы `answer`
 * (см. `normalizeQuestion` в `integrations/cloudflare-api/src/question-format.js`)
 * и прислал `is_closed`, `options[].correct`, `correct_keys`, `requires_order`.
 * Клиент не должен заново угадывать эталон по свободному тексту — только
 * переносить поля и безопасно скрывать эталон в экзаменационном режиме.
 */
import { resolveQuestionType } from "./registry";
import type { NormalizedOption, NormalizedQuestion, ServerQuestionLike } from "./types";

const LATIN_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function defaultKey(index: number): string {
  return LATIN_KEYS[index] ?? String(index + 1);
}

function toNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0);
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return [value];
  if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    const source = text.startsWith("[") ? safeJson(text) : null;
    if (Array.isArray(source)) return toNumberArray(source);
    return text
      .split(/[,;\s]+/)
      .map((token) => Number(token))
      .filter((item) => Number.isInteger(item) && item >= 0);
  }
  return [];
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function coerceOption(item: unknown, index: number, usedKeys: Set<string>): NormalizedOption | null {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const source = item as Record<string, unknown>;
    const label = String(source.label ?? source.text ?? source.title ?? source.value ?? "").trim();
    if (!label) return null;
    let key = source.key != null && String(source.key).trim() ? String(source.key).trim() : defaultKey(index);
    if (usedKeys.has(key.toUpperCase())) key = defaultKey(index);
    usedKeys.add(key.toUpperCase());
    const option: NormalizedOption = { key, label };
    if (source.id != null) option.id = String(source.id);
    if (source.correct === true || source.is_correct === true || source.isCorrect === true) option.correct = true;
    if (source.image_file_id != null) option.image_file_id = String(source.image_file_id);
    return option;
  }
  const label = String(item ?? "").trim();
  if (!label) return null;
  const key = defaultKey(index);
  usedKeys.add(key.toUpperCase());
  return { key, label };
}

/**
 * Варианты ответа из массива строк, массива объектов или JSON-строки.
 * Полный разбор исторических форматов остаётся на сервере.
 */
export function coerceOptions(raw: unknown): NormalizedOption[] {
  let value = raw;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    const parsed = safeJson(text);
    if (!Array.isArray(parsed)) return [];
    value = parsed;
  }
  if (!Array.isArray(value)) return [];
  const usedKeys = new Set<string>();
  const options: NormalizedOption[] = [];
  value.forEach((item, index) => {
    const option = coerceOption(item, index, usedKeys);
    if (option) options.push(option);
  });
  return options;
}

function buildDisplay(
  options: NormalizedOption[],
  orderIndexes: number[],
  correctIndexes: number[],
  fallback: string,
): string {
  if (orderIndexes.length) {
    return orderIndexes
      .map((index) => options[index])
      .filter((option): option is NormalizedOption => Boolean(option))
      .map((option) => `${option.key}) ${option.label}`)
      .join(" → ");
  }
  if (correctIndexes.length) {
    return correctIndexes
      .map((index) => options[index])
      .filter((option): option is NormalizedOption => Boolean(option))
      .map((option) => `${option.key}) ${option.label}`)
      .join("; ");
  }
  return fallback;
}

export type NormalizeSettings = {
  /**
   * true — обычный вид с эталоном (банк, разбор);
   * false — экзаменационный вид: признаки правильности и эталон скрыты.
   */
  reveal?: boolean;
};

export function normalizeQuestion(raw: ServerQuestionLike, settings: NormalizeSettings = {}): NormalizedQuestion {
  const reveal = settings.reveal !== false;
  const rawType = String(raw.type ?? "").trim();
  const descriptor = resolveQuestionType(rawType);
  const options = coerceOptions(raw.options);

  const fromServer = toNumberArray(raw.correct_indexes);
  const orderIndexes = toNumberArray(raw.order_indexes);
  const flagged = options.flatMap((option, index) => (option.correct === true ? [index] : []));
  const correctIndexes = fromServer.length ? fromServer : flagged;

  const kind: NormalizedQuestion["kind"] =
    typeof raw.is_closed === "boolean"
      ? raw.is_closed
        ? "closed"
        : "open"
      : descriptor
        ? descriptor.kind
        : options.length >= 2
          ? "closed"
          : "open";

  const answer = raw.answer == null ? "" : String(raw.answer).trim();
  const requiresOrder = raw.requires_order === true || orderIndexes.length > 0;
  const answerDisplay = reveal
    ? String(raw.answer_display ?? "").trim() || buildDisplay(options, orderIndexes, correctIndexes, answer)
    : "";

  const visibleOptions: NormalizedOption[] = reveal
    ? options
    : options.map((option) => {
        const copy: NormalizedOption = { key: option.key, label: option.label };
        if (option.id) copy.id = option.id;
        if (option.image_file_id) copy.image_file_id = option.image_file_id;
        return copy;
      });

  const resolved =
    correctIndexes.length > 0 ||
    orderIndexes.length > 0 ||
    answer.length > 0 ||
    Boolean(raw.answer_display);

  return {
    ...(raw.id != null ? { id: String(raw.id) } : {}),
    type: descriptor ? descriptor.id : "unknown",
    rawType,
    kind,
    text: String(raw.text ?? raw.body ?? "").trim(),
    answer: reveal ? answer : "",
    options: visibleOptions,
    correctKeys: reveal ? correctIndexes.map((index) => options[index]?.key).filter((key): key is string => Boolean(key)) : [],
    correctIndexes: reveal ? correctIndexes : [],
    orderIndexes: reveal ? orderIndexes : [],
    requiresOrder,
    allowMultiple: raw.allow_multiple === true || correctIndexes.length > 1,
    resolved,
    answerDisplay,
  };
}

/** Экзаменационный вид: без эталона, признаков правильности и разбора. */
export function toPublicQuestion(question: NormalizedQuestion): NormalizedQuestion {
  return {
    ...question,
    answer: "",
    options: question.options.map((option) => {
      const copy: NormalizedOption = { key: option.key, label: option.label };
      if (option.id) copy.id = option.id;
      if (option.image_file_id) copy.image_file_id = option.image_file_id;
      return copy;
    }),
    correctKeys: [],
    correctIndexes: [],
    orderIndexes: [],
    answerDisplay: "",
  };
}
