"use client";

import Link from "next/link";
import { FlaskConical, ListChecks, Search } from "lucide-react";

import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import type { TestsCatalogController } from "./useTestsCatalog";

/** Вкладка «Химия»: отдельный банк заданий с фильтрами, ответами и пагинацией. */
export function ChemistryBank({ page }: { page: TestsCatalogController }) {
  const {
    chemistryQuery, setChemistryQuery, setChemistryPage,
    chemistryKind, setChemistryKind,
    chemistryFormula, setChemistryFormula,
    chemistryError, chemistryLoading, chemistryItems, chemistryTotal, chemistryPages, chemistryPage,
  } = page;

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-[var(--status-ok-border)] bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]">
              <FlaskConical className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--status-ok-fg)]">Отдельный банк</p>
              <h2 className="mt-1 text-2xl font-extrabold text-slate-950 sm:text-3xl">Задания по химии</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                Открытые задания и тестовые вопросы из методических источников. Формулы и эталоны не подменяются догадками.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
              {chemistryTotal} найдено
            </span>
            {/* H6: банк из методичек дополняется процедурными задачами —
                из того же раздела можно собрать вариант по seed. */}
            <Link
              href="/chemistry/practice"
              className="inline-flex items-center gap-1 rounded-full bg-[var(--status-ok-fg)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--status-ok-fg)]"
            >
              <ListChecks className="h-3.5 w-3.5" /> Генератор вариантов
            </Link>
          </div>
        </div>
      </header>

      <div className="card space-y-4 p-4 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={chemistryQuery}
              onChange={(event) => { setChemistryQuery(event.target.value); setChemistryPage(1); }}
              placeholder="Поиск по вопросу или теме…"
              className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--status-ok-border)]"
            />
          </div>
          <select
            value={chemistryKind}
            onChange={(event) => { setChemistryKind(event.target.value); setChemistryPage(1); }}
            className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
          >
            <option value="">Все типы</option>
            <option value="open_task">Открытые задания</option>
            <option value="test_question">Тестовые вопросы</option>
          </select>
          <select
            value={chemistryFormula}
            onChange={(event) => { setChemistryFormula(event.target.value); setChemistryPage(1); }}
            className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
          >
            <option value="">Формулы: все</option>
            <option value="true">Формулы сохранены</option>
            <option value="false">Без формулы</option>
          </select>
        </div>

        {chemistryError && (
          <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">{chemistryError}</div>
        )}

        {chemistryLoading ? (
          <SkeletonList count={3} />
        ) : chemistryItems.length === 0 ? (
          <EmptyState
            compact
            icon={Search}
            title="По заданным фильтрам ничего не найдено"
            description="Смягчите фильтры по типу и формуле или измените поисковый запрос — банк по химии большой."
          />
        ) : (
          <div className="space-y-2">
            {chemistryItems.map((item: any, index: number) => (
              <details key={String(item.item_id)} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
                <summary className="cursor-pointer list-none px-3 py-3 sm:px-4">
                  <div className="flex gap-3">
                    <span className="min-w-7 text-xs font-semibold text-slate-400">{(chemistryPage - 1) * 12 + index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800">{String(item.question || "Без текста")}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                        <span>{item.kind === "test_question" ? "Тест" : "Задание"}</span>
                        {item.topic && <span>· {String(item.topic)}</span>}
                        {item.formula_preserved && <span className="font-medium text-indigo-600">· формула сохранена</span>}
                        {item.answer_status === "prepared_from_text" && <span className="font-medium text-[var(--status-ok-fg)]">· ответ подготовлен</span>}
                      </div>
                    </div>
                  </div>
                </summary>
                <div className="border-t border-[var(--border)] bg-slate-50/60 px-3 py-3 sm:px-5">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Ответ</div>
                  {item.answer ? (
                    <ChemRichText text={String(item.answer)} className="mt-2 space-y-2 text-sm text-slate-700" />
                  ) : (
                    <p className="mt-2 text-sm text-[var(--status-warn-fg)]">Ответ ещё не подготовлен. Исходная формулировка сохранена.</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                    {item.source && <span className="rounded-full border bg-white px-2 py-1">Источник: {String(item.source)}</span>}
                    {item.source_number && <span className="rounded-full border bg-white px-2 py-1">№ {String(item.source_number)}</span>}
                    {item.answer_status && <span className="rounded-full border bg-white px-2 py-1">{String(item.answer_status)}</span>}
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            disabled={chemistryPage <= 1 || chemistryLoading}
            onClick={() => setChemistryPage((page) => Math.max(1, page - 1))}
            className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
          >
            ← Назад
          </button>
          <span className="text-xs text-[var(--muted)]">Страница {chemistryPage} из {chemistryPages}</span>
          <button
            type="button"
            disabled={chemistryPage >= chemistryPages || chemistryLoading}
            onClick={() => setChemistryPage((page) => Math.min(chemistryPages, page + 1))}
            className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
          >
            Вперёд →
          </button>
        </div>
      </div>
    </section>
  );
}
