"use client";

import { VIEWS } from "./model";
import type { TestsCatalogController } from "./useTestsCatalog";

/**
 * Переключатель разделов: одна «капсула» вместо разрозненных кнопок — активный
 * раздел виден сразу, а счётчики (химия, история) читаются как метрики, а не
 * как декоративные бейджи.
 */
export function TestsViewNav({ page }: { page: TestsCatalogController }) {
  const { view, selectView, chemistryTotal, attempts } = page;

  function countFor(id: string): number | null {
    if (id === "chemistry") return chemistryTotal || null;
    if (id === "history") return attempts.length || null;
    return null;
  }

  return (
    <nav
      aria-label="Разделы тестов"
      className="mobile-scroll-x flex flex-nowrap items-center gap-1 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-sm"
    >
      {VIEWS.map(({ id, label, Icon }) => {
        const active = view === id;
        const count = countFor(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => selectView(id)}
            aria-current={active ? "page" : undefined}
            className={
              "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition " +
              (active
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")
            }
          >
            <Icon className="h-4 w-4" />
            {label}
            {count !== null && (
              <span
                className={
                  "rounded-full px-2 py-0.5 text-[11px] font-bold " +
                  (active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600")
                }
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
