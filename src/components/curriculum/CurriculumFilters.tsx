"use client";

import { ChevronDown, Search } from "lucide-react";

import { typeLabels } from "./model";
import type { CurriculumDataView } from "./useCurriculumData";

/** Фильтры плана: поиск по названию, курс, семестр и тип пункта. */
export function CurriculumFilters({ data }: { data: CurriculumDataView }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="relative md:col-span-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={data.query} onChange={(e) => data.setQuery(e.target.value)} placeholder="Поиск по названию" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" /></label>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><span className="shrink-0 text-xs text-slate-500">Курс</span><select value={data.course} onChange={(e) => { data.setCourse(e.target.value); data.setSemester("all"); }} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"><option value="all">Все курсы</option>{data.courses.map((n) => <option key={n} value={String(n)}>{n} курс</option>)}</select><ChevronDown className="h-4 w-4 text-slate-400" /></label>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><span className="shrink-0 text-xs text-slate-500">Семестр</span><select value={data.semester} onChange={(e) => data.setSemester(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"><option value="all">Все семестры</option>{data.semesters.map((n) => <option key={n} value={String(n)}>{n} семестр</option>)}</select></label>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><span className="shrink-0 text-xs text-slate-500">Тип</span><select value={data.kind} onChange={(e) => data.setKind(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"><option value="all">Все типы</option>{data.kinds.map((k) => <option key={k} value={k}>{typeLabels[k] || k}</option>)}</select></label>
      </div>
    </section>
  );
}
