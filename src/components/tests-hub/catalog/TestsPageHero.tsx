"use client";

/**
 * Шапка раздела «Тесты»: вместо прежнего дублирующего заголовка в TestsHub —
 * один экран с понятной иерархией. Слева — зачем этот раздел и что нового,
 * справа — быстрые переходы в соседние инструменты (база вопросов, атлас,
 * тренажёры), чтобы не искать их в меню.
 */
import Link from "next/link";
import { ClipboardCheck, FlaskConical, History, Microscope, Sparkles } from "lucide-react";

import type { TestsCatalogController } from "./useTestsCatalog";

const QUICK_LINKS = [
  { href: "/practice", label: "База вопросов", hint: "вопросы и эталоны без таймера", Icon: Sparkles },
  { href: "/atlas", label: "Атлас препаратов", hint: "фото и электронограммы", Icon: Microscope },
  { href: "/subjects/histology?tab=trainers", label: "Тренажёры", hint: "практика по предмету", Icon: ClipboardCheck },
];

export function TestsPageHero({ page }: { page: TestsCatalogController }) {
  const { selectView, chemistryTotal, attempts } = page;
  const finished = attempts.filter((attempt: { status?: string }) =>
    /complet|finish|graded/.test(String(attempt.status || "").toLowerCase()),
  ).length;

  return (
    <header className="overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 shadow-sm">
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600">Раздел тестов</p>
          <h1 className="mt-1.5 text-2xl font-extrabold leading-tight text-slate-950 sm:text-3xl">
            Тесты, банки вопросов и разбор
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Предмет → раздел → тема → банк. Режим выбирается один раз для всех банков, а во время прохождения
            можно спросить ИИ, что спрашивают в вопросе, — он объяснит термины и не выдаст правильный вариант.
          </p>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
              <ClipboardCheck className="h-3.5 w-3.5 text-indigo-600" />
              Попыток: {attempts.length}
            </span>
            {finished > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
                <History className="h-3.5 w-3.5 text-emerald-600" />
                Завершено: {finished}
              </span>
            )}
            {chemistryTotal > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm">
                <FlaskConical className="h-3.5 w-3.5 text-sky-600" />
                Заданий по химии: {chemistryTotal}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 font-semibold text-amber-900">
              Вопросы с несколькими ответами помечены
            </span>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          {QUICK_LINKS.map(({ href, label, hint, Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-2.5 rounded-2xl border border-white bg-white/80 px-3 py-2.5 text-left transition hover:border-indigo-200 hover:bg-white"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold leading-tight text-slate-900">{label}</span>
                <span className="block truncate text-[11px] text-[var(--muted)]">{hint}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-indigo-100 bg-white/60 px-5 py-3 text-xs text-slate-600 sm:px-6">
        <span className="font-semibold text-slate-800">Начать быстро:</span>
        <button type="button" onClick={() => selectView("tests")} className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 font-semibold text-indigo-700 transition hover:bg-indigo-50">
          Все банки
        </button>
        <button type="button" onClick={() => selectView("chemistry")} className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:border-indigo-300">
          Химия
        </button>
        <button type="button" onClick={() => selectView("history")} className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:border-indigo-300">
          История попыток
        </button>
      </div>
    </header>
  );
}

export default TestsPageHero;
