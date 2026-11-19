"use client";

/** Фильтры каталога: поиск по названию, курс и семестр. */
import { Search } from "lucide-react";
import type { CatalogPageState } from "@/components/subjects/catalog/useCatalogPage";

export function CatalogFilters({ page }: { page: CatalogPageState }) {
  const { q, setQ, course, setCourse, semester, setSemester, sems } = page;

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Найти предмет — например, «физ» или «химия»"
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] py-3.5 pl-10 pr-4 text-sm shadow-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
        />
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[160px] flex-1">
          <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Курс</span>
          <select value={course} onChange={(e) => setCourse(e.target.value ? Number(e.target.value) : "")} className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
            <option value="">Все</option>
            {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>{c} курс</option>)}
          </select>
        </label>
        <label className="min-w-[160px] flex-1">
          <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Семестр</span>
          <select value={semester} onChange={(e) => setSemester(e.target.value ? Number(e.target.value) : "")} className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
            <option value="">Все</option>
            {sems.map((s) => <option key={s} value={s}>{s} семестр</option>)}
          </select>
        </label>
      </div>
    </>
  );
}
