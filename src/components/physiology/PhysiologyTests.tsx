"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, ChevronRight, Layers, ListChecks, Loader2, Play, Sparkles } from "lucide-react";
import TestRunner from "./TestRunner";
import {
  loadPhysiologyIndex,
  loadPhysiologyManual,
  type PhysiologyIndex,
  type PhysiologyManual,
  type PhysiologyQuestion,
  type PhysiologyTestGroup,
} from "@/lib/physiologyContent";

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} ${few}`;
  return `${count} ${many}`;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function uniqueQuestions(questions: PhysiologyQuestion[]) {
  const seen = new Set<string>();
  return questions.filter((question) => {
    const key = question.text.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function manualQuestions(manual: PhysiologyManual) {
  return uniqueQuestions(
    [...manual.lessons.flatMap((lesson) => lesson.tests), ...manual.banks].flatMap((group) => group.questions)
  );
}

export default function PhysiologyTests() {
  const [index, setIndex] = useState<PhysiologyIndex | null>(null);
  const [slug, setSlug] = useState("");
  const [manual, setManual] = useState<PhysiologyManual | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<PhysiologyTestGroup | null>(null);

  useEffect(() => {
    let alive = true;
    loadPhysiologyIndex()
      .then((data) => {
        if (!alive) return;
        setIndex(data);
        setSlug(data.manuals[0]?.slug || "");
      })
      .catch((cause: unknown) => {
        if (alive) {
          setError(cause instanceof Error ? cause.message : "Не удалось загрузить тесты");
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    setLoading(true);
    setManual(null);
    loadPhysiologyManual(slug)
      .then((data) => {
        if (alive) setManual(data);
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : "Не удалось загрузить методичку");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  const full = useMemo(() => (manual ? manualQuestions(manual) : []), [manual]);

  async function startAll() {
    if (!index) return;
    setLoadingAll(true);
    try {
      const manuals = await Promise.all(index.manuals.map((item) => loadPhysiologyManual(item.slug)));
      const questions = uniqueQuestions(manuals.flatMap((item) => manualQuestions(item)));
      setGroup({ title: "Все тесты · физиология", questions: shuffle(questions) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось собрать общий тест");
    } finally {
      setLoadingAll(false);
    }
  }

  if (group) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setGroup(null)}
          className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline"
        >
          <ChevronRight className="h-4 w-4 rotate-180" /> К выбору теста
        </button>
        <TestRunner group={group} onExit={() => setGroup(null)} subjectSlug="physiology" subjectName="Физиология" />
      </div>
    );
  }

  if (error) {
    return <div className="card p-6 text-sm text-[var(--status-critical-fg)]">{error}</div>;
  }

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Тесты · физиология</p>
        <h2 className="mt-1 text-xl font-extrabold text-slate-900">Тесты по методичкам</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Полный тест по методичке, тест по большому разделу или по подразделу — те же банки, что в практикуме.
          Вопросы внутри теста идут подряд, полный тест перемешивается.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void startAll()}
            disabled={loadingAll || !index}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Все тесты физиологии
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Методичка">
        {index?.manuals.map((item) => (
          <button
            key={item.slug}
            type="button"
            aria-selected={slug === item.slug}
            onClick={() => setSlug(item.slug)}
            className={
              "rounded-full px-3 py-1.5 text-xs font-bold transition " +
              (slug === item.slug
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200")
            }
          >
            {item.title}
          </button>
        ))}
      </div>

      {loading && !manual ? (
        <div className="card flex items-center gap-3 p-5 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-500" /> Загружаем тесты…
        </div>
      ) : manual ? (
        <>
          <article className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <BookOpenCheck className="h-5 w-5 text-indigo-500" /> Полный тест по методичке
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {plural(full.length, "вопрос", "вопроса", "вопросов")} из всех занятий и банков, в случайном порядке.
              </p>
            </div>
            <button
              type="button"
              disabled={!full.length}
              onClick={() => setGroup({ title: `Полный тест · ${manual.title}`, questions: shuffle(full) })}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Начать
            </button>
          </article>

          {manual.banks.length > 0 && (
            <section className="card space-y-3 p-5">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-indigo-500" />
                <h3 className="text-base font-bold">По разделам и подразделам</h3>
              </div>
              {manual.banks.map((bank, bankIndex) => (
                <article key={bank.title} className="rounded-xl border bg-slate-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{bank.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {plural(bank.questions.length, "вопрос", "вопроса", "вопросов")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGroup(bank)}
                      className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                    >
                      <Play className="h-3.5 w-3.5" /> Весь раздел
                    </button>
                  </div>
                  {bank.subsections && bank.subsections.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {bank.subsections.map((subsection) => {
                        const questions = bank.questions.filter(
                          (question) => question.number >= subsection.from && question.number <= subsection.to
                        );
                        return (
                          <button
                            key={subsection.title}
                            type="button"
                            onClick={() =>
                              setGroup({
                                title: `Раздел ${bankIndex + 1} · ${subsection.title}`,
                                questions,
                              })
                            }
                            className="group flex items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left transition hover:border-indigo-300 hover:shadow-sm"
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold leading-snug text-slate-800">
                                {subsection.title}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-slate-500">
                                {plural(questions.length, "вопрос", "вопроса", "вопросов")}
                              </span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-indigo-500" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </article>
              ))}
            </section>
          )}

          {manual.banks.length === 0 && (
            <section className="card space-y-3 p-5">
              <div className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-indigo-500" />
                <h3 className="text-base font-bold">Тесты занятий</h3>
              </div>
              {manual.lessons.flatMap((lesson) =>
                lesson.tests.map((test) => (
                  <button
                    key={`${lesson.id}-${test.title}`}
                    type="button"
                    onClick={() => setGroup(test)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border bg-slate-50 px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-white"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">{test.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {plural(test.questions.length, "вопрос", "вопроса", "вопросов")}
                      </span>
                    </span>
                    <Play className="h-4 w-4 shrink-0 text-indigo-500" />
                  </button>
                ))
              )}
            </section>
          )}
        </>
      ) : null}
    </section>
  );
}
