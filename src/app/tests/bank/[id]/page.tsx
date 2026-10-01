"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpenCheck, ListChecks, Play, RotateCcw } from "lucide-react";
import { getBankProgress, getTest, hasToken, type ApiTest } from "@/lib/api";
import { ChemRichText } from "@/components/chemistry/ChemRichText";

type BankOption = string | { label?: unknown; correct?: boolean };
type BankQuestion = {
  id: string;
  text: string;
  answer?: string | null;
  options: BankOption[];
  type?: string;
};

function labelOf(o: BankOption) {
  return typeof o === "string" ? o : String(o.label ?? "");
}

function correctOf(o: BankOption) {
  return typeof o !== "string" && o.correct === true;
}

export default function TestBankPage({ params }: { params: Promise<{ id: string }> }) {
  const [testId, setTestId] = useState("");
  const [test, setTest] = useState<ApiTest | null>(null);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAnswers, setShowAnswers] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await params;
      if (cancelled) return;
      setTestId(p.id);
      if (!hasToken()) {
        setLoading(false);
        return;
      }
      const [detail, bankProgress] = await Promise.all([getTest(p.id), getBankProgress(p.id)]);
      if (cancelled) return;
      if (detail.ok) {
        setTest(detail.data.test);
        setQuestions(
          (detail.data.questions || []).map((q: Record<string, unknown>, i: number) => ({
            id: String(q.id || i),
            text: String(q.text || q.body || q.q || ""),
            answer: q.answer == null ? null : String(q.answer),
            options: Array.isArray(q.options) ? (q.options as BankOption[]) : [],
            type: String(q.type || "mcq"),
          }))
        );
      } else setError(detail.error.message);
      if (bankProgress.ok) setProgress(bankProgress.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  const completedCorrect = Number(progress?.correct ?? 0);
  const answered = Number(progress?.answered ?? 0);
  const total = Number(progress?.total ?? questions.length);
  const percent = total ? Math.round((answered / total) * 100) : 0;

  const modeLinks = useMemo(() => ({
    practice: `/tests/preparation/${encodeURIComponent(testId)}?mode=prepare&count=10`,
    solve: `/tests/preparation/${encodeURIComponent(testId)}?mode=solve&count=10`,
    exam: `/tests/preparation/${encodeURIComponent(testId)}?mode=exam&count=10`,
    sequential: `/tests/preparation/${encodeURIComponent(testId)}?flow=sequential&mode=prepare`,
  }), [testId]);

  if (!hasToken()) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-600">Войдите, чтобы открыть банк вопросов</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  if (loading) return <div className="card p-8 text-sm text-slate-500">Загрузка банка…</div>;

  if (error || !test) {
    return <div className="card p-8 text-sm text-rose-600">{error || "Банк не найден"}</div>;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <Link href="/tests" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> К тестам
      </Link>

      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm">
        <div className="text-xs font-bold uppercase tracking-wider text-indigo-500">Банк вопросов</div>
        <h1 className="mt-2 text-2xl font-extrabold">{String(test.title || "Тест")}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {questions.length} вопросов. Здесь можно изучить весь банк с ответами или выбрать режим прохождения.
        </p>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Режим прохождения</h2>
            <p className="text-sm text-slate-500">Для «весь банк» вопросы идут строго подряд и после завершения показывается 41/41.</p>
          </div>
          {progress && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <div className="font-semibold">Прогресс всего банка</div>
              <div className="mt-1 text-slate-600">{answered} / {total} · {percent}% · правильно {completedCorrect}</div>
              {progress.completed && <div className="mt-1 font-semibold text-emerald-600">Банк полностью пройден</div>}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href={modeLinks.practice} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4">
            <BookOpenCheck className="h-5 w-5 text-indigo-600" />
            <div className="mt-2 font-semibold">Подготовка</div>
            <div className="mt-1 text-xs text-slate-500">случайная выборка, проверка сразу</div>
          </Link>
          <Link href={modeLinks.solve} className="rounded-xl border px-4 py-4">
            <ListChecks className="h-5 w-5 text-slate-700" />
            <div className="mt-2 font-semibold">Решение</div>
            <div className="mt-1 text-xs text-slate-500">случайная выборка, проверка в конце</div>
          </Link>
          <Link href={modeLinks.exam} className="rounded-xl border bg-slate-900 px-4 py-4 text-white">
            <Play className="h-5 w-5" />
            <div className="mt-2 font-semibold">Экзамен</div>
            <div className="mt-1 text-xs text-slate-300">без показа эталонов до конца</div>
          </Link>
          <Link href={modeLinks.sequential} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <RotateCcw className="h-5 w-5 text-emerald-700" />
            <div className="mt-2 font-semibold text-emerald-800">Весь банк подряд</div>
            <div className="mt-1 text-xs text-emerald-700">1 → {questions.length} без пропусков</div>
          </Link>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Все вопросы и ответы</h2>
            <p className="text-sm text-slate-500">Эталон выделен отдельно; для вопросов с несколькими правильными вариантами показаны все правильные пункты.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAnswers((v) => !v)}
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
          >
            {showAnswers ? "Скрыть ответы" : "Показать ответы"}
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {questions.map((q, i) => {
            const correctOptions = q.options.filter(correctOf).map(labelOf);
            const hasStructuredAnswers = correctOptions.length > 0;
            return (
              <article key={q.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-400">Вопрос {i + 1} из {questions.length}</div>
                <ChemRichText text={q.text} className="mt-2 font-medium" />

                <div className="mt-3 space-y-2">
                  {q.options.map((option, oi) => {
                    const label = labelOf(option);
                    const isCorrect = correctOf(option);
                    return (
                      <div
                        key={oi}
                        className={
                          "rounded-xl border px-3 py-2 text-sm " +
                          (showAnswers && isCorrect
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-slate-100 bg-white")
                        }
                      >
                        <span className="mr-2 font-semibold">{String.fromCharCode(65 + oi)}.</span>
                        <ChemRichText text={label} className="inline" />
                        {showAnswers && isCorrect && <span className="ml-2 text-xs font-bold text-emerald-700">✓ правильный</span>}
                      </div>
                    );
                  })}
                </div>

                {showAnswers && !hasStructuredAnswers && q.answer && (
                  <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                    <span className="font-semibold">Эталон: </span>
                    <ChemRichText text={q.answer} className="inline" />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
