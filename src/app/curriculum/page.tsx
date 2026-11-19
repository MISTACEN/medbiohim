"use client";

/**
 * Учебный план: лекции, практики, зачёты и экзамены по курсам и семестрам
 * с отметками о прохождении. Состояние — в useCurriculumData, фильтры —
 * в CurriculumFilters, карточка пункта — в CurriculumItemCard.
 */
import { BookOpen, Loader2, RefreshCw, TriangleAlert } from "lucide-react";

import { useCurriculumData } from "@/components/curriculum/useCurriculumData";
import { CurriculumFilters } from "@/components/curriculum/CurriculumFilters";
import { CurriculumItemCard } from "@/components/curriculum/CurriculumItemCard";

export default function CurriculumPage() {
  const data = useCurriculumData();

  if (data.loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-5xl items-center justify-center px-4">
        <div className="flex items-center gap-3 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /><span>Загрузка учебного плана…</span></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-600">Учёба</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Учебный план</h1>
          <p className="mt-1 text-sm text-slate-500">Лекции, практики, зачёты и экзамены по курсам и семестрам. Отмечайте пройденное.</p>
        </div>
        <button type="button" onClick={() => void data.load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Обновить
        </button>
      </header>

      {data.error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-4 text-sm text-[var(--status-warn-fg)]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{data.error}</span>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Всего пунктов</p><p className="mt-1 text-2xl font-semibold text-slate-900">{data.totals.total}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Пройдено</p><p className="mt-1 text-2xl font-semibold text-[var(--status-ok-fg)]">{data.totals.completed}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Осталось</p><p className="mt-1 text-2xl font-semibold text-indigo-700">{data.totals.remaining}</p></div>
      </section>

      <CurriculumFilters data={data} />

      {data.visible.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-3 font-semibold text-slate-800">По выбранным фильтрам ничего нет</h2>
          <p className="mt-1 text-sm text-slate-500">Снимите фильтры или измените поисковый запрос.</p>
        </section>
      ) : (
        <section className="space-y-3">
          {data.visible.map((item) => (
            <CurriculumItemCard key={item.id} data={data} item={item} />
          ))}
        </section>
      )}
    </div>
  );
}
