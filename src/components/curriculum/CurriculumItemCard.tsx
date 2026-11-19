"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";

import { hours, subjectName, subjectSlug, typeLabels, type CurriculumItem } from "./model";
import type { CurriculumDataView } from "./useCurriculumData";

/** Карточка пункта учебного плана: часы, предмет и отметка о прохождении. */
export function CurriculumItemCard({ data, item }: { data: CurriculumDataView; item: CurriculumItem }) {
  const h = hours(item);
  const status = data.stateByItem.get(item.id);
  const subject = subjectName(item);
  const slug = subjectSlug(item);
  const done = status?.learning_status === "completed" || status?.academic_status === "passed";
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{typeLabels[String(item.item_type || "other")] || item.item_type || "Пункт"}</span>
            {item.course_number ? <span>{item.course_number} курс</span> : null}
            {item.semester ? <span>{item.semester} сем.</span> : null}
            {item.planned_date ? <span>{item.planned_date}</span> : null}
            {item.is_required ? <span className="text-[var(--status-warn-fg)]">обязательно</span> : null}
          </div>
          <h2 className="mt-2 text-base font-semibold text-slate-900 sm:text-lg">{item.title || "Без названия"}</h2>
          {subject ? (
            <p className="mt-1 text-sm text-slate-600">
              {slug ? <Link href={`/subjects/${slug}`} className="text-indigo-600 hover:underline">{subject}</Link> : subject}
            </p>
          ) : null}
          {item.description ? <p className="mt-2 text-sm text-slate-500 line-clamp-3">{item.description}</p> : null}
          {(h.total > 0 || h.lecture > 0 || h.practice > 0) ? (
            <p className="mt-2 text-xs text-slate-500">Часы: лекц. {h.lecture} · практ. {h.practice} · всего {h.total}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-40">
          <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
            {done ? <CheckCircle2 className="h-4 w-4 text-[var(--status-ok-fg)]" /> : <Circle className="h-4 w-4 text-slate-400" />}
            {done ? "Пройдено" : "Не отмечено"}
          </div>
          <button
            type="button"
            disabled={data.savingId === item.id || done}
            onClick={() => void data.markDone(item)}
            className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {data.savingId === item.id ? "Сохранение…" : done ? "Готово" : "Отметить"}
          </button>
        </div>
      </div>
    </article>
  );
}
