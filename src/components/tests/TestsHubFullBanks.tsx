"use client";

/**
 * «Полные тесты» каталога: мега-микс по всем методичкам и разворачиваемый
 * список полных банков с разделами. Вынесено из TestsHub: страница каталога
 * упиралась в архитектурный лимит компонента (600 строк).
 */
import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import { BookOpenCheck, Play } from "lucide-react";

import {
  buildBankHref,
  buildHref,
  buildRangeHref,
  plural,
  type ManualSection,
  type Mode,
  type TestItem,
} from "./tests-hub-model";

export function TestsHubFullBanks({
  fullTests,
  fullMega,
  fullManuals,
  manualSections,
  subTests,
  tests,
  showFullBanks,
  setShowFullBanks,
  mode,
  count,
  selectedModeLabel,
}: {
  fullTests: TestItem[];
  fullMega: TestItem | null;
  fullManuals: TestItem[];
  manualSections: Record<string, ManualSection[]>;
  subTests: Map<string, string>;
  tests: TestItem[];
  showFullBanks: boolean;
  setShowFullBanks: Dispatch<SetStateAction<boolean>>;
  mode: Mode;
  count: number;
  selectedModeLabel: string;
}) {
  return (
    <>
          {fullTests.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-indigo-50/40 shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">Полные тесты</div>
                  <h2 className="mt-0.5 text-base font-extrabold text-slate-950">Все вопросы методичек одним заходом</h2>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">{selectedModeLabel}</span>
              </header>
              <div className="space-y-2 px-3 pb-3 sm:px-4 sm:pb-4">
                {fullMega && (
                  <article className="flex flex-col gap-3 rounded-xl border border-indigo-300 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-extrabold leading-snug text-slate-900">🏋️ Все тесты физиологии · мега-микс</h3>
                      <p className="mt-1 text-xs text-[var(--muted)]">{fullMega.questionCount} {plural(fullMega.questionCount, "вопрос", "вопроса", "вопросов")} из всех методичек</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link href={buildHref(fullMega, mode, count)} className="btn-primary inline-flex min-h-10 items-center gap-2 text-sm">
                        <Play className="h-4 w-4" /> {selectedModeLabel}
                      </Link>
                      <Link href={buildBankHref(fullMega, mode, count)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-3 py-2 text-sm font-bold text-[var(--status-ok-fg)] transition hover:bg-[var(--status-ok-bg)]">
                        <BookOpenCheck className="h-4 w-4" /> Банк
                      </Link>
                    </div>
                  </article>
                )}
                                {fullManuals.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowFullBanks((v) => !v)}
                    className="w-full rounded-xl border border-dashed border-indigo-300 py-2 text-xs font-bold text-indigo-700 transition hover:bg-white"
                  >
                    {showFullBanks ? "Свернуть полные банки" : `Показать полные банки методичек (${fullManuals.length})`}
                  </button>
                )}
                {fullManuals.length > 0 && showFullBanks && (
                  <div className="grid gap-2 sm:grid-cols-2">{fullManuals.map((test) => {
                      const slug = (test.source || "").replace(/^phys_full:/, "");
                      const sections = manualSections[slug] || [];
                      const hrefFor = (from: number, to: number) => {
                        const subId = subTests.get(`phys_sub:${slug}:${from}-${to}`);
                        return subId ? buildHref({ ...test, id: subId }, "sequential", count) : buildRangeHref(test, from, to);
                      };
                      return (
                        <article key={test.id} className="rounded-xl border border-indigo-200 bg-white p-3 sm:p-4">
                          <h3 className="text-sm font-extrabold leading-snug text-slate-900">
                            {test.title.replace(/^Полный тест · /, "")}
                          </h3>
                          <p className="mt-0.5 text-xs text-[var(--muted)]">
                            {test.questionCount} {plural(test.questionCount, "вопрос", "вопроса", "вопросов")}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Link
                              href={buildHref(test, mode, count)}
                              className="btn-primary inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 text-sm sm:flex-none"
                            >
                              <Play className="h-4 w-4" /> {mode === "sequential" ? "Весь банк" : selectedModeLabel}
                            </Link>
                            <Link
                              href={buildBankHref(test, mode, count)}
                              className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-3 py-2 text-sm font-bold text-[var(--status-ok-fg)] sm:flex-none"
                            >
                              <BookOpenCheck className="h-4 w-4" /> Банк
                            </Link>
                          </div>
                          {sections.length > 0 && (
                            <details className="group mt-2">
                              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 text-xs font-bold text-indigo-700 marker:hidden">
                                <span className="transition group-open:rotate-90">▸</span>
                                По разделам и подразделам
                              </summary>
                              <div className="mt-2 space-y-2">
                                {sections.map((section, sectionIndex) => {
                                  const first = section.subsections[0];
                                  const last = section.subsections[section.subsections.length - 1];
                                  // «Весь раздел» ведёт в уже существующий банк «Раздел N.»,
                                  // чтобы не плодить второй экземпляр того же набора.
                                  const wholeTest = tests.find((candidate) => {
                                    const source = candidate.source || "";
                                    if (source.startsWith("phys_full:") || source.startsWith("phys_sub:")) return false;
                                    return candidate.questionCount === section.count && new RegExp(`^Раздел ${sectionIndex + 1}\\.`).test(candidate.title);
                                  });
                                  return (
                                    <div key={section.title} className="rounded-lg border border-[var(--border)] bg-slate-50/50 p-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 text-[11px] font-semibold leading-snug text-slate-700">
                                          {section.title}
                                          <span className="ml-1 font-normal text-[var(--muted)]">· {section.count}</span>
                                        </div>
                                        {first && last && (
                                          <Link
                                            href={wholeTest ? buildHref(wholeTest, "sequential", count) : first && last ? hrefFor(first.from, last.to) : "#"}
                                            className="shrink-0 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-indigo-700"
                                          >
                                            Весь раздел
                                          </Link>
                                        )}
                                      </div>
                                      {section.subsections.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                          {section.subsections.map((sub) => (
                                            <Link
                                              key={sub.title}
                                              href={hrefFor(sub.from, sub.to)}
                                              className="inline-flex min-h-[34px] items-center rounded-full border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
                                            >
                                              {sub.title} · {sub.count}
                                            </Link>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
    </>
  );
}
