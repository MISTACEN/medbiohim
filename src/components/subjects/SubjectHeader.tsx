"use client";

/**
 * Шапка предмета: возврат к каталогу, название и нагрузка, зачётка, верхняя
 * навигация разделов и чипсы подразделов.
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { GROUP_DEFAULT, semester } from "@/components/subjects/tabs-config";
import type { SubjectController } from "@/components/subjects/useSubjectPage";

export function SubjectHeader({ page }: { page: SubjectController }) {
  const { subject, course, sem, gradebook, nav, subnav, group, tab, selectTab } = page;

  return (
    <>
      <Link href="/subjects" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ChevronLeft className="h-4 w-4" />К предметам
      </Link>

      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Предмет · Курс · Семестр</p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{subject?.name}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {course} курс · {semester(sem)} · {sem}
          {subject?.control_type
            ? " · " +
              (subject.control_type === "exam" ? "Экзамен" : subject.control_type === "credit" ? "Зачёт" : subject.control_type)
            : ""}
        </p>
      </header>

      <section className="card border-indigo-100 bg-indigo-50/40 p-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <b>Учебная нагрузка:</b>
          {subject?.total_hours != null && <span>{subject.total_hours} ч</span>}
          {subject?.credits != null && <span>· {subject.credits} з.е.</span>}
        </div>
        {gradebook.length > 0 && (
          <div className="mt-2 text-sm text-slate-600">
            <b>Для зачётки:</b>{" "}
            {gradebook.map((g: any, i: number) => (
              <span key={i}>
                {i ? " · " : ""}
                {g.display_name}
                {g.hours != null ? " (" + g.hours + (g.credits != null ? "/" + g.credits : " ч") + ")" : ""}
              </span>
            ))}
          </div>
        )}
      </section>

      <nav className="mobile-scroll-x flex flex-nowrap gap-2 overflow-x-auto pb-1 md:flex-wrap" role="tablist" aria-label="Разделы предмета">
        {nav.map(({ id, label, Icon }) => {
          const active = group === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(GROUP_DEFAULT[id])}
              className={
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                (active
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </nav>

      {subnav.length > 1 && (
        // Чипсы режимов на мобильных прокручиваются горизонтально, а не ломают строку.
        <nav className="mobile-scroll-x flex flex-nowrap gap-1.5 overflow-x-auto pb-1 md:flex-wrap" aria-label="Режимы раздела">
          {subnav.map(({ id, label }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => selectTab(id)}
                className={
                  "min-h-8 shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition " +
                  (active ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700")
                }
              >
                {label}
              </button>
            );
          })}
        </nav>
      )}
    </>
  );
}
