"use client";

/**
 * Сетка таблицы: 18 групп × 7 периодов, плейсхолдеры f-блоков,
 * спейсер перед рядами лантаноидов/актиноидов и ячейки элементов.
 */
import { chemicalElements } from "@/lib/elements";
import { F_BLOCK_PLACEHOLDERS, GROUP_NUMBERS, PERIOD_NUMBERS } from "./model";
import { PeriodicTableCell } from "./PeriodicTableCell";
import type { PeriodicTableController } from "./usePeriodicTable";

export function ElementGrid({ controller }: { controller: PeriodicTableController }) {
  const { visibleNumbers, isFiltering, focusNumber, cellRefs, handleGridKeyDown, setFocusNumber, setSelectedNumber } =
    controller;

  return (
    <section aria-labelledby="elements-grid-title" className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="elements-grid-title" className="text-lg font-bold">
          Таблица элементов
        </h2>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Стрелки — перемещение по таблице, Enter — карточка элемента
        </p>
      </div>
      <p className="text-xs sm:hidden" style={{ color: "var(--muted)" }}>
        На узком экране таблица прокручивается по горизонтали.
      </p>

      <div className="overflow-x-auto pb-1">
        <div
          role="group"
          aria-label="Периодическая таблица: 18 групп и 7 периодов, лантаноиды и актиноиды отдельными рядами"
          className="grid min-w-[880px] gap-1"
          style={{ gridTemplateColumns: "1.75rem repeat(18, minmax(2.75rem, 1fr))" }}
        >
          <div aria-hidden="true" />
          {GROUP_NUMBERS.map((group) => (
            <div
              key={`group-${group}`}
              aria-hidden="true"
              className="pb-1 text-center text-[10px] font-semibold tabular-nums"
              style={{ gridRow: 1, gridColumn: group + 1, color: "var(--muted)" }}
            >
              {group}
            </div>
          ))}

          {PERIOD_NUMBERS.map((period) => (
            <div
              key={`period-${period}`}
              aria-hidden="true"
              className="flex items-center justify-center text-[10px] font-semibold tabular-nums"
              style={{ gridRow: period + 1, gridColumn: 1, color: "var(--muted)" }}
            >
              {period}
            </div>
          ))}

          {F_BLOCK_PLACEHOLDERS.map((placeholder) => (
            <div
              key={`f-block-placeholder-${placeholder.period}`}
              aria-hidden="true"
              className="flex flex-col items-center justify-center rounded-lg border border-dashed text-center text-[9px] leading-tight"
              style={{
                gridRow: placeholder.period + 1,
                gridColumn: 4,
                borderColor: "var(--border)",
                color: "var(--muted)",
              }}
            >
              <span>{placeholder.range}</span>
              <span>{placeholder.series}</span>
            </div>
          ))}

          <div
            aria-hidden="true"
            className="mt-2 border-t"
            style={{ gridRow: 9, gridColumn: "1 / span 19", borderColor: "var(--border)" }}
          />

          {chemicalElements.map((element) => {
            const matched = visibleNumbers.has(element.number);
            const dimmed = isFiltering && !matched;
            return (
              <PeriodicTableCell
                key={element.number}
                element={element}
                dimmed={dimmed}
                focusAnchor={element.number === focusNumber}
                cellRefs={cellRefs}
                onKeyDown={handleGridKeyDown}
                onFocusCell={setFocusNumber}
                onSelect={(number) => {
                  setFocusNumber(number);
                  setSelectedNumber(number);
                }}
              />
            );
          })}
        </div>
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Ряды 57–71 (лантаноиды) и 89–103 (актиноиды) вынесены под таблицей, как принято в короткой форме.
      </p>
    </section>
  );
}
