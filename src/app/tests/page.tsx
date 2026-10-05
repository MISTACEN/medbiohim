"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Loader2, CheckCircle2 } from "lucide-react";
import {
  listTests,
  getTest,
  startTestAttempt,
  finishAttempt,
  getFile,
  listMyAttempts,
  hasToken,
  type ApiTest,
} from "@/lib/api";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { Confetti } from "@/components/ui/Confetti";
import { QuestionReport } from "@/components/QuestionReport";
import { ChemRichText } from "@/components/chemistry/ChemRichText";

type UiTest = {
  id: string;
  title: string;
  subject: string;
  type: string;
  questionCount: number;
  sourceFileId?: string | null;
  sourceFileName?: string | null;
};

type Option = string | { label?: unknown; correct?: boolean };
type Q = {
  id: string;
  body: string;
  options: Option[];
  answer?: string | number | null;
  type?: string;
};

export default function TestsPage() {
  const [items, setItems] = useState<UiTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [active, setActive] = useState<{
    testId: string;
    attemptId: string;
    title: string;
    questions: Q[];
  } | null>(null);
  const [picks, setPicks] = useState<Record<number, string[]>>({});
  const [result, setResult] = useState<{ score: number; max: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [attempts, setAttempts] = useState<any[]>([]);

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
              sourceFileId: t.source_file_id || null,
              sourceFileName: t.source_file_name || null,
            }))
          );
        } else setNote(res.error.message);
        const history = await listMyAttempts();
        if (!cancelled && history.ok) setAttempts(history.data.items || []);
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

  async function openSource(test: UiTest) {
    if (!test.sourceFileId) return;
    const r = await getFile(test.sourceFileId);
    if (r.ok && r.data.download?.url) window.open(r.data.download.url, "_blank", "noopener,noreferrer");
    else setNote(r.ok ? "Исходный файл сейчас недоступен" : r.error.message);
  }

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
        const rawOptions = Array.isArray(q.options) ? (q.options as unknown[]) : [];
        const options: Option[] = rawOptions.map((x: unknown) => {
          if (typeof x === "object" && x !== null && "label" in x) {
            return { label: String((x as { label?: unknown }).label ?? ""), correct: (x as { correct?: unknown }).correct === true };
          }
          return String(x);
        });
        return {
          id: String(q.id || i),
          body: String(q.body || q.q || q.text || ""),
          options,
          answer: q.answer == null ? null : String(q.answer),
          type: String(q.type || "mcq"),
        };
      });
      setActive({
        testId: id,
        attemptId: attempt.data.attempt.id,
        title: String(detail.data.test.title || "Тест"),
        questions,
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
    active.questions.forEach((q, i) => {
      const selected = (picks[i] || []).map((x) => x.trim().toLowerCase()).filter(Boolean).sort();
      const correct = q.options
        .filter((o: any) => typeof o !== "string" && o.correct === true)
        .map((o: any) => String(o.label ?? "").trim().toLowerCase())
        .filter(Boolean)
        .sort();

      if (q.type === "open" || q.type === "problem" || q.type === "theory" || q.type === "practical") {
        const expected = String(q.answer || "").trim().toLowerCase();
        if (selected.length === 1 && selected[0] === expected) score += 1;
      } else if (correct.length && JSON.stringify(selected) === JSON.stringify(correct)) {
        score += 1;
      } else if (!correct.length && q.answer != null) {
        const fallback = String(q.answer).trim().toLowerCase();
        if (selected.length === 1 && selected[0] === fallback) score += 1;
      }
    });
    const finished = await finishAttempt(active.attemptId, score, max);
    if (!finished.ok) {
      setNote(finished.error.message);
      setBusy(false);
      return;
    }
    setAttempts((prev) => [finished.data.attempt, ...prev.filter((x:any) => x.id !== finished.data.attempt.id)]);
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
      <div className="tests-page space-y-4 sm:space-y-6">
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
          <div key={q.id} className="test-question-card card space-y-3">
            <div className="font-medium">
              {i + 1}.{" "}
              <ChemRichText text={q.body} className="mt-1 space-y-2 text-sm font-medium" />
            </div>
            {q.type === "open" || q.type === "problem" || q.type === "theory" || q.type === "practical" ? (
              <textarea
                value={(picks[i] || [])[0] || ""}
                onChange={(e) => setPicks((p) => ({ ...p, [i]: [e.target.value] }))}
                className="min-h-32 w-full rounded-xl border p-3 text-sm"
                placeholder="Введите ответ…"
              />
            ) : (
              <>
                {q.options.filter((o) => typeof o !== "string" && o.correct === true).length > 1 && (
                  <div className="text-xs text-slate-500">Можно выбрать несколько вариантов.</div>
                )}
                <div className="space-y-2">
                  {q.options.map((opt, oi) => {
                    const label = typeof opt === "string" ? opt : String(opt.label ?? "");
                    const multi = q.options.filter((o) => typeof o !== "string" && o.correct === true).length > 1;
                    const selected = (picks[i] || []).includes(label);
                    return (
                      <label
                        key={oi}
                        className={"flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm " + (selected ? "border-blue-500 bg-blue-50" : "border-slate-100")}
                      >
                        <input
                          type={multi ? "checkbox" : "radio"}
                          name={"q-" + i}
                          checked={selected}
                          onChange={() =>
                            setPicks((p) => {
                              const current = p[i] || [];
                              const next = multi
                                ? current.includes(label)
                                  ? current.filter((x) => x !== label)
                                  : [...current, label]
                                : [label];
                              return { ...p, [i]: next };
                            })
                          }
                        />
                        <ChemRichText text={label} className="flex-1 space-y-1 text-sm" />
                      </label>
                    );
                  })}
                </div>
              </>
            )}
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
      <section className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">История попыток</h2>
            <p className="mt-1 text-xs text-slate-500">Последние 50 завершённых и незавершённых попыток.</p>
          </div>
        </div>
        {attempts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Попыток пока нет.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {attempts.slice(0, 12).map((a:any) => (
              <div key={String(a.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 px-3 py-2.5 text-sm">
                <div>
                  <div className="font-semibold text-slate-800">{String(a.test_title || "Тест")}</div>
                  <div className="text-xs text-slate-500">{a.started_at ? String(a.started_at).slice(0,16).replace("T"," ") : "—"} · {String(a.status || "—")}</div>
                </div>
                <div className="font-bold text-indigo-700">{a.percent != null ? String(a.percent) + "%" : "—"}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {items.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          Пока нет опубликованных тестов. Админ может добавить их в панели управления.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((t) => (
            <div key={t.id} className="test-list-card card flex flex-col gap-3">
              <div>
                <div className="text-xs text-slate-500">{t.subject}</div>
                <div className="text-lg font-semibold">{t.title}</div>
                <div className="text-sm text-slate-500">{t.questionCount || "—"} вопросов</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/tests/bank/${t.id}`} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">Банк вопросов</Link><Link href={`/tests/preparation/${t.id}`} className="rounded-xl border px-4 py-2 text-sm font-semibold text-indigo-700">Подготовка</Link><Link href={`/tests/preparation/${t.id}?mode=exam`} className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700">Экзамен</Link>
                {t.sourceFileId && <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => void openSource(t)}>Исходник{t.sourceFileName ? " · " + t.sourceFileName : ""}</button>}
                <button
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
