"use client";

/**
 * Точка входа интерактивной периодической таблицы: сетка 18 групп × 7 периодов,
 * лантаноиды и актиноиды — отдельными рядами, как в настоящей таблице.
 *
 * Реализация разнесена по `./periodic/` (model.ts — константы оформления,
 * usePeriodicTable — состояние и клавиатурная навигация, блоки UI в
 * ElementFilters / ElementGrid / CategoryLegend / SourcesFooter / ElementDetails).
 *
 * Значения элементов берутся ТОЛЬКО из `src/lib/elements` (снимок
 * `src/data/chemical-elements.json` с указанием источника, даты и лицензии).
 * Ни один компонент таблицы не содержит захардкоженных значений элемента.
 */
import { PeriodicTableContent } from "./periodic/PeriodicTableContent";

export function PeriodicTable() {
  return <PeriodicTableContent />;
}

export default PeriodicTable;
