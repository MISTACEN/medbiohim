/**
 * Наборы диагностикума.
 *
 * Набор — это список ключей методичек, а не новая таблица: «первая диагностика»
 * из концепции уже описана 19 позициями, и ключи этих позиций совпадают с
 * `preparation_guides.key`. Поэтому набор попадает в обзор как ещё один
 * раздел, а интерфейс остаётся выпадающим списком разделов — без отдельной
 * сущности, сида и миграции.
 *
 * Позиция без методички не выбрасывается молча: `setGuides` возвращает её в
 * `missing`, и обзор показывает «18 из 19». На 2026-11-28 все 19 позиций имеют
 * методичку, поэтому `missing` пуст; механизм остаётся на случай правок банка.
 */
import { preparationKey } from "../../../../../src/shared/histology/preparation-match";

export type DiagnosticumSet = {
  id: string;
  title: string;
  /** Позиции в порядке концепции: номер из списка и ключ методички. */
  items: Array<{ exam: string; key: string }>;
};

/**
 * `src/data/preparations-exam-list-2026-11.json`, 19 позиций.
 *
 * Концепция (§8) называет набор «18 позициями», но перечисляет 19 имён
 * (2+3+4+4+3+3) — это арифметическая ошибка в документе, а не лишняя позиция
 * (разбор: `docs/FIRST-DIAGNOSTICUM-18-19-2026-11-28.md`). Все 19 ключей имеют
 * методички, включая `embryology-axial-organs` (19-я добавлена 2026-11-26).
 */
export const FIRST_DIAGNOSTICUM: DiagnosticumSet = {
  id: "first",
  title: "Первая диагностика",
  items: [
    { exam: "1.1", key: "cytology-fat-inclusions" },
    { exam: "1.2", key: "cytology-mitosis" },
    { exam: "2.1", key: "embryology-sperm" },
    { exam: "2.2", key: "embryology-egg" },
    { exam: "2.3", key: "embryology-axial-organs" },
    { exam: "3.1", key: "epithelium-columnar-intestine" },
    { exam: "3.2", key: "epithelium-ciliated-trachea" },
    { exam: "3.3", key: "epithelium-nonkeratinized-cornea" },
    { exam: "3.4", key: "epithelium-transitional-bladder" },
    { exam: "4.1", key: "ct-blood-smear" },
    { exam: "4.2", key: "ct-tendon" },
    { exam: "4.3", key: "ct-hyaline-cartilage" },
    { exam: "4.4", key: "ct-elastic-cartilage" },
    { exam: "5.1", key: "bone-tubular" },
    { exam: "5.2", key: "bone-development" },
    { exam: "5.3", key: "muscle-striated" },
    { exam: "6.1", key: "nerve-myelin" },
    { exam: "6.2", key: "nerve-astrocytes" },
    { exam: "6.3", key: "nerve-pacinian" },
  ],
};

/**
 * Методички набора в порядке позиций. `missing` — ключи, для которых методички
 * нет: они возвращаются наружу, а не игнорируются.
 */
export function setGuides<T extends { key?: string | null }>(
  set: DiagnosticumSet,
  guides: T[],
): { guides: T[]; missing: string[] } {
  const byKey = new Map<string, T>();
  for (const guide of guides) {
    const key = preparationKey(guide.key);
    if (key) byKey.set(key, guide);
  }

  const picked: T[] = [];
  const missing: string[] = [];
  for (const item of set.items) {
    const guide = byKey.get(preparationKey(item.key));
    if (guide) picked.push(guide);
    else missing.push(item.key);
  }
  return { guides: picked, missing };
}

/** Раздел в запросе — это набор? Сравнение то же, что для названий препаратов. */
export function isSetSection(set: DiagnosticumSet, section: string): boolean {
  return preparationKey(section) === preparationKey(set.title);
}
