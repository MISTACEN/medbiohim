"use client";

/**
 * Периодическая таблица как справочник, а не игрушка: сетка 18×10 (как в
 * печатной таблице, с вынесенными рядами лантаноидов и актиноидов), поиск по
 * названию/символу/номеру и карточка элемента. Данные статические — страница
 * работает и без сети после первой загрузки.
 */
import { useMemo, useState } from "react";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  PERIODIC_ELEMENTS,
  findElement,
  type ChemicalElement,
} from "@/lib/chemistry/periodic-table";

const ROW_LABELS: Record<number, string> = { 9: "Лантаноиды", 10: "Актиноиды" };

export function PeriodicTableView() {
  const [selected, setSelected] = useState<ChemicalElement | null>(null);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => findElement(query), [query]);
  const highlight = useMemo(() => new Set(matches.map((item) => item.number)), [matches]);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-bold">Периодическая таблица</h2>
        <p className="text-sm text-[var(--muted)]">
          118 элементов: масса, группа, период. Нажмите на элемент, чтобы увидеть карточку; лантаноиды и актиноиды
          вынесены в нижние ряды.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск: Fe, железо, 26…"
          className="min-h-10 w-full max-w-xs rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
        />
        {query ? (
          <span className="text-xs text-[var(--muted)]">
            {matches.length ? `найдено: ${matches.length}` : "ничего не найдено"}
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: "repeat(18, minmax(44px, 1fr))", minWidth: 860 }}
        >
          {PERIODIC_ELEMENTS.map((element) => (
            <button
              key={element.number}
              type="button"
              onClick={() => setSelected(element)}
              aria-pressed={selected?.number === element.number}
              title={`${element.name} · ${element.symbol}`}
              style={{
                gridColumn: element.group,
                gridRow: element.period,
                backgroundColor: CATEGORY_COLORS[element.category],
                opacity: query && !highlight.has(element.number) ? 0.25 : 1,
              }}
              className={
                "flex flex-col items-center justify-center rounded-md px-1 py-1.5 leading-tight text-slate-900 transition " +
                (selected?.number === element.number ? "ring-2 ring-[var(--primary)] ring-offset-1" : "")
              }
            >
              <span className="text-[9px] font-semibold opacity-70">{element.number}</span>
              <span className="text-sm font-bold">{element.symbol}</span>
              <span className="hidden text-[9px] sm:block">{element.mass === "—" ? "—" : element.mass}</span>
            </button>
          ))}

          {[9, 10].map((row) => (
            <div
              key={`label-${row}`}
              style={{ gridColumn: "1 / span 2", gridRow: row }}
              className="flex items-center text-[10px] font-semibold text-[var(--muted)]"
            >
              {ROW_LABELS[row]}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
        {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[key] }} />
            {CATEGORY_LABELS[key]}
          </span>
        ))}
      </div>

      {selected ? (
        <section className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-extrabold">
                {selected.symbol} · {selected.name}
              </h2>
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                {CATEGORY_LABELS[selected.category]} · группа {selected.group} · период{" "}
                {selected.period === 9 || selected.period === 10 ? "— (f-ряд)" : selected.period}
              </p>
            </div>
            <div className="flex gap-4 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Номер</p>
                <p className="text-xl font-bold">{selected.number}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Масса</p>
                <p className="text-xl font-bold">{selected.mass}</p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            {selected.mass === "—"
              ? "У элемента нет устойчивых изотопов: в справочниках указывают массу самого долгоживущего изотопа."
              : "Атомная масса приведена по стандартным значениям IUPAC; в расчётах задач допустимо округлять до целых."}
          </p>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mt-3 text-xs font-semibold text-[var(--primary)]"
          >
            Скрыть карточку
          </button>
        </section>
      ) : null}
    </section>
  );
}

