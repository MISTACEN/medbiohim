"use client";

/**
 * Состояние тренировки по банку: запуск сессии, ответы с фоновым сохранением,
 * навигация, дедлайн и финиш. Разметка — в панелях `components/test-prep`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { resolveSubjectSlug } from "@/lib/subjectSlug";
import {
  finishPreparation,
  getBankProgress,
  getPreparation,
  getSubject,
  getTest,
  preparationAiReview,
  retryPreparationGrading,
  savePreparation,
  startPreparation,
  type PreparationQuestion,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useApiRequest } from "@/hooks/useApiRequest";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { correctKeys, sameSet, selectedKeys, toggleSelection } from "@/components/test-prep/answers";
import type { Experience } from "@/components/test-prep/view";

export type PreparationMode = "full" | "count" | "sequential";

export type PreparationController = ReturnType<typeof usePreparation>;

export function usePreparation() {
  const { user, loading: authLoading } = useAuth();
  const { confirm, dialog } = useConfirm();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const [session, setSession] = useState<any>(null);
  const [questions, setQuestions] = useState<PreparationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [grading, setGrading] = useState<Record<string, any>>({});
  const [stats, setStats] = useState<any>(null);
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [ai, setAi] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<PreparationMode | null>(null);
  const [limit, setLimit] = useState(10);
  const [bankProgress, setBankProgress] = useState<any>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  // FA11: дедлайн попытки отдаёт сервер (started_at + time_limit_sec теста).
  const [nowMs, setNowMs] = useState(() => Date.now());
  const autoFinished = useRef(false);
  const subjectParam = search.get("subject") || "";
  // Возврат в предмет после тренировки, начатой из карточки модуля.
  // Принимаем только внутренний путь: `//host` и абсолютные URL отбрасываются.
  const returnHref = useMemo(() => {
    const raw = search.get("return") || "";
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : "";
  }, [search]);
  const [experience, setExperience] = useState<Experience>(
    (search.get("mode") as any) === "exam"
      ? "exam"
      : (search.get("mode") as any) === "control"
        ? "control"
        : (search.get("mode") as any) === "solve"
          ? "solve"
          : "prepare"
  );

  async function begin(m: PreparationMode, n?: number) {
    setMode(m);
    setLoading(true);
    setError("");
    // Раздел/подраздел из хаба: позиции 1-based в порядке банка (?from=1&to=144).
    const rawFrom = Number.parseInt(search.get("from") || "", 10);
    const rawTo = Number.parseInt(search.get("to") || "", 10);
    const range = Number.isFinite(rawFrom) && Number.isFinite(rawTo) && rawFrom >= 1 && rawTo >= rawFrom
      ? { from: rawFrom, to: rawTo }
      : null;
    const s = await startPreparation(id, m, m === "count" ? (n ?? limit) : undefined, user?.groupId, experience, m === "sequential" ? range : null);
    if (!s.ok) {
      setError(describeApiError(s.error));
      setLoading(false);
      return;
    }
    const d = await getPreparation(s.data.session.id);
    if (d.ok) {
      setSession(d.data.session);
      // Возобновлённая сессия приносит свои mode/experience: ссылка могла быть
      // открыта с другого устройства или из хаба с другим режимом, но прогресс
      // важнее — переключаемся на то, в чём студент реально остановился.
      const resumedMode = d.data.session?.mode;
      if (resumedMode === "full" || resumedMode === "count" || resumedMode === "sequential") {
        setMode((prev) => (prev === resumedMode ? prev : resumedMode));
      }
      const resumedExperience = d.data.session?.experience;
      if (["prepare", "solve", "exam", "control"].includes(resumedExperience) && resumedExperience !== experience) {
        setExperience(resumedExperience);
      }
      const loadedQuestions: PreparationQuestion[] = Array.isArray(d.data.questions) ? d.data.questions : [];
      setQuestions(loadedQuestions);
      // A stale session can contain an index equal to/outside the current question list
      // (for example after an interrupted/reloaded attempt). Never render a false
      // "Нет вопросов" state just because the saved cursor is out of range.
      const savedIndex = Math.max(0, Number(d.data.session.current_index) || 0);
      const safeIndex = loadedQuestions.length > 0
        ? Math.min(savedIndex, loadedQuestions.length - 1)
        : 0;
      setIdx(safeIndex);
      if ((d.data.session?.mode || m) === "sequential") {
        setMode("sequential");
        const p = await getBankProgress(id, user?.groupId);
        if (p.ok) setBankProgress(p.data);
      }
      const a: Record<string, string> = {};
      for (const x of d.data.answers || []) a[x.question_id] = x.answer_text || "";
      setAnswers(a);
      const c: Record<string, boolean> = {};
      const g: Record<string, any> = {};
      for (const x of d.data.answers || []) {
        c[x.question_id] = true;
        g[x.question_id] = x;
      }
      setChecked(c);
      setGrading(g);
    } else setError(describeApiError(d.error));
    setLoading(false);
  }

  const q = questions[idx];

  useEffect(() => {
    if (authLoading) return;
    const requested = search.get("mode");
    const flow = search.get("flow");
    if ((!requested && flow !== "sequential") || mode !== null) return;
    const n = Math.max(1, Number(search.get("count") || limit));
    setLimit(n);
    setExperience(
      requested === "exam"
        ? "exam"
        : requested === "control"
          ? "control"
          : requested === "solve"
            ? "solve"
            : "prepare",
    );
    void begin(flow === "sequential" ? "sequential" : "count", flow === "sequential" ? undefined : n);
    // The URL is the only trigger for auto-start; `begin` is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, mode, authLoading, user?.groupId]);

  const { data: meta } = useApiRequest<{ title: string; subject: string } | null>(async () => {
    const result: any = await getTest(id, user?.groupId);
    if (!result?.ok) return null;
    const test = result.data?.test || {};
    const title = String(test.title || "");
    let subject = String(test.subject_name || subjectParam || "");
    if (!subject && test.subject_id) {
      const subjectResult: any = await getSubject(String(test.subject_id));
      if (subjectResult?.ok) {
        const payload: any = subjectResult.data;
        const selected = payload?.subject || payload?.item || payload;
        subject = String(selected?.name || "");
      }
    }
    return { title, subject };
  }, [id, user?.groupId, subjectParam], { enabled: !authLoading });

  function queueSave(payload: Record<string, unknown>, onError?: (message: string) => void) {
    const task = saveQueue.current.then(async () => {
      const r = await savePreparation(session.id, payload);
      if (!r.ok) {
        onError?.(describeApiError(r.error));
      }
      return r;
    });
    saveQueue.current = task.catch(() => undefined);
    return task;
  }

  function refreshSequentialProgressOptimistic() {
    if (mode !== "sequential") return;
    setBankProgress((prev: any) => {
      if (!prev) return prev;
      const answered = Math.min(Number(prev.total ?? questions.length), Number(prev.answered ?? 0) + 1);
      return {
        ...prev,
        answered,
        remaining: Math.max(0, Number(prev.total ?? questions.length) - answered),
        completed: answered >= Number(prev.total ?? questions.length),
      };
    });
  }

  // FA11: обратный отсчёт и автофиниш. Тик раз в секунду только пока
  // есть дедлайн и попытка не завершена (статистика ещё не показана).
  const deadlineMs = session?.deadline_at ? Date.parse(String(session.deadline_at)) : null;
  const timeExpired = stats == null && deadlineMs != null && Number.isFinite(deadlineMs) && nowMs > deadlineMs;
  const remainingSec = deadlineMs != null && Number.isFinite(deadlineMs) ? Math.max(0, Math.floor((deadlineMs - nowMs) / 1000)) : null;

  useEffect(() => {
    if (deadlineMs == null || stats) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadlineMs, stats]);

  useEffect(() => {
    if (!timeExpired || autoFinished.current || !session) return;
    autoFinished.current = true;
    // Автофиниш без confirm: время вышло, выбор у студента отсутствует.
    void finish(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeExpired]);

  function answer(v: string) {
    if (!q || !session || checked[q.id] || checking[q.id] || timeExpired) return;
    const questionId = q.id;

    // Промежуточное состояние: ответ принят, но сервер ещё не сравнил его
    // с эталоном. Пока идёт проверка, интерфейс не показывает ни «верно»,
    // ни «неверно» — раньше до ответа сервера всё выглядело как ошибка.
    setAnswers((a) => ({ ...a, [questionId]: v }));
    setError("");

    // Мгновенная проверка закрытых вопросов: в снимке у вариантов есть
    // correct-флаги, поэтому вердикт и эталон считаются локально, а ответ
    // уходит на сервер фоном. Раньше здесь была пауза на round-trip
    // (Vercel → Worker → Supabase) даже для простого выбора варианта.
    const localKeys = correctKeys(q);
    const locallyGradable = experience === "prepare" && q.is_closed !== false && localKeys.length > 0;
    if (locallyGradable) {
      const given = selectedKeys(q, v);
      const okLocally = q.requires_order
        ? JSON.stringify(given) === JSON.stringify(localKeys)
        : sameSet(given, localKeys);
      setGrading((g) => ({ ...g, [questionId]: { ...(g[questionId] || {}), is_correct: okLocally, correct_keys: localKeys } }));
      setChecked((a) => ({ ...a, [questionId]: true }));
      refreshSequentialProgressOptimistic();
    } else {
      setChecking((a) => ({ ...a, [questionId]: true }));
    }

    void queueSave(
      { current_index: idx, question_id: questionId, answer_text: v, reveal: experience === "prepare" },
      (message) => {
        setChecking((a) => {
          const next = { ...a };
          delete next[questionId];
          return next;
        });
        setError("Не удалось сохранить ответ: " + message);
      },
    ).then((r) => {
      setChecking((a) => {
        const next = { ...a };
        delete next[questionId];
        return next;
      });
      if (r.ok) {
        if (r.data?.grading) setGrading((g) => ({ ...g, [questionId]: r.data.grading }));
        setChecked((a) => ({ ...a, [questionId]: true }));
        // Оптимистичный прогресс по банку уже учли при локальной проверке.
        if (!locallyGradable) refreshSequentialProgressOptimistic();
      }
    });
  }

  function next() {
    const n = Math.min(idx + 1, questions.length - 1);
    setIdx(n);
    if (session) {
      void queueSave({ current_index: n }, (message) => {
        setError("Не удалось сохранить позицию: " + message);
      });
    }
  }

  async function finish(early = false) {
    if (!session) return;
    const answered = Object.keys(checked).length;
    if (early && answered < questions.length) {
      const ok = await confirm({
        title: "Завершить досрочно?",
        description: `Отвечено ${answered} из ${questions.length}. Неотвеченные не войдут в оценку как верные.`,
        confirmLabel: "Завершить",
      });
      if (!ok) return;
    }
    setLoading(true);
    setError("");
    // Все фоновые сохранения должны попасть на сервер до финального подсчёта.
    await saveQueue.current;
    const r = await finishPreparation(session.id);
    if (r.ok) {
      setStats(r.data);
      // После завершения сервер раскрывает эталоны и правильные варианты.
      // Перечитываем сессию, иначе разбор остался бы с «пустыми» вопросами.
      const completed = await getPreparation(session.id);
      if (completed.ok) {
        setSession(completed.data.session);
        if (Array.isArray(completed.data.questions) && completed.data.questions.length) {
          setQuestions(completed.data.questions);
        }
        const nextAnswers: Record<string, string> = {};
        const nextChecked: Record<string, boolean> = {};
        const nextGrading: Record<string, any> = {};
        for (const row of completed.data.answers || []) {
          nextAnswers[row.question_id] = row.answer_text || "";
          nextChecked[row.question_id] = true;
          nextGrading[row.question_id] = row;
        }
        setAnswers(nextAnswers);
        setChecked(nextChecked);
        setGrading(nextGrading);
      }
      const a = await preparationAiReview(session.id);
      if (a.ok) setAi(a.data.review);
    } else setError(describeApiError(r.error));
    setLoading(false);
  }

  /** Exit without completing — session stays in_progress until user presses Завершить */
  async function exit() {
    if (session && !stats) {
      void queueSave({ current_index: idx });
    }
    router.push(returnHref || "/tests");
  }

  function startExperience(nextExperience: Experience, startMode: PreparationMode = "count") {
    setExperience(nextExperience);
    void begin(startMode, startMode === "count" ? limit : undefined);
  }

  function toggleOption(item: { id: string; options?: unknown }, isMulti: boolean, key: string) {
    setAnswers((prev) => ({ ...prev, [item.id]: toggleSelection(item, prev[item.id], key, isMulti) }));
  }

  async function retryGrading(questionId: string) {
    if (!session) return;
    const r = await retryPreparationGrading(session.id, questionId);
    if (r.ok && r.data?.items?.[0]) setGrading((g) => ({ ...g, [questionId]: r.data.items[0] }));
    else if (!r.ok) setError(describeApiError(r.error));
  }

  // Слаг для RAG-разбора ошибки: название предмета → канонический slug.
  const subjectSlugForAi = resolveSubjectSlug("", meta?.subject || subjectParam);

  return {
    id,
    router,
    dialog,
    meta,
    session,
    user,
    authLoading,
    questions,
    answers,
    checked,
    checking,
    grading,
    stats,
    marked,
    ai,
    loading,
    error,
    mode,
    limit,
    bankProgress,
    idx,
    q,
    experience,
    returnHref,
    remainingSec,
    timeExpired,
    subjectSlugForAi,
    setIdx,
    setMarked,
    setLimit,
    setError,
    setAnswers,
    setGrading,
    answer,
    next,
    finish,
    exit,
    startExperience,
    toggleOption,
    retryGrading,
  };
}
