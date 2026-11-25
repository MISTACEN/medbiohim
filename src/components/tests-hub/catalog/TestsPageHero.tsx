"use client";

/**
 * Шапка раздела «Тесты». На телефоне она занимала весь первый экран: длинный
 * текст, столбик карточек-ссылок и ряд кнопок. Теперь компактно: заголовок,
 * одна строка пояснения, чипы статистики и три иконки-перехода; на широком
 * экране — то же плюс описания ссылок справа.
 */
import Link from "next/link";
import { ClipboardCheck, FlaskConical, History, Microscope, Sparkles } from "lucide-react";

import type { TestsCatalogController } from "./useTestsCatalog";

const QUICK_LINKS = [
  { href: "/tests?view=questions", label: "База вопросов", hint: "вопросы и эталоны", Icon: Sparkles },
  { href: "/atlas", label: "Атлас", hint: "фото препаратов", Icon: Microscope },
  { href: "/subjects/histology?tab=trainers", label: "Тренажёры", hint: "практика", Icon: ClipboardCheck },
];

export function TestsPageHero({ page }: { page: TestsCatalogController }) {
  const { chemistryTotal, attempts } = page;
  const finished = attempts.filter((attempt: { status?: string }) =>
    /complet|finish|graded/.test(String(attempt.status || "").toLowerCase()),
  ).length;

  return (
    <header className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 shadow-sm sm:rounded-3xl">
      <div className="grid gap-3 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_250px] lg:gap-5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600 sm:text-[11px]">Раздел тестов</p>
          <h1 className="mt-1 text-xl font-extrabold leading-tight text-slate-950 sm:text-3xl">
            Тесты и банки вопросов
          </h1>
          <p className="mt-1.5 text-[13px] leading-5 text-slate-600 sm:mt-2 sm:text-sm sm:leading-6">
            Предмет → раздел → тема → банк. Во время теста можно спросить ИИ, что спрашивают
            в вопросе — он объяснит термины и не выдаст ответ.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] sm:mt-4 sm:gap-2 sm:text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 shadow-sm sm:px-3 sm:py-1.5">
              <ClipboardCheck className="h-3.5 w-3.5 text-indigo-600" />
              Попыток: {attempts.length}
            </span>
            {finished > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 shadow-sm sm:px-3 sm:py-1.5">
                <History className="h-3.5 w-3.5 text-[var(--status-ok-fg)]" />
                Завершено: {finished}
              </span>
            )}
            {chemistryTotal > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 shadow-sm sm:px-3 sm:py-1.5">
                <FlaskConical className="h-3.5 w-3.5 text-sky-600" />
                Химия: {chemistryTotal}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--status-warn-bg)] px-2.5 py-1 font-semibold text-[var(--status-warn-fg)] sm:px-3 sm:py-1.5">
              несколько ответов помечены
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          {QUICK_LINKS.map(({ href, label, hint, Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col items-start gap-1 rounded-xl border border-white bg-white/80 p-2.5 transition hover:border-indigo-200 hover:bg-white lg:flex-row lg:items-center lg:gap-2.5 lg:p-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 lg:h-8 lg:w-8">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-bold leading-tight text-slate-900 lg:text-[13px]">{label}</span>
                <span className="hidden truncate text-[11px] text-[var(--muted)] lg:block">{hint}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

export default TestsPageHero;
