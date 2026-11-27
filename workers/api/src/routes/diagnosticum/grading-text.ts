/**
 * Проверка свободного ответа: сравнение формулировок без ИИ.
 *
 * Студент не обязан повторять название препарата слово в слово: «гиалиновый
 * хрящ», «хрящ гиалиновый» и «Гиалиновый хрящ.» — один ответ. Здесь только
 * детерминированные правила (нормализация, вхождение, близость слов), ИИ
 * подключается отдельно и только когда правила не дали ответа.
 */

export type TextVerdict = "correct" | "incorrect" | "unsure";

export type TextGrade = {
  verdict: TextVerdict;
  /** 0…1: насколько правило уверено (у ИИ — из ответа модели). */
  confidence: number;
  source: "exact" | "contains" | "fuzzy" | "none";
  reason?: string;
};

/**
 * Нормализация: регистр, «ё», пунктуация и лишние пробелы не важны.
 * `лейкоциты,  с ядром!` → `лейкоциты с ядром`.
 */
export function normalizeAnswer(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Слова длиннее двух букв: предлоги и союзы не должны решать исход. */
function words(value: string): string[] {
  return normalizeAnswer(value)
    .split(/[\s-]+/)
    .filter((word) => word.length > 2);
}

/** Расстояние Левенштейна — только для коротких названий, без внешних зависимостей. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, index) => index);
  for (let row = 1; row < rows; row += 1) {
    const current = [row];
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      current[col] = Math.min(previous[col] + 1, current[col - 1] + 1, previous[col - 1] + cost);
    }
    previous = current;
  }
  return previous[cols - 1];
}

/** Доля общих слов: «хрящ гиалиновый» и «гиалиновый хрящ» — 1. */
export function wordOverlap(input: string, target: string): number {
  const left = new Set(words(input));
  const right = new Set(words(target));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

/**
 * Сравнивает ответ с набором допустимых названий.
 *
 * Порядок: точное совпадение → вхождение целого названия → близость слов.
 * Всё остальное — `incorrect`: решать по смыслу должен ИИ, а не догадка.
 */
export function compareAnswer(input: string, targets: string[]): TextGrade {
  const answer = normalizeAnswer(input);
  if (!answer) return { verdict: "incorrect", confidence: 1, source: "none", reason: "Пустой ответ" };

  const normalizedTargets = targets.map(normalizeAnswer).filter(Boolean);
  if (normalizedTargets.includes(answer)) {
    return { verdict: "correct", confidence: 1, source: "exact" };
  }

  for (const target of normalizedTargets) {
    // «Митоз (корешок лука)» и «митоз» — вхождение в любую сторону, но только от
    // четырёх символов: «ядро» не должно зачитываться как «ядро остеокласта».
    if (target.length >= 4 && answer.length >= 4 && (answer.includes(target) || target.includes(answer))) {
      return { verdict: "correct", confidence: 0.9, source: "contains" };
    }
  }

  let best = 0;
  for (const target of normalizedTargets) {
    best = Math.max(best, wordOverlap(answer, target));
    if (best >= 0.7) return { verdict: "correct", confidence: 0.8, source: "fuzzy" };
    const shortest = Math.min(answer.length, target.length);
    if (shortest >= 5 && editDistance(answer, target) <= 2) {
      return { verdict: "correct", confidence: 0.75, source: "fuzzy" };
    }
  }

  return {
    verdict: "incorrect",
    confidence: Math.min(0.9, 0.5 + best),
    source: "none",
    reason: "Формулировка не совпадает с эталоном",
  };
}
