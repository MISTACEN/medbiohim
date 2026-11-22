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

/**
 * Как тот же препарат назван в банке карточек, когда написание расходится.
 * Правила вхождения тут не помогают: «Мазок крови» и «Кровь мазок» — разные
 * строки, падежи («миелиновое нервное волокно» ↔ «миелинового нервного
 * волокна»), сокращения («Хрящ.тк. Эласт. хрящ») и названия без органа
 * («Эпителий.Многосл. неорог.эпит» для роговицы). Ключ — `key` методички,
 * значения сверены с `trainer_feed_cards` на 2026-11-22. «Поперечнополосатая
 * мускулатура» алиаса не имеет: препарата в банке нет.
 */
export const PREPARATION_ALIASES: Record<string, string[]> = {
  "ct-blood-smear": ["Кровь мазок"],
  "ct-elastic-cartilage": ["Хрящ.тк. Эласт. хрящ"],
  "epithelium-ciliated-trachea": [
    "Эпителий. Многорядный эпителий",
    "Поверхность многорядного реснитчатого эпителия",
    "Трахея",
  ],
  "epithelium-columnar-intestine": ["Тонкая кишка"],
  "epithelium-nonkeratinized-cornea": ["Эпителий.Многосл. неорог.эпит"],
  "epithelium-transitional-bladder": ["Мочевой пузырь"],
  "nerve-myelin": ["Поперечный срез миелинового нервного волокна", "Нервная тк.Миел. нервн. вол"],
};

/** Нормализованные варианты названия гида: `key`, `name` и алиасы, без повторов. */
export function preparationNames(guide: { key?: unknown; name?: unknown }): string[] {
  const key = preparationKey(guide.key);
  const aliases = key ? PREPARATION_ALIASES[key] || [] : [];
  return [
    ...new Set(
      [key, preparationKey(guide.name), ...aliases.map((alias) => preparationKey(alias))].filter(Boolean),
    ),
  ];
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
