"use client";

/**
 * Блок поиска и фильтров: поле поиска по номеру/символу/названию,
 * чипы категорий, счётчик совпадений, список совпадений и пустое состояние.
 */
import { Search } from "lucide-react";
import { categoryLabelRu, chemicalElements, type ChemicalElement } from "@/lib/elements";
import { categoryColor } from "./model";
import type { PeriodicTableController } from "./usePeriodicTable";

export function ElementFilters({ controller }: { controller: PeriodicTableController }) {
  const { query, setQuery, category, setCategory, resetFilters, isFiltering, visible, categories } = controller;

  return (
    <section aria-labelledby="elements-controls" className="card space-y-4">
      <h2 id="elements-controls" className="sr-only">
        Поиск и фильтры
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="elements-search" className="sr-only">
            Поиск элемента по номеру, символу или названию
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            id="elements-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Fe, железо или 26"
            autoComplete="off"
            className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--primary)]"
            style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
          />
        </div>
        <button
          type="button"
          onClick={resetFilters}
          disabled={!isFiltering}
          className="btn-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          Сбросить фильтры
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Фильтр по категории">
        <button
          type="button"
          aria-pressed={category === null}
          onClick={() => setCategory(null)}
          className={
            "rounded-full border px-3 py-1 text-xs font-medium transition " +
            (category === null ? "border-transparent text-white" : "hover:border-[var(--primary)]")
          }
          style={
            category === null
              ? { background: "linear-gradient(135deg, var(--primary), var(--accent))" }
              : { borderColor: "var(--border)", color: "var(--muted)", background: "var(--card)" }
          }
        >
          Все · {chemicalElements.length}
        </button>
        {categories.map(({ category: value, label, count }) => {
          const active = category === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(active ? null : value)}
              className={
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition " +
                (active ? "text-white" : "hover:border-[var(--primary)]")
              }
              style={
                active
                  ? { background: categoryColor(value), borderColor: categoryColor(value), color: "#0f172a" }
                  : { borderColor: "var(--border)", color: "var(--muted)", background: "var(--card)" }
              }
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ background: categoryColor(value) }}
              />
              {label} · {count}
            </button>
          );
        })}
      </div>

      <p role="status" aria-live="polite" className="text-sm" style={{ color: "var(--muted)" }}>
        {isFiltering
          ? `Найдено ${visible.length} из ${chemicalElements.length} элементов`
          : `Показаны все ${chemicalElements.length} элементов`}
        {category ? ` · категория: ${categoryLabelRu(category)}` : ""}
      </p>

      {isFiltering && visible.length > 0 && visible.length < chemicalElements.length && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Совпадения
          </h3>
          <ul className="flex max-h-44 flex-wrap gap-2 overflow-y-auto pr-1">
            {visible.map((element: ChemicalElement) => (
              <li key={element.number}>
                <button
                  type="button"
                  onClick={() => controller.setSelectedNumber(element.number)}
                  className="rounded-lg border px-2.5 py-1.5 text-left text-xs transition hover:border-[var(--primary)]"
                  style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
                >
                  <span className="font-semibold">{element.symbol}</span> · {element.name_ru}{" "}
                  <span className="tabular-nums" style={{ color: "var(--muted)" }}>
                    №{element.number}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isFiltering && visible.length === 0 && (
        <p role="status" className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          Ничего не найдено. Проверьте запрос или сбросьте фильтры.
        </p>
      )}
    </section>
  );
}
