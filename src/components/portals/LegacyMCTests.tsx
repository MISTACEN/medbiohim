"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, Loader2, XCircle } from "lucide-react";
import {
  loadMcIndex,
  loadMcTest,
  type PortalMcIndexEntry,
  type PortalMcQuestion,
} from "@/lib/portalContent";

/** Легаси MC-тесты (биология, физика, математика, история, оргхим, физиология). */
export default function LegacyMCTests({ subjectIds }: { subjectIds?: string[] }) {
  const [index, setIndex] = useState<PortalMcIndexEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PortalMcQuestion[] | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    loadMcIndex()
      .then((idx) => alive && setIndex(idx.tests))
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, []);

  const tests = useMemo(() => {
    if (!index) return [];
    if (!subjectIds?.length) return index;
    const set = new Set(subjectIds);
    return index.filter((t) => set.has(t.subjectId));
  }, [index, subjectIds]);

  async function open(id: string) {
    setActiveId(id);
    setQuestions(null);
    setPicks({});
    setChecked(false);
    try {
      const t = await loadMcTest(id);
      setQuestions(t.questions);
    } catch (e: any) {
      setError(String(e?.message || e));
      setActiveId(null);
    }
  }

  if (error) return <div className="card p-5 text-sm text-rose-600">{error}</div>;
  if (!index) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Загружаем тесты…
      </div>
    );
  }

  if (activeId) {
    const answeredCount = Object.keys(picks).length;
    const correctCount =
      questions?.filter((q) => typeof q.correct === "number" && picks[String(q.id)] === q.correct).length ?? 0;
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            setActiveId(null);
            setQuestions(null);
          }}
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700"
        >
          <ChevronLeft className="size-4" /> Ко всем тестам
        </button>

        {!questions && (
          <div className="card flex items-center gap-2 p-5 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" /> Загружаем тест…
          </div>
        )}

        {questions && (
          <>
            <div className="grid gap-3">
              {questions.map((q, qi) => {
                const pick = picks[String(q.id)];
                return (
                  <article key={String(q.id)} className="card p-4">
                    <h3 className="font-semibold text-slate-800">{qi + 1}. {q.text}</h3>
                    <div className="mt-3 grid gap-2">
                      {q.options.map((opt, oi) => {
                        const isPick = pick === oi;
                        const isCorrect = q.correct === oi;
                        let cls = "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40";
                        if (checked) {
                          if (isCorrect) cls = "border-emerald-300 bg-emerald-50";
                          else if (isPick) cls = "border-rose-300 bg-rose-50";
                          else cls = "border-slate-200 opacity-70";
                        } else if (isPick) {
                          cls = "border-indigo-400 bg-indigo-50";
                        }
                        return (
                          <button
                            key={oi}
                            type="button"
                            disabled={checked}
                            onClick={() => setPicks((p) => ({ ...p, [String(q.id)]: oi }))}
                            className={"flex items-start gap-2 rounded-xl border px-3 py-2 text-left text-sm transition " + cls}
                          >
                            <span className="mt-0.5 text-xs font-bold text-slate-400">{String.fromCharCode(65 + oi)}</span>
                            <span className="flex-1">{opt}</span>
                            {checked && isCorrect && <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}
                            {checked && isPick && !isCorrect && <XCircle className="size-4 shrink-0 text-rose-500" />}
                          </button>
                        );
                      })}
                    </div>
                    {checked && q.answer && (
                      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{q.answer}</p>
                    )}
                  </article>
                );
              })}
            </div>

            <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white/95 p-3 shadow-lg backdrop-blur">
              <span className="text-sm font-semibold text-slate-600">
                {checked
                  ? `Результат: ${correctCount} из ${questions.length}`
                  : `Отвечено ${answeredCount} из ${questions.length}`}
              </span>
              {checked ? (
                <button
                  type="button"
                  onClick={() => {
                    setPicks({});
                    setChecked(false);
                  }}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
                >
                  Пройти заново
                </button>
              ) : (
                <button
                  type="button"
                  disabled={answeredCount < questions.length}
                  onClick={() => setChecked(true)}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:opacity-40"
                >
                  Проверить
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tests.length === 0 && (
        <div className="card p-5 text-sm text-slate-500 sm:col-span-2">Тесты для этого предмета пока не загружены.</div>
      )}
      {tests.map((t) => (
        <button key={t.id} type="button" onClick={() => open(t.id)} className="card p-4 text-left transition hover:border-indigo-300">
          <div className="text-xs text-slate-400">{t.subject}{t.topic ? ` · ${t.topic}` : ""}</div>
          <div className="mt-1 font-semibold text-slate-800">{t.title}</div>
          <div className="mt-1 text-xs text-slate-500">{t.count} вопросов</div>
        </button>
      ))}
    </div>
  );
}
