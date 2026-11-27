/**
 * Примитивы диагностикума: строки, списки, нормализация названий и
 * перемешивание вариантов.
 *
 * Вынесено из `model.ts`, чтобы и выбор карточки банка (`model.ts`), и сборка
 * задания (`model-questions.ts`) пользовались одними правилами без цикла
 * импортов. Здесь нет ни Hono, ни Supabase — только чистые функции.
 */
import { preparationKey } from "../../../../../src/shared/histology/preparation-match";

import type { GuideRow } from "./types";

/** Строка без пробелов по краям; экспортируется для `grading.ts`. */
export const text = (value: unknown): string => String(value ?? "").trim();

/**
 * Нормализация названия — то же правило, что в браузере (`histologyAtlas`):
 * регистр, «ё», пунктуация и пробелы не важны. Модуль общий, чтобы атлас и
 * диагностикум не разошлись в том, какой препарат считается одним и тем же.
 */
export const normalizeName = preparationKey;

export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter(Boolean);
}

export function guideStructures(guide: GuideRow): string[] {
  return stringList(guide.structures);
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/** Случайная выборка без повторов — общая для вариантов и обманок. */
export function sample<T>(items: T[], count: number, random: () => number): T[] {
  return shuffle(items, random).slice(0, Math.max(0, count));
}

/**
 * Закрывает варианты ответа: id — только позиция после перемешивания (`a1…aN`).
 *
 * Раньше id был ключом методички (`ct-hyaline-cartilage`), а у утверждений —
 * префиксом правильности (`f0…` — верные, `x0…` — обманки). По такой разметке
 * ответ угадывался без изображения и без чтения вопроса. Позиционный id не
 * сообщает ничего: правильность остаётся только в ключе на сервере.
 */
export function sealOptions(
  candidates: Array<{ label: string; correct: boolean }>,
  random: () => number,
): { options: Array<{ id: string; label: string }>; correct: string[] } {
  const ordered = shuffle(candidates, random);
  const options = ordered.map((item, index) => ({ id: `a${index + 1}`, label: item.label }));
  const correct = ordered.flatMap((item, index) => (item.correct ? [options[index].id] : []));
  return { options, correct };
}