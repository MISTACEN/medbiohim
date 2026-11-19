"use client";

/**
 * Композиция периодической таблицы из блоков: шапка, фильтры, сетка,
 * легенда категорий, источники данных и карточка выбранного элемента.
 */
import { ErrorState } from "@/components/ui/ErrorState";
import { elementsValidation } from "@/lib/elements";
import { CategoryLegend } from "./CategoryLegend";
import { ElementDetails } from "./ElementDetails";
import { ElementFilters } from "./ElementFilters";
import { ElementGrid } from "./ElementGrid";
import { SourcesFooter } from "./SourcesFooter";
import { usePeriodicTable } from "./usePeriodicTable";

export function PeriodicTableContent() {
  const controller = usePeriodicTable();

  if (!elementsValidation.valid) {
    return (
      <ErrorState
        title="Данные таблицы не прошли проверку"
        message={`Снимок src/data/chemical-elements.json невалиден: ${elementsValidation.errors
          .slice(0, 2)
          .join("; ")}`}
      />
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-slate-500">MedBioHim · Химия</p>
        <h1 className="page-title">Периодическая таблица элементов</h1>
        <p className="page-subtitle max-w-3xl">
          118 элементов: группы по горизонтали, периоды по вертикали, лантаноиды и актиноиды — отдельными рядами.
          Поиск по номеру, символу и названию, фильтр по категории, карточка элемента по клику или Enter.
        </p>
      </header>

      <ElementFilters controller={controller} />
      <ElementGrid controller={controller} />
      <CategoryLegend categories={controller.categories} />
      <SourcesFooter />

      {controller.selected && (
        <ElementDetails
          element={controller.selected}
          dialogRef={controller.dialogRef}
          onClose={() => controller.setSelectedNumber(null)}
        />
      )}
    </section>
  );
}
