"use client";

/**
 * Строка банка в списке тестов.
 *
 * Раньше каждый банк был карточкой с двумя кнопками, бейджем режима и
 * выбранным количеством вопросов — на 138 банков это давало простыню, в
 * которой терялось название. Здесь только то, что помогает выбрать:
 * название, объём, тема и одно действие. Режим и количество выбираются
 * на экране запуска.
 */
import Link from "next/link";
import { BookOpenCheck, ChevronRight, Clock, Repeat } from "lucide-react";

import { preparationHref, type TestItem } from "@/components/tests/tests-hub-model";

export function BankRow({
  test,
  aliases = [],
  highlight = false,
  showSubject = false,
}: {
  test: TestItem;
  aliases?: string[];
  highlight?: boolean;
  showSubject?: boolean;
}) {
  return (
    <article
      data-test-card={test.id}
      className={
        "group flex items-center gap-3 border-b border-[var(--border)] px-3 py-2.5 transition last:border-b-0 sm:px-4 " +
        (highlight ? "bg-indigo-50/70 ring-2 ring-inset ring-indigo-300" : "hover:bg-slate-50")
      }
    >
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-bold leading-snug text-slate-900">
          {test.title}
        </h3>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--muted)]">
          <span className="font-semibold text-slate-600">
            {test.questionCount} вопр.
          </span>
          {test.timeLimitSec != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {Math.round(test.timeLimitSec / 60)} мин
            </span>
          )}
          {test.maxAttempts != null && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3.5 w-3.5" />
              до {test.maxAttempts}
            </span>
          )}
          {showSubject && test.subjectName && (
            <span className="truncate">{test.subjectName}</span>
          )}
        </div>
        {aliases.length > 0 && (
          <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
            тот же банк: {aliases.join(" · ")}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href={preparationHref(test)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-indigo-700"
        >
          Открыть
          <ChevronRight className="h-4 w-4" />
        </Link>
        <Link
          href={
            `/tests/bank/${encodeURIComponent(test.id)}`
          }
          className="hidden min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 sm:inline-flex"
          title="Посмотреть вопросы банка без запуска"
        >
          <BookOpenCheck className="h-4 w-4" />
          Вопросы
        </Link>
      </div>
    </article>
  );
}
