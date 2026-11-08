/**
 * Порядок показа вариантов ответа.
 *
 * Перемешивание — только отображение: ключ варианта и его исходный индекс
 * вычисляются ДО перемешивания, поэтому сохранённые ответы (канонические
 * ключи) и грейдинг по индексам остаются корректными при любом порядке.
 */

export type OptionEntry<T> = {
  option: T;
  /** Канонический ключ варианта из исходного порядка (не зависит от показа). */
  key: string;
  /** Индекс варианта в исходном массиве. */
  index: number;
};

/** FNV-1a: короткий стабильный сид из строки. */
function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Порядок вариантов для показа. Детерминирован для вопроса: пересоздание
 * компонента и восстановление попытки не меняют порядок. Вопросы, где важен
 * порядок выбора (requires_order), и одиночные варианты не перемешиваются.
 */
export function displayOptionEntries<T>(
  question: { id?: unknown; requires_order?: unknown } | null | undefined,
  options: T[],
  keyOf?: (option: T, index: number) => string,
): OptionEntry<T>[] {
  const entries = options.map((option, index) => ({
    option,
    key: keyOf ? keyOf(option, index) : String.fromCharCode(65 + index),
    index,
  }));
  if (!question || question.requires_order === true || entries.length < 2) return entries;
  // LCG поверх FNV-сида: один проход Фишера—Йетса, без Math.random —
  // один и тот же вопрос всегда показывается в одном и том же порядке.
  let seed = hashSeed(String(question.id ?? ""));
  const arr = [...entries];
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
