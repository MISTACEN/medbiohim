"use client";

import {
  Loader2,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { KINDS, type SubjectOption } from "./model";

export type PracticeFiltersProps = {
  subjects: SubjectOption[];
  subjectsLoading: boolean;
  subjectId: string;
  subjectSlug: string;
  subjectCounts: Record<string, number>;
  allQuestionsTotal: number | null;
  subjectTotal: number;
  kind: string;
  query: string;
  hasFilters: boolean;
  activeSubjectLabel: string;
  activeKind: { value: string; label: string };
  debouncedQuery: string;
  onSelectSubject: (subject: SubjectOption | null) => void;
  onKind: (value: string) => void;
  onQuery: (value: string) => void;
  onReset: () => void;
};

/** Полоса фильтров базы вопросов: предмет, тип вопроса, поиск и активные условия. */
export function PracticeFilters({
  subjects,
  subjectsLoading,
  subjectId,
  subjectSlug,
  subjectCounts,
  allQuestionsTotal,
  subjectTotal,
  kind,
  query,
  hasFilters,
  activeSubjectLabel,
  activeKind,
  debouncedQuery,
  onSelectSubject,
  onKind,
  onQuery,
  onReset,
}: PracticeFiltersProps) {
  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap gap-2" aria-label="Предмет">
        <button
          type="button"
          onClick={() => onSelectSubject(null)}
          className={
            "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition " +
            (!subjectId && !subjectSlug
              ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
              : "border-[var(--border)] bg-[var(--card)] text-slate-700 hover:border-indigo-300")
          }
        >
          Все предметы
          {(allQuestionsTotal ?? subjectTotal) > 0 && (
            <span className={"rounded-full px-2 py-0.5 text-xs " + (!subjectId && !subjectSlug ? "bg-white/20" : "bg-slate-100 text-slate-600")}>
              {allQuestionsTotal ?? subjectTotal}
            </span>
          )}
        </button>
        {subjectsLoading ? (
          <span className="inline-flex min-h-10 items-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Загружаю предметы…
          </span>
        ) : (
          subjects.map((subject) => {
            const count = subjectCounts[subject.id || subject.slug];
            const active = subjectId ? subject.id === subjectId : Boolean(subjectSlug && subject.slug === subjectSlug);
            return (
              <button
                key={subject.id || subject.slug}
                type="button"
                onClick={() => onSelectSubject(subject)}
                className={
                  "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition " +
                  (active
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                    : "border-[var(--border)] bg-[var(--card)] text-slate-700 hover:border-indigo-300")
                }
              >
                {subject.label}
                {typeof count === "number" && (
                  <span className={"rounded-full px-2 py-0.5 text-xs " + (active ? "bg-white/20" : "bg-slate-100 text-slate-600")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 md:flex-wrap" aria-label="Тип вопроса">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          {KINDS.map((item) => (
            <button
              key={item.value || "all"}
              type="button"
              onClick={() => onKind(item.value)}
              className={
                "shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition sm:text-sm " +
                (kind === item.value
                  ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                  : "border-[var(--border)] bg-[var(--card)] text-slate-600 hover:border-indigo-300")
              }
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="relative block w-full lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Найти вопрос по тексту…"
            className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-400"
          />
        </label>
      </div>

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3 text-xs text-slate-500">
          <span>
            Показано: <b className="text-slate-700">{activeSubjectLabel}</b>
            {kind ? ` · ${activeKind.label}` : ""}
            {debouncedQuery ? ` · «${debouncedQuery}»` : ""}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 font-semibold text-slate-700 hover:border-indigo-300"
          >
            Сбросить
          </button>
        </div>
      )}
    </section>
  );
}
