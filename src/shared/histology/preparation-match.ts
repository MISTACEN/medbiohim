/**
 * Сопоставление препарата с методической карточкой — одно правило на оба контура.
 *
 * Раньше нормализация и поиск «гид ↔ карточка банка» были продублированы:
 * `src/lib/histologyAtlas.ts` (браузер) и
 * `workers/api/src/routes/diagnosticum/model.ts` (Worker). Копии уже разошлись —
 * Worker искал вхождение в обе стороны, браузер только в одну, а пустое название
 * карточки в Worker совпадало с любым гидом. Теперь правило живёт здесь, а оба
 * модуля его переиспользуют; функции чистые, без зависимостей от DOM и БД.
 */

/** Короче этого названия сравнивать по вхождению нельзя: «кровь» есть везде. */
export const MIN_MATCH_LENGTH = 4;

/**
 * Нормализация ключа: регистр, «ё», пунктуация и пробелы не должны решать,
 * найдётся препарат или нет. Латиница сохраняется — ключи гидов латинские.
 */
export function preparationKey(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

/** Нормализованные варианты названия гида: `key` и `name`, без повторов. */
export function preparationNames(guide: { key?: unknown; name?: unknown }): string[] {
  return [...new Set([preparationKey(guide.key), preparationKey(guide.name)].filter(Boolean))];
}

/**
 * Один препарат и одна карточка? Точное совпадение ключей или вхождение
 * названия (в любую сторону): «Митоз (корешок лука)» ↔ «Митоз».
 * Пустые и слишком короткие названия не совпадают ни с чем.
 */
export function preparationContains(left: unknown, right: unknown): boolean {
  const a = preparationKey(left);
  const b = preparationKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < MIN_MATCH_LENGTH || b.length < MIN_MATCH_LENGTH) return false;
  return a.includes(b) || b.includes(a);
}
