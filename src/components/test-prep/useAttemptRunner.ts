"use client";

/**
 * Attempt-движок: состояние контролируемого тестирования по назначению.
 * Попытка создаётся RPC (medbiohim_start_test_attempt), ответы грейдируются
 * сервером, балл пересчитывается при завершении. Результат уходит в ведомость.
 * Разметка — в `AttemptRunner` и `AttemptFinished` этой папки.
 */
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { displayOptionEntries } from "@/components/questions/optionOrder";
import { api } from "@/lib/api/client";
import { endpoints } from "@/lib/endpoints";
import { describeApiError } from "@/lib/errors";
import { createCardsFromAttempt } from "@/lib/api/tests";

type QOption = string | { key?: unknown; label?: unknown };
export type AttemptQuestion = { id: string; text: string; options: QOption[]; type?: string; is_closed?: boolean; allow_multiple?: boolean };

export const optionLabel = (o: QOption) => (typeof o === "string" ? o : String(o?.label ?? ""));

const optionKey = (o: QOption, i: number) =>
  typeof o === "string" ? String.fromCharCode(65 + i) : (o?.key != null && String(o.key).trim() ? String(o.key) : String.fromCharCode(65 + i));

export type AttemptRunnerController = ReturnType<typeof useAttemptRunner>;

export function useAttemptRunner(testId: string) {
  const { user } = useAuth();
  const [attemptId, setAttemptId] = useState("");
  const [questions, setQuestions] = useState<AttemptQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [grading, setGrading] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState<{ percent: number | null; score: number | null; max_score: number | null } | null>(null);
  const [cardsBusy, setCardsBusy] = useState(false);
  const [cardsNote, setCardsNote] = useState("");
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
    if (!q || checked[q.id] || busy) return;
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

  async function makeCards(questionIds?: string[]) {
    if (!attemptId || cardsBusy) return;
    setCardsBusy(true);
    const response = await createCardsFromAttempt(attemptId, questionIds);
    setCardsBusy(false);
    if (response.ok) {
      const pack = questionIds?.length ? "Из ошибок" : "Из теста";
      setCardsNote(`Готово: ${response.data.card_count} карточек в паке «${pack}» — открыть в /cards`);
    } else setCardsNote(describeApiError(response.error));
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

  // Ошибки для повторения: экран уже знает, что проверено и неверно.
  const wrongIds = Object.entries(grading)
    .filter(([, row]) => (row as { is_correct?: boolean | null } | null)?.is_correct === false)
    .map(([questionId]) => questionId);

  const answeredCount = Object.keys(checked).length;
  const selectedKeys = q ? (answers[q.id] || "").split(";").filter(Boolean) : [];
  const gradingRow = q ? grading[q.id] : undefined;

  const chosenText = selectedKeys
    .map((key) => {
      const entry = entries.find((item) => item.key === key);
      return entry ? optionLabel(entry.option) : key;
    })
    .join("; ");
  const correctText = ((gradingRow?.correct_keys as string[] | undefined) || [])
    .map((key: string) => {
      const entry = entries.find((item) => item.key === key);
      return entry ? optionLabel(entry.option) : key;
    })
    .join("; ");

  return {
    loading, error, finished,
    questions, q, idx, setIdx,
    answers, setAnswers, checked, grading,
    options, entries, isClosed, isMulti,
    selectedKeys, gradingRow, answeredCount,
    wrongIds, chosenText, correctText, subjectSlug,
    cardsBusy, cardsNote, makeCards,
    busy, toggle, answer, finish,
  };
}
