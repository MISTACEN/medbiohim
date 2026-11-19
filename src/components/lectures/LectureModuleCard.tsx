"use client";

/** Карточка модуля лекций: заголовок, прогресс и подмодули с занятиями. */
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { type LectureListRow } from "@/components/lectures/model";

/** Строка занятия: общая для всех подмодулей, чтобы прогресс считался одинаково. */
export function LectureTaskRow({ row, index }: { row: LectureListRow; index: number }) {
  const { lesson, total, solved } = row;
  const done = total > 0 && solved >= total;
  return (
    <li key={lesson.id}>
      <Link
        href={`/lectures/${encodeURIComponent(lesson.id)}`}
        className="group flex items-start gap-3 rounded-xl border-l-[3px] border-transparent px-3 py-2 transition hover:border-[var(--primary)] hover:bg-slate-50"
      >
        <span className="mt-0.5 w-5 shrink-0 text-xs font-bold text-[var(--muted)]">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-semibold leading-snug group-hover:text-[var(--primary)]">{lesson.title}</span>
          {lesson.summary && (
            <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--muted)]">{lesson.summary}</span>
          )}
          <span className="mt-1 flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-[var(--muted)]">
            {total > 0 ? (
              <>
                {done ? <CheckCircle2 className="size-3 shrink-0 text-[var(--status-ok-fg)]" /> : null}
                Решено задач: {solved} из {total}
              </>
            ) : (
              "Конспект"
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function LectureModuleCard({ mod }: {
  mod: {
    title: string;
    submodules: Array<{ title: string; subtitle?: string; rows: LectureListRow[]; tasks: number; solved: number }>;
    count: number;
    tasks: number;
    solved: number;
  };
}) {
  const percent = mod.tasks > 0 ? Math.round((mod.solved / mod.tasks) * 100) : 0;
  return (
    <section key={mod.title} className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">Модуль</div>
          <h2 className="mt-0.5 break-words text-base font-extrabold leading-snug sm:text-lg">{mod.title}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {mod.count} занятий · {mod.submodules.length}{" "}
            {mod.submodules.length === 1 ? "подмодуль" : "подмодуля"} ·{" "}
            {mod.tasks > 0 ? `Решено задач: ${mod.solved} из ${mod.tasks}` : "только конспекты"}
          </p>
        </div>
        {mod.tasks > 0 && (
          <div className="w-full sm:w-[180px]">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
              <span>Прогресс</span>
              <span>{percent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}
      </div>

      {mod.submodules.map((group) => (
        <div
          key={group.title}
          className="mt-4 border-t border-[var(--border)] pt-3 first:border-0 first:pt-0"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold">{group.title}</h3>
            <span className="text-[11px] font-semibold text-[var(--muted)]">
              {group.rows.length} занятий
              {group.tasks > 0 ? ` · решено ${group.solved} из ${group.tasks}` : ""}
            </span>
          </div>
          {group.subtitle && (
            <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{group.subtitle}</p>
          )}
          <ol className="mt-2 space-y-1">{group.rows.map((row, index) => <LectureTaskRow key={row.lesson.id} row={row} index={index} />)}</ol>
        </div>
      ))}
    </section>
  );
}
