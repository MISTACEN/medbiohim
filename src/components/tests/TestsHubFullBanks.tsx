"use client";

/**
 * «Полные тесты» каталога: мега-микс и полные банки методичек.
 *
 * Блок больше не прячется за отдельной кнопкой «показать»: он стоит первым в
 * списке и раскрыт. Запуск любого банка ведёт на экран настройки, а диапазоны
 * разделов стартуют сразу в последовательном режиме — так и было задумано.
 */
import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import { BookOpenCheck, Play } from "lucide-react";

import {
  buildRangeHref,
  plural,
  preparationHref,
  type ManualSection,
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
}: {
  fullTests: TestItem[];
  fullMega: TestItem | null;
  fullManuals: TestItem[];
  manualSections: Record<string, ManualSection[]>;
  subTests: Map<string, string>;
  tests: TestItem[];
  showFullBanks: boolean;
  setShowFullBanks: Dispatch<SetStateAction<boolean>>;
}) {
  if (fullTests.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-indigo-50/40 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">Полные тесты</div>
          <h2 className="mt-0.5 truncate text-sm font-extrabold text-slate-950 sm:text-base">
            Все вопросы методичек одним заходом
          </h2>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
          {fullManuals.length + (fullMega ? 1 : 0)} шт.
        </span>
      </header>

      <div className="space-y-2 px-2 pb-3 sm:px-3 sm:pb-3">
        {fullMega && (
          <article className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-300 bg-white px-3 py-2.5">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-extrabold text-slate-900">
                Все тесты физиологии · мега-микс
              </h3>
              <p className="text-xs text-[var(--muted)]">
                {fullMega.questionCount} {plural(fullMega.questionCount, "вопрос", "вопроса", "вопросов")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Link href={preparationHref(fullMega)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-700">
                <Play className="h-3.5 w-3.5" /> Открыть
              </Link>
              <Link href={`/tests/bank/${encodeURIComponent(fullMega.id)}`} className="hidden min-h-9 items-center gap-1.5 rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-3 py-1.5 text-xs font-bold text-[var(--status-ok-fg)] sm:inline-flex">
                <BookOpenCheck className="h-3.5 w-3.5" /> Вопросы
              </Link>
            </div>
          </article>
        )}

        {fullManuals.length > 1 && (
          <button
            type="button"
            onClick={() => setShowFullBanks((v) => !v)}
            className="w-full rounded-xl border border-dashed border-indigo-300 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-white"
          >
            {showFullBanks ? "Свернуть полные банки" : `Показать полные банки методичек (${fullManuals.length})`}
          </button>
        )}

        {showFullBanks && fullManuals.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {fullManuals.map((test) => {
              const slug = (test.source || "").replace(/^phys_full:/, "");
              const sections = manualSections[slug] || [];
              const hrefFor = (from: number, to: number) => {
                const subId = subTests.get(`phys_sub:${slug}:${from}-${to}`);
                return subId ? buildRangeHref({ ...test, id: subId }, from, to) : buildRangeHref(test, from, to);
              };
              return (
                <article key={test.id} className="rounded-xl border border-indigo-200 bg-white p-3">
                  <h3 className="text-sm font-extrabold leading-snug text-slate-900">
                    {test.title.replace(/^Полный тест · /, "")}
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {test.questionCount} {plural(test.questionCount, "вопрос", "вопроса", "вопросов")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Link
                      href={preparationHref(test)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-700"
                    >
                      <Play className="h-3.5 w-3.5" /> Открыть
                    </Link>
                    <Link
                      href={`/tests/bank/${encodeURIComponent(test.id)}`}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-3 py-1.5 text-xs font-bold text-[var(--status-ok-fg)]"
                    >
                      <BookOpenCheck className="h-3.5 w-3.5" /> Вопросы
                    </Link>
                  </div>
                  {sections.length > 0 && (
                    <details className="group mt-2">
                      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 text-xs font-bold text-indigo-700 marker:hidden">
                        <span className="transition group-open:rotate-90">▸</span>
                        По разделам
                      </summary>
                      <div className="mt-1.5 space-y-1.5">
                        {sections.map((section, sectionIndex) => {
                          const first = section.subsections[0];
                          const last = section.subsections[section.subsections.length - 1];
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
                                    href={
                                      wholeTest
                                        ? buildRangeHref(wholeTest, 1, wholeTest.questionCount)
                                        : hrefFor(first.from, last.to)
                                    }
                                    className="shrink-0 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-indigo-700"
                                  >
                                    Весь раздел
                                  </Link>
                                )}
                              </div>
                              {section.subsections.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {section.subsections.map((sub) => (
                                    <Link
                                      key={sub.title}
                                      href={hrefFor(sub.from, sub.to)}
                                      className="inline-flex min-h-[32px] items-center rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
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
  );
}
