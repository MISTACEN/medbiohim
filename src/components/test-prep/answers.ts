/** Вариант ответа: строка или объект с ключом/подписью/эталоном. */
export type QuestionOption = string | { key?: unknown; label?: unknown; correct?: boolean };

export const optionLabel = (option: QuestionOption) =>
  typeof option === "string" ? option : String(option?.label ?? "");

export const optionKey = (option: QuestionOption, index: number) => {
  if (typeof option === "string") return String.fromCharCode(65 + index);
  const key = option?.key;
  return key != null && String(key).trim() ? String(key) : String.fromCharCode(65 + index);
};

export const optionCorrect = (option: QuestionOption) =>
  typeof option !== "string" && option?.correct === true;

export function parseSelection(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
  } catch {}
  return value.trim() ? [value.trim()] : [];
}

/** Переводит и ключи (А/1), и старые текстовые ответы в канонические ключи вариантов. */
export function selectedKeys(q: any, value: string | undefined): string[] {
  const options: QuestionOption[] = Array.isArray(q?.options) ? q.options : [];
  const lookup = new Map<string, string>();
  options.forEach((option, index) => {
    const key = optionKey(option, index);
    lookup.set(key.trim().toLowerCase(), key);
    lookup.set(optionLabel(option).trim().toLowerCase(), key);
    lookup.set(String(index), key);
  });
  const result: string[] = [];
  for (const token of parseSelection(value)) {
    const key = lookup.get(token.trim().toLowerCase());
    if (key && !result.includes(key)) result.push(key);
  }
  return result;
}

export function correctKeys(q: any, grading?: any): string[] {
  if (Array.isArray(grading?.correct_keys) && grading.correct_keys.length) {
    return grading.correct_keys.map(String);
  }
  const options: QuestionOption[] = Array.isArray(q?.options) ? q.options : [];
  return options.flatMap((option, index) => (optionCorrect(option) ? [optionKey(option, index)] : []));
}

export function sameSet(a: string[], b: string[]): boolean {
  const norm = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))).sort();
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

export function answerCorrect(q: any, value: string | undefined, grading?: any): boolean {
  if (grading && grading.is_correct != null) return grading.is_correct === true;
  const expected = correctKeys(q, grading);
  if (!expected.length) return false;
  const given = selectedKeys(q, value);
  if (q?.requires_order) return JSON.stringify(given) === JSON.stringify(expected);
  return sameSet(given, expected);
}

export function answerDisplay(q: any, value: string | undefined): string {
  const selected = parseSelection(value);
  if (!selected.length) return "";
  const options: QuestionOption[] = Array.isArray(q?.options) ? q.options : [];
  const keys = selectedKeys(q, value);
  if (keys.length) {
    return keys
      .map((key) => {
        const index = options.findIndex((option, i) => optionKey(option, i) === key);
        const option = index >= 0 ? options[index] : null;
        return option ? `${key}) ${optionLabel(option)}` : key;
      })
      .join("; ");
  }
  return selected.join("; ");
}

export function etalonDisplay(q: any, grading?: any): string {
  const fromServer = String(q?.answer_display || grading?.answer_display || "").trim();
  if (fromServer) return fromServer;
  const options: QuestionOption[] = Array.isArray(q?.options) ? q.options : [];
  const keys = correctKeys(q, grading);
  if (keys.length) {
    return keys
      .map((key) => {
        const index = options.findIndex((option, i) => optionKey(option, i) === key);
        return index >= 0 ? `${key}) ${optionLabel(options[index])}` : key;
      })
      .join("; ");
  }
  return String(q?.answer || "").trim();
}

/** Переключение выбора: одиночный — замена, множественный — инверсия. */
export function toggleSelection(q: any, raw: string | undefined, key: string, isMulti: boolean): string {
  const current = selectedKeys(q, raw);
  const next = isMulti ? (current.includes(key) ? current.filter((x) => x !== key) : [...current, key]) : [key];
  return JSON.stringify(next);
}
