"use client";

/**
 * Интерактивная периодическая таблица: сетка 18 групп × 7 периодов,
 * лантаноиды и актиноиды — отдельными рядами, как в настоящей таблице.
 *
 * Значения элементов берутся ТОЛЬКО из `src/lib/elements` (снимок
 * `src/data/chemical-elements.json` с указанием источника, даты и лицензии).
 * Этот компонент не содержит ни одного захардкоженного значения элемента.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { ExternalLink, Search, X } from "lucide-react";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  blockLabelRu,
  categoriesWithCounts,
  categoryLabelRu,
  chemicalElements,
  elementAriaLabel,
  elementsMeta,
  elementsValidation,
  filterElements,
  formatAtomicMass,
  phaseLabelRu,
  primarySourceLabel,
  type ChemicalElement,
} from "@/lib/elements";

/** Цветовая метка категории — только оформление, классификация берётся из источника. */
const CATEGORY_COLORS: Record<string, string> = {
  "alkali metal": "#f97316",
  "alkaline earth metal": "#f59e0b",
  "transition metal": "#6366f1",
  "post-transition metal": "#0ea5e9",
  lanthanide: "#14b8a6",
  actinide: "#10b981",
  metalloid: "#a855f7",
  "diatomic nonmetal": "#84cc16",
  "polyatomic nonmetal": "#22c55e",
  "noble gas": "#ec4899",
  "unknown, probably transition metal": "#94a3b8",
  "unknown, probably post-transition metal": "#94a3b8",
  "unknown, probably metalloid": "#94a3b8",
  "unknown, predicted to be noble gas": "#94a3b8",
};

function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "#64748b";
}

function categoryCellStyle(category: string): { backgroundColor: string; borderColor: string } {
  const color = categoryColor(category);
  return {
    backgroundColor: `color-mix(in srgb, ${color} 20%, var(--card))`,
    borderColor: `color-mix(in srgb, ${color} 55%, var(--border))`,
  };
}

const GROUP_NUMBERS = Array.from({ length: 18 }, (_, index) => index + 1);
const PERIOD_NUMBERS = Array.from({ length: 7 }, (_, index) => index + 1);

export function PeriodicTable() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [focusNumber, setFocusNumber] = useState<number>(chemicalElements[0]?.number ?? 1);

  const cellRefs = useRef(new Map<number, HTMLButtonElement>());
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const visible = useMemo(() => filterElements({ query, category }), [query, category]);
  const visibleNumbers = useMemo(() => new Set(visible.map((element) => element.number)), [visible]);
  const categories = useMemo(() => categoriesWithCounts(), []);
  const isFiltering = query.trim().length > 0 || category !== null;

  const gridIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (const element of chemicalElements) map.set(`${element.xpos}:${element.ypos}`, element.number);
    return map;
  }, []);

  const selected: ChemicalElement | null =
    selectedNumber === null ? null : chemicalElements.find((element) => element.number === selectedNumber) ?? null;

  const focusCell = (number: number) => {
    setFocusNumber(number);
    cellRefs.current.get(number)?.focus();
  };

  const moveFocus = (from: ChemicalElement, dx: number, dy: number) => {
    let x = from.xpos;
    let y = from.ypos;
    // Идём по сетке до ближайшей занятой ячейки (между блоками есть пустоты).
    for (let step = 0; step < 24; step += 1) {
      x += dx;
      y += dy;
      if (x < 1 || x > 18 || y < 1 || y > 10) return;
      const next = gridIndex.get(`${x}:${y}`);
      if (next !== undefined) {
        focusCell(next);
        return;
      }
    }
  };

  const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, element: ChemicalElement) => {
    if (event.key === "Home") {
      event.preventDefault();
      focusCell(chemicalElements[0].number);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusCell(chemicalElements[chemicalElements.length - 1].number);
      return;
    }
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    moveFocus(element, delta[0], delta[1]);
  };

  useEffect(() => {
    if (selectedNumber === null) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () =>
      dialog
        ? Array.from(
            dialog.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
          )
        : [];

    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedNumber(null);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [selectedNumber]);

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

  const resetFilters = () => {
    setQuery("");
    setCategory(null);
  };

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
              {visible.map((element) => (
                <li key={element.number}>
                  <button
                    type="button"
                    onClick={() => setSelectedNumber(element.number)}
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

            {[
              { period: 6, range: "57–71", series: "La–Lu" },
              { period: 7, range: "89–103", series: "Ac–Lr" },
            ].map((placeholder) => (
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
                <button
                  key={element.number}
                  ref={(node) => {
                    if (node) cellRefs.current.set(element.number, node);
                    else cellRefs.current.delete(element.number);
                  }}
                  type="button"
                  tabIndex={element.number === focusNumber ? 0 : -1}
                  aria-label={elementAriaLabel(element)}
                  aria-haspopup="dialog"
                  onClick={() => {
                    setFocusNumber(element.number);
                    setSelectedNumber(element.number);
                  }}
                  onFocus={() => setFocusNumber(element.number)}
                  onKeyDown={(event) => handleGridKeyDown(event, element)}
                  className={
                    "flex aspect-square min-w-0 flex-col items-center justify-center rounded-lg border px-0.5 py-1 text-center leading-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-1 " +
                    (dimmed ? "opacity-30" : "hover:-translate-y-0.5 hover:shadow-sm")
                  }
                  style={{
                    gridRow: element.ypos + 1,
                    gridColumn: element.xpos + 1,
                    ...categoryCellStyle(element.category),
                    color: "var(--text)",
                  }}
                >
                  <span className="self-end text-[9px] tabular-nums leading-none" style={{ color: "var(--muted)" }}>
                    {element.number}
                  </span>
                  <span className="text-sm font-bold leading-tight sm:text-base">{element.symbol}</span>
                  <span className="hidden w-full truncate text-[9px] leading-tight lg:block" style={{ color: "var(--muted)" }}>
                    {element.name_ru}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Ряды 57–71 (лантаноиды) и 89–103 (актиноиды) вынесены под таблицей, как принято в короткой форме.
        </p>
      </section>

      <section aria-labelledby="elements-legend" className="card space-y-3">
        <h2 id="elements-legend" className="text-lg font-bold">
          Категории
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map(({ category: value, label, count }) => (
            <li key={value} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ background: categoryColor(value), border: "1px solid var(--border)" }}
              />
              <span>{label}</span>
              <span className="ml-auto tabular-nums text-xs" style={{ color: "var(--muted)" }}>
                {count}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Названия категорий — перевод классификации источника; для сверхтяжёлых элементов источник помечает
          принадлежность как неизвестную или предсказанную.
        </p>
      </section>

      <footer className="space-y-1 text-xs" style={{ color: "var(--muted)" }}>
        <p>
          Источник данных: {primarySourceLabel()} · лицензия: {elementsMeta.license}
        </p>
        <ul className="space-y-1">
          {elementsMeta.sources.map((source) => (
            <li key={source.id}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-2 hover:text-[var(--primary)]"
              >
                {source.title}
              </a>{" "}
              — {source.license}
            </li>
          ))}
        </ul>
        <p>
          Сверка с PubChem: {elementsMeta.verification.symbolMatches}/{elementsMeta.elementCount} символов и номеров,
          массы в пределах {String(elementsMeta.verification.massTolerance).replace(".", ",")} а.е.м. —{" "}
          {elementsMeta.verification.massWithinTolerance}/{elementsMeta.elementCount} (расхождения у элементов без
          стабильных изотопов).
        </p>
        <p>
          <Link href="/chemistry" className="font-medium underline underline-offset-2 hover:text-[var(--primary)]">
            ← Вернуться в химический справочник
          </Link>
        </p>
      </footer>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedNumber(null);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="element-dialog-title"
            className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl sm:p-6"
            style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
          >
            <div className="flex items-start gap-4">
              <div
                className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-xl border"
                style={categoryCellStyle(selected.category)}
              >
                <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                  {selected.number}
                </span>
                <span className="text-2xl font-bold leading-none">{selected.symbol}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="element-dialog-title" className="text-xl font-bold">
                  {selected.name_ru}
                </h2>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {selected.name_en} · {categoryLabelRu(selected.category)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNumber(null)}
                aria-label="Закрыть карточку элемента"
                className="rounded-lg border p-2 transition hover:border-[var(--primary)]"
                style={{ borderColor: "var(--border)" }}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt style={{ color: "var(--muted)" }}>Атомная масса</dt>
                <dd className="font-medium tabular-nums">
                  {formatAtomicMass(selected.atomic_mass)} а.е.м.
                </dd>
              </div>
              <div>
                <dt style={{ color: "var(--muted)" }}>Группа / период</dt>
                <dd className="font-medium tabular-nums">
                  {selected.group} / {selected.period}
                </dd>
              </div>
              <div>
                <dt style={{ color: "var(--muted)" }}>Блок</dt>
                <dd className="font-medium">{blockLabelRu(selected.block)}</dd>
              </div>
              <div>
                <dt style={{ color: "var(--muted)" }}>Состояние (по источнику)</dt>
                <dd className="font-medium">{phaseLabelRu(selected.phase)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt style={{ color: "var(--muted)" }}>Электронная конфигурация</dt>
                <dd className="font-medium">
                  <span className="break-words">{selected.electron_configuration_semantic}</span>
                  <span className="mt-1 block break-words text-xs" style={{ color: "var(--muted)" }}>
                    {selected.electron_configuration}
                  </span>
                </dd>
              </div>
              {selected.discovered_by && (
                <div>
                  <dt style={{ color: "var(--muted)" }}>Открытие / первооткрыватель</dt>
                  <dd className="font-medium">{selected.discovered_by}</dd>
                </div>
              )}
              {selected.named_by && (
                <div>
                  <dt style={{ color: "var(--muted)" }}>Названо в честь</dt>
                  <dd className="font-medium">{selected.named_by}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <a
                href={selected.wikipedia}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:text-[var(--primary)]"
              >
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /> Wikipedia
              </a>
              <a
                href={`https://www.wikidata.org/wiki/${selected.wikidata}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:text-[var(--primary)]"
              >
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /> Wikidata {selected.wikidata}
              </a>
            </div>
            <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
              {primarySourceLabel()}. Русское название — метка Wikidata (CC0 1.0). Значения сохранены как в источнике,
              без пересчёта.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export default PeriodicTable;
