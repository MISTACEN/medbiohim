"use client";

import Link from "next/link";
import Image from "next/image";
import { FlaskConical, ListChecks, Search } from "lucide-react";

import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import type { TestsCatalogController } from "./useTestsCatalog";

/** В свёрнутой строке показываем текст без ```chem-блоков: их рендер тяжёлый. */
function stripChem(text: string): string {
  return String(text || "")
    .replace(/```chem[\s\S]*?```/gi, " ")
    .replace(/\[chem(?::|\s)[^\]]*\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
            {chemistryItems.map((item: any, index: number) => {
              const options: string[] = Array.isArray(item.options) ? item.options.map(String) : [];
              const correctIndexes = new Set<number>(
                Array.isArray(item.answer_indexes) && item.answer_indexes.length
                  ? item.answer_indexes.map(Number)
                  : item.answer_index != null
                    ? [Number(item.answer_index)]
                    : [],
              );
              const pairsLeft: Array<{ n: number; text: string }> = Array.isArray(item.pairs_left)
                ? item.pairs_left.map((p: any) => ({ n: Number(p?.n), text: String(p?.text || "") }))
                : [];
              const pairLetter = new Map<number, string>(
                (Array.isArray(item.answer_pairs) ? item.answer_pairs : []).map((p: any) => [Number(p?.n), String(p?.letter || "")]),
              );
              const media: any[] = Array.isArray(item.media) ? item.media : [];
              return (
              <details key={String(item.item_id)} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
                <summary className="cursor-pointer list-none px-3 py-3 sm:px-4">
                  <div className="flex gap-3">
                    <span className="min-w-7 text-xs font-semibold text-slate-400">{(chemistryPage - 1) * 12 + index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800">{stripChem(String(item.question || "")) || "Без текста"}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                        <span>{item.kind === "test_question" ? "Тест" : "Задание"}</span>
                        {item.theme && <span>· тема {String(item.theme)}</span>}
                        {item.topic && <span>· {String(item.topic)}</span>}
                        {options.length > 0 && <span>· вариантов: {options.length}</span>}
                        {item.formula_preserved && <span className="font-medium text-indigo-600">· формула сохранена</span>}
                        {item.answer_status === "prepared_from_text" && <span className="font-medium text-[var(--status-ok-fg)]">· ответ подготовлен</span>}
                      </div>
                    </div>
                  </div>
                </summary>
                <div className="space-y-3 border-t border-[var(--border)] bg-slate-50/60 px-3 py-3 sm:px-5">
                  <ChemRichText text={String(item.question || "")} className="space-y-2 text-sm text-slate-800" />

                  {options.length > 0 ? (
                    <ol className="space-y-1.5">
                      {options.map((option, optionIndex) => {
                        const isCorrect = correctIndexes.has(optionIndex + 1);
                        return (
                          <li
                            key={optionIndex}
                            className={
                              isCorrect
                                ? "flex gap-2 rounded-lg border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-2 py-1.5 text-sm"
                                : "flex gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm"
                            }
                          >
                            <span className="font-semibold text-slate-500">{optionIndex + 1}.</span>
                            <ChemRichText text={option} className="min-w-0 flex-1 space-y-1 text-sm text-slate-800" />
                          </li>
                        );
                      })}
                    </ol>
                  ) : null}

                  {pairsLeft.length > 0 ? (
                    <div className="space-y-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Соответствие</div>
                      {pairsLeft.map((pair) => (
                        <div key={pair.n} className="flex items-baseline gap-2">
                          <span className="font-semibold text-slate-500">{pair.n})</span>
                          <ChemRichText text={pair.text} className="space-y-1 text-sm text-slate-800" />
                          {pairLetter.get(pair.n) ? <span className="ml-auto font-semibold text-[var(--status-ok-fg)]">{pairLetter.get(pair.n)}</span> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {item.options_on_figure ? (
                    <p className="rounded-lg border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-3 py-2 text-xs font-semibold text-[var(--status-warn-fg)]">
                      Варианты ответа в этом задании — структурные формулы на рисунке ниже.
                    </p>
                  ) : null}

                  {media.map((asset, assetIndex) =>
                    asset?.url ? (
                      <figure key={assetIndex} className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
                        <Image
                          src={String(asset.url)}
                          alt={String(asset.alt || "Рисунок к заданию")}
                          width={Number(asset.width) || 1000}
                          height={Number(asset.height) || 700}
                          className="h-auto w-full"
                          sizes="(max-width: 768px) 100vw, 720px"
                        />
                        {asset.label ? <figcaption className="border-t px-3 py-1.5 text-xs text-[var(--muted)]">{String(asset.label)}</figcaption> : null}
                      </figure>
                    ) : null,
                  )}

                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Ответ</div>
                    {item.answer ? (
                      <ChemRichText text={String(item.answer)} className="mt-1 space-y-2 text-sm text-slate-700" />
                    ) : (
                      <p className="mt-1 text-sm text-[var(--status-warn-fg)]">Ответ ещё не подготовлен. Исходная формулировка сохранена.</p>
                    )}
                  </div>

                  {item.chemistry_note ? (
                    <p className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs text-slate-600">
                      {String(item.chemistry_note)}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                    {item.source && <span className="rounded-full border bg-white px-2 py-1">Источник: {String(item.source)}</span>}
                    {item.source_number && <span className="rounded-full border bg-white px-2 py-1">№ {String(item.source_number)}</span>}
                    {item.answer_status && <span className="rounded-full border bg-white px-2 py-1">{String(item.answer_status)}</span>}
                  </div>
                </div>
              </details>
              );
            })}
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
