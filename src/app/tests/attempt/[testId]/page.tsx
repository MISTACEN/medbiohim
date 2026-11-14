"use client";

/**
 * Attempt-движок: раннер контролируемого тестирования по назначению.
 * Попытка создаётся RPC (medbiohim_start_test_attempt), ответы грейдируются
 * сервером, балл пересчитывается при завершении. Результат уходит в ведомость.
 */
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AnswerOption } from "@/components/questions/AnswerOption";
import { displayOptionEntries } from "@/components/questions/optionOrder";
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { api } from "@/lib/api/client";
import { endpoints } from "@/lib/endpoints";
import { describeApiError } from "@/lib/errors";
import { ExplainWithAi } from "@/components/tests/ExplainWithAi";

type QOption = string | { key?: unknown; label?: unknown };
type Question = { id: string; text: string; options: QOption[]; type?: string; is_closed?: boolean; allow_multiple?: boolean };

const optionLabel = (o: QOption) => (typeof o === "string" ? o : String(o?.label ?? ""));
const optionKey = (o: QOption, i: number) =>
  typeof o === "string" ? String.fromCharCode(65 + i) : (o?.key != null && String(o.key).trim() ? String(o.key) : String.fromCharCode(65 + i));

export default function AttemptRunnerPage({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = use(params);
  const search = useSearchParams();
  const { user } = useAuth();
  const [attemptId, setAttemptId] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [grading, setGrading] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState<{ percent: number | null; score: number | null; max_score: number | null } | null>(null);
  const [error, setError] = useState("");
  // Слаг предмета из детали теста — для RAG-разбора ошибки тьютором.
  const [subjectSlug, setSubjectSlug] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // 1) Запуск попытки (RPC создаёт snapshot и возвращает attempt)
        const start = await api<any>(endpoints.tests.attemptStart(testId), { method: "POST", body: JSON.stringify(user?.groupId ? { group_id: user.groupId } : {}) });
        if (!start.ok) {
          // Attempt-движок требует предмет из курса группы (INVALID_SUBJECT_CONTEXT).
          // Fallback: prep-движок с mode=solve — результат также попадает в ведомость.
          window.location.href = `/tests/preparation/${testId}?mode=solve&count=30`;
          return;
        }
        const attempt = start.data?.attempt;
        if (!attempt?.id) { setError("Попытка не создана"); setLoading(false); return; }
        // 2) Вопросы теста через обычный GET (используется раннером подготовки)
        const t = await api<any>(endpoints.tests.detail(testId));
        if (!t.ok) { setError(describeApiError(t.error)); setLoading(false); return; }
        if (!cancelled) {
          setAttemptId(attempt.id);
          setQuestions((t.data?.questions || []).filter((q: any) => q.is_published !== false));
          const slug = t.data?.subject_slug ?? t.data?.subject?.slug ?? t.data?.test?.subject_slug;
          if (typeof slug === "string") setSubjectSlug(slug);
          setLoading(false);
        }
      } catch (e: unknown) { if (!cancelled) { setError(describeApiError(e as any)); setLoading(false); } }
    })();
    return () => { cancelled = true; };
  }, [testId, user?.groupId]);

  const q = questions[idx];
  const options = useMemo(() => (Array.isArray(q?.options) ? q.options : []), [q]);
  const entries = useMemo(() => displayOptionEntries(q, options as any[], optionKey), [q, options]);
  const isClosed = q?.is_closed !== false && options.length > 0;
  const isMulti = q?.allow_multiple === true || ((grading[q?.id]?.correct_keys as string[] | undefined)?.length ?? 0) > 1;

  function toggle(key: string) {
    if (checked[q.id] || busy) return;
    setAnswers((prev) => {
      const cur = (prev[q.id] || "").split(";").filter(Boolean);
      const next = isMulti ? (cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]) : [key];
      return { ...prev, [q.id]: next.join(";") };
    });
  }

  async function answer() {
    if (!q || !attemptId || busy) return;
    setBusy(true);
    const result = await api<any>(endpoints.tests.attemptsAnswers(attemptId), {
      method: "POST",
      body: JSON.stringify({ question_id: q.id, answer_text: answers[q.id] || "" }),
    });
    setBusy(false);
    if (result.ok) {
      setChecked((c) => ({ ...c, [q.id]: true }));
      if (result.data?.answer?.is_correct != null) setGrading((g) => ({ ...g, [q.id]: result.data.answer }));
    } else {
      setError(describeApiError(result.error));
    }
  }

  async function finish() {
    if (!attemptId || busy) return;
    setBusy(true);
    const result = await api<any>(endpoints.tests.attemptsFinish(attemptId), { method: "POST", body: "{}" });
    setBusy(false);
    if (result.ok) {
      const a = result.data?.attempt;
      setFinished({ percent: a?.percent ?? null, score: a?.score ?? null, max_score: a?.max_score ?? null });
    } else {
      setError(describeApiError(result.error));
    }
  }

  if (loading) return <div className="p-8 text-center text-sm text-slate-500"><Loader2 className="inline h-4 w-4 animate-spin" /> Запуск тестирования…</div>;
  if (error) return <main className="mx-auto max-w-md p-8"><div className="card p-6 text-center"><h1 className="page-title">Не удалось начать</h1><p className="mt-2 text-sm text-[var(--status-critical-fg)]">{error}</p><Link href="/tests" className="btn-secondary mt-4 inline-flex">К тестам</Link></div></main>;

  if (finished) {
    return <main className="mx-auto max-w-md p-8"><div className="card p-6 text-center">
      <h1 className="page-title">Тестирование завершено</h1>
      <div className="my-4 text-5xl font-extrabold text-indigo-600">{finished.percent ?? "—"}%</div>
      <p className="text-sm text-slate-500">{finished.score ?? 0} из {finished.max_score ?? questions.length} верных · результат отправлен преподавателю</p>
      <Link href="/tests" className="btn-primary mt-4 inline-flex">К тестам</Link>
    </div></main>;
  }

  if (!q) return null;
  const answeredCount = Object.keys(checked).length;
  const selectedKeys = (answers[q.id] || "").split(";").filter(Boolean);
  const gradingRow = grading[q.id];

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="page-title">Контролируемое тестирование</h1>
        <p className="page-subtitle">Вопрос {idx + 1} из {questions.length} · отвечено {answeredCount} · результат уйдёт преподавателю</p>
        <div className="mt-2 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-indigo-500" style={{ width: ((idx + 1) / questions.length) * 100 + "%" }} /></div>
      </header>
      <div className="card space-y-4 p-5">
        <ChemRichText text={q.text} className="text-lg font-semibold" />
        {isClosed ? (
          <div className="space-y-2">
            {entries.map(({ option, key, index }) => {
              const selected = selectedKeys.includes(key);
              const isCorrect = checked[q.id] && gradingRow?.is_correct === true && key === gradingRow?.correct_keys?.[0];
              const label = optionLabel(option);
              return (
                <AnswerOption key={key + "-" + index} as="label" variant="choice"
                  state={checked[q.id] ? (isCorrect ? "correct" : selected ? "wrong" : "idle") : selected ? "selected" : "idle"}
                  badge={key} badgeVariant="square"
                  leading={<input type={isMulti ? "checkbox" : "radio"} name={"a-" + q.id} checked={selected} disabled={checked[q.id]} onChange={() => toggle(key)} className="mt-1" />}>
                  <ChemRichText text={label} className="flex-1 space-y-1" />
                </AnswerOption>
              );
            })}
          </div>
        ) : (
          <textarea
            value={answers[q.id] || ""}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            className="min-h-32 w-full rounded-xl border p-3 text-sm"
            placeholder="Письменный ответ — уйдёт на проверку преподавателю"
            disabled={checked[q.id]}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!checked[q.id] ? (
            <button type="button" disabled={busy || !(answers[q.id] || "").trim()} onClick={() => void answer()} className="btn-primary inline-flex items-center gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Проверить ответ
            </button>
          ) : (
            <>
              {gradingRow?.is_correct === true && <span className="rounded-xl bg-[var(--status-ok-bg)] px-4 py-2 text-sm font-bold text-[var(--status-ok-fg)]">✓ Верно</span>}
              {gradingRow?.is_correct === false && <span className="rounded-xl bg-[var(--status-critical-bg)] px-4 py-2 text-sm font-bold text-[var(--status-critical-fg)]">✗ Неверно</span>}
              <button type="button" onClick={() => { if (idx < questions.length - 1) setIdx(idx + 1); else void finish(); }} className="btn-secondary">
                {idx < questions.length - 1 ? "Следующий" : "Завершить тестирование"}
              </button>
            </>
          )}
          <button type="button" disabled={idx === 0} onClick={() => setIdx(idx - 1)} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50">Назад</button>
        </div>
        {checked[q.id] && gradingRow?.is_correct === false && (
          <ExplainWithAi
            question={q.text}
            chosen={selectedKeys
              .map((key) => {
                const entry = entries.find((item) => item.key === key);
                return entry ? optionLabel(entry.option) : key;
              })
              .join("; ")}
            correct={((gradingRow?.correct_keys as string[] | undefined) || [])
              .map((key) => {
                const entry = entries.find((item) => item.key === key);
                return entry ? optionLabel(entry.option) : key;
              })
              .join("; ")}
            subjectSlug={subjectSlug || undefined}
          />
        )}
        {error && <div className="rounded-xl bg-[var(--status-critical-bg)] px-4 py-2 text-sm text-[var(--status-critical-fg)]">{error}</div>}
      </div>
    </main>
  );
}
