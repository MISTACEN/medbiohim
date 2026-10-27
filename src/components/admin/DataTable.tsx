"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";

export type DataTableColumn<T> = {
  /** Уникальный ключ колонки — он же ключ сортировки. */
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Сортировка доступна только там, где есть по чему сравнивать. */
  sortValue?: (row: T) => string | number;
  className?: string;
  /** Выравнивание колонки действий. */
  align?: "left" | "right";
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

type Props<T> = {
  rows: T[];
  columns: Array<DataTableColumn<T>>;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  empty?: ReactNode;
  /** Клиентский быстрый поиск: возвращает строку, по которой ищем. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** Дополнительные фильтры (селекты) рядом с поиском. */
  filters?: ReactNode;
  pageSize?: number;
  initialSort?: { key: string; dir: "asc" | "desc" };
  caption?: string;
};

const SKELETON_ROWS = 6;

/**
 * Одна таблица для контент-разделов админки: поиск, сортировка, постраничность,
 * скелетоны, пустое и ошибочное состояние. Нужна потому, что разделы рисовали
 * по 1000 строк без <thead> и без возможности дойти до нужной записи.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  error = "",
  onRetry,
  empty,
  searchText,
  searchPlaceholder = "Поиск…",
  filters,
  pageSize = 25,
  initialSort,
  caption,
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortState>(initialSort ?? null);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text || !searchText) return rows;
    return rows.filter((row) => searchText(row).toLowerCase().includes(text));
  }, [rows, query, searchText]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns.find((item) => item.key === sort.key);
    if (!column?.sortValue) return filtered;
    const get = column.sortValue;
    return [...filtered].sort((a, b) => {
      const left = get(a);
      const right = get(b);
      const result = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "ru");
      return sort.dir === "asc" ? result : -result;
    });
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));

  // Новая выборка или поиск всегда начинают с первой страницы, иначе пользователь
  // остаётся на «странице 4» пустого результата.
  useEffect(() => { setPage(0); }, [query, rows, pageSize]);
  useEffect(() => { if (page > pageCount - 1) setPage(pageCount - 1); }, [page, pageCount]);

  const start = page * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  function toggleSort(key: string) {
    const column = columns.find((item) => item.key === key);
    if (!column?.sortValue) return;
    setSort((current) => {
      if (current?.key !== key) return { key, dir: "asc" };
      return current.dir === "asc" ? { key, dir: "desc" } : null;
    });
  }

  return (
    <div className="space-y-3">
      {(searchText || filters) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchText && (
            <label className="relative min-w-56 flex-1">
              <span className="sr-only">{searchPlaceholder}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm"
              />
            </label>
          )}
          {filters}
          {searchText && query && (
            <button type="button" className="btn-secondary text-xs" onClick={() => setQuery("")}>
              Сбросить поиск
            </button>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span className="min-w-0 flex-1">{error}</span>
          {onRetry && (
            <button type="button" className="btn-secondary text-xs" onClick={onRetry}>
              Повторить
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[640px] text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-[var(--border)] bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={`px-3 py-2 font-semibold ${column.align === "right" ? "text-right" : ""} ${column.className || ""}`}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={`inline-flex items-center gap-1 uppercase tracking-wide ${active ? "text-indigo-700" : "hover:text-slate-700"}`}
                      >
                        {column.header}
                        {active && (sort?.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    ) : column.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && visible.length === 0 && Array.from({ length: SKELETON_ROWS }).map((_, index) => (
              <tr key={`skeleton-${index}`} className="border-b border-[var(--border)] last:border-0">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-3">
                    <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                  </td>
                ))}
              </tr>
            ))}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-sm text-slate-500">
                  {query && searchText ? `${empty || "Ничего не найдено"} — по запросу «${query}» пусто.` : empty || "Записей нет."}
                </td>
              </tr>
            )}
            {visible.map((row) => (
              <tr key={rowKey(row)} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50/60">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-3 py-2 align-top ${column.align === "right" ? "text-right" : ""} ${column.className || ""}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {sorted.length === 0 ? "0 записей" : `${start + 1}–${Math.min(start + visible.length, sorted.length)} из ${sorted.length}`}
          {query && searchText && sorted.length !== rows.length ? ` · всего в базе ${rows.length}` : ""}
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1 text-xs"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(current - 1, 0))}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Назад
            </button>
            <span className="tabular-nums">{page + 1} / {pageCount}</span>
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1 text-xs"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((current) => Math.min(current + 1, pageCount - 1))}
            >
              Вперёд <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
