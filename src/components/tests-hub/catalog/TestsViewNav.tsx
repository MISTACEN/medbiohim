"use client";

import { VIEWS } from "./model";
import type { TestsCatalogController } from "./useTestsCatalog";

/** Вкладки раздела тестов с счётчиками банка по химии и истории попыток. */
export function TestsViewNav({ page }: { page: TestsCatalogController }) {
  const { view, selectView, chemistryTotal, attempts } = page;
  return (
    <nav className="mobile-scroll-x flex flex-nowrap gap-2 overflow-x-auto pb-1 md:flex-wrap" aria-label="Разделы тестов">
      {VIEWS.map(({ id, label, Icon }) => {
        const active = view === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => selectView(id)}
            aria-current={active ? "page" : undefined}
            className={
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition " +
              (active
                ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                : "border-[var(--border)] bg-[var(--card)] text-slate-700 hover:border-indigo-300")
            }
          >
            <Icon className="h-4 w-4" />
            {label}
            {id === "chemistry" && chemistryTotal > 0 && (
              <span className={"rounded-full px-2 py-0.5 text-xs " + (active ? "bg-white/20" : "bg-slate-100 text-slate-600")}>
                {chemistryTotal}
              </span>
            )}
            {id === "history" && attempts.length > 0 && (
              <span className={"rounded-full px-2 py-0.5 text-xs " + (active ? "bg-white/20" : "bg-slate-100 text-slate-600")}>
                {attempts.length}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
