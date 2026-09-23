"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Loader2, CheckCircle2 } from "lucide-react";
import {
  listTests,
  getTest,
  startTestAttempt,
  finishAttempt,
  hasToken,
  type ApiTest,
} from "@/lib/api";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Confetti } from "@/components/ui/Confetti";
import { QuestionReport } from "@/components/QuestionReport";

type UiTest = {
  id: string;
  title: string;
  subject: string;
  type: string;
  questionCount: number;
};

type Q = { id: string; body: string; options: string[]; answer?: string | number | null; };

export default function TestsPage() {
  const [items, setItems] = useState<UiTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [active, setActive] = useState<{
    testId: string;
    attemptId: string;
    title: string;
    questions: Q[];
    answersKey: Array<number | null>;
  } | null>(null);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ score: number; max: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasToken()) {
        setLoading(false);
        return;
      }
      try {
        const res = await listTests();
        if (cancelled) return;
        if (res.ok) {
          setItems(
            (res.data.items || []).map((t: ApiTest & { questions_count?: number; type?: string }) => ({
              id: String(t.id),
              title: String(t.title || t.name || "Тест"),
              subject: String(t.subject_name || "—"),
              type: String(t.type || "test"),
              questionCount: Number(t.questions_count || 0),
            }))
          );
        } else setNote(res.error.message);
      } catch {
        if (!cancelled) setNote("Не удалось загрузить тесты");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function openTest(id: string) {
    setBusy(true);
    setResult(null);
    setPicks({});
    try {
      const detail = await getTest(id);
      if (!detail.ok) {
        setNote(detail.error.message);
        return;
      }
      const attempt = await startTestAttempt(id);
      if (!attempt.ok) {
        setNote(attempt.error.message);
        return;
      }
      const questions = (detail.data.questions || []).map((q: Record<string, unknown>, i: number) => {
        const rawOptions = Array.isArray(q.options) ? q.options : [];
        const options = rawOptions.map((x: unknown) => {
          if (typeof x === "object" && x !== null && "label" in x) return String((x as {label?:unknown}).label ?? "");
          return String(x);
        });
        return { id: String(q.id || i), body: String(q.body || q.q || q.text || ""), options, answer: q.answer == null ? null : String(q.answer) };
      });
      const localAnswers = Array.isArray((detail.data as { answers_local?: unknown }).answers_local)
        ? ((detail.data as { answers_local: Array<number | null> }).answers_local || [])
        : [];
      const answersKey = questions.map((q, i) => {
        if (localAnswers[i] != null) return Number(localAnswers[i]);
        const answer = q.answer == null ? "" : String(q.answer).trim();
        if (answer === "") return null;
        const n = Number(answer);
        if (Number.isInteger(n) && n >= 0 && n < q.options.length) return n;
        if (Number.isInteger(n) && n >= 1 && n <= q.options.length) return n - 1;
        const byText = q.options.findIndex((x) => x.trim().toLowerCase() === answer.toLowerCase());
        if (byText >= 0) return byText;
        const byId = q.options.findIndex((x) => x.trim() === answer.replace(/^option[-_]?/i, ""));
        return byId >= 0 ? byId : null;
      });
      setActive({
        testId: id,
        attemptId: attempt.data.attempt.id,
        title: String(detail.data.test.title || "Тест"),
        questions,
        answersKey,
      });
    } catch {
      setNote("Не удалось начать тест");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!active) return;
    setBusy(true);
    let score = 0;
    const max = active.questions.length;
    active.questions.forEach((_, i) => {
      if (active.answersKey[i] != null && picks[i] === active.answersKey[i]) score += 1;
    });
    await finishAttempt(active.attemptId, score, max);
    setResult({ score, max });
    if (max > 0 && score / max >= 0.7) {
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 2500);
    }
    setBusy(false);
  }

  if (!hasToken()) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-600">Войдите, чтобы проходить тесты</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">
          Войти
        </Link>
      </div>
    );
  }

  if (loading) return <SkeletonCards count={3} />;

  if (active) {
    return (
      <div className="space-y-6">
        <Confetti active={celebrate} />
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="page-title">{active.title}</h1>
            <p className="page-subtitle">{active.questions.length} вопросов</p>
          </div>
          <button type="button" className="text-sm text-slate-500" onClick={() => setActive(null)}>
            ← К списку
          </button>
        </div>
        {active.questions.map((q, i) => (
          <div key={q.id} className="card space-y-3">
            <div className="font-medium">
              {i + 1}. {q.body}
            </div>
            <div className="space-y-2">
              {q.options.map((opt, oi) => (
                <label
                  key={oi}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                    picks[i] === oi ? "border-blue-500 bg-blue-50" : "border-slate-100"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${i}`}
                    checked={picks[i] === oi}
                    onChange={() => setPicks((p) => ({ ...p, [i]: oi }))}
                  />
                  {opt}
                </label>
              ))}
            </div>
            <QuestionReport questionId={q.id} />
          </div>
        ))}
        {result ? (
          <div className="card flex items-center gap-3 text-emerald-700">
            <CheckCircle2 className="h-6 w-6" />
            Результат: {result.score} из {result.max}
          </div>
        ) : (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сдать тест"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Тесты и билеты</h1>
        <p className="page-subtitle">Проверка знаний по предметам</p>
        {note && <p className="mt-2 text-sm text-amber-700">{note}</p>}
      </div>
      {items.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          Пока нет опубликованных тестов. Админ может добавить их в панели управления.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((t) => (
            <div key={t.id} className="card flex flex-col gap-3">
              <div>
                <div className="text-xs text-slate-500">{t.subject}</div>
                <div className="text-lg font-semibold">{t.title}</div>
                <div className="text-sm text-slate-500">{t.questionCount || "—"} вопросов</div>
              </div>
              <div className="flex flex-wrap gap-2"><Link href={`/tests/preparation/${t.id}`} className="rounded-xl border px-4 py-2 text-sm font-semibold text-indigo-700">Подготовка</Link><button
                type="button"
                className="btn-primary inline-flex items-center gap-2 self-start"
                disabled={busy}
                onClick={() => void openTest(t.id)}
              >
                <Play className="h-4 w-4" /> Тест
              </button></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
