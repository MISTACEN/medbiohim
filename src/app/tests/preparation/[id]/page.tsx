"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { QuestionReport } from "@/components/QuestionReport";
import { LoadingBar } from "@/components/ui/LoadingBar";
import { ChemRichText } from "@/components/chemistry/ChemRichText";
import {
  startPreparation,
  getPreparation,
  getBankProgress,
  getTest,
  getSubject,
  savePreparation,
  finishPreparation,
  preparationAiReview,
  retryPreparationGrading,
  type PreparationQuestion,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";

type QuestionOption = string | { key?: unknown; label?: unknown; correct?: boolean };

const optionLabel = (option: QuestionOption) =>
  typeof option === "string" ? option : String(option?.label ?? "");
const optionKey = (option: QuestionOption, index: number) => {
  if (typeof option === "string") return String.fromCharCode(65 + index);
  const key = option?.key;
  return key != null && String(key).trim() ? String(key) : String.fromCharCode(65 + index);
};
const optionCorrect = (option: QuestionOption) =>
  typeof option !== "string" && option?.correct === true;

function parseSelection(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
  } catch {}
  return value.trim() ? [value.trim()] : [];
}

/** Переводит и ключи (А/1), и старые текстовые ответы в канонические ключи вариантов. */
function selectedKeys(q: any, value: string | undefined): string[] {
  const options: QuestionOption[] = Array.isArray(q?.options) ? q.options : [];
  const lookup = new Map<string, string>();
  options.forEach((option, index) => {
    const key = optionKey(option, index);
    lookup.set(key.trim().toLowerCase(), key);
    lookup.set(optionLabel(option).trim().toLowerCase(), key);
    lookup.set(String(index), key);
  });
  const result: string[] = [];
  for (const token of parseSelection(value)) {
    const key = lookup.get(token.trim().toLowerCase());
    if (key && !result.includes(key)) result.push(key);
  }
  return result;
}

function correctKeys(q: any, grading?: any): string[] {
  if (Array.isArray(grading?.correct_keys) && grading.correct_keys.length) {
    return grading.correct_keys.map(String);
  }
  const options: QuestionOption[] = Array.isArray(q?.options) ? q.options : [];
  return options.flatMap((option, index) => (optionCorrect(option) ? [optionKey(option, index)] : []));
}

function sameSet(a: string[], b: string[]): boolean {
  const norm = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))).sort();
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

function answerCorrect(q: any, value: string | undefined, grading?: any): boolean {
  if (grading && grading.is_correct != null) return grading.is_correct === true;
  const expected = correctKeys(q, grading);
  if (!expected.length) return false;
  const given = selectedKeys(q, value);
  if (q?.requires_order) return JSON.stringify(given) === JSON.stringify(expected);
  return sameSet(given, expected);
}

function answerDisplay(q: any, value: string | undefined): string {
  const selected = parseSelection(value);
  if (!selected.length) return "";
  const options: QuestionOption[] = Array.isArray(q?.options) ? q.options : [];
  const keys = selectedKeys(q, value);
  if (keys.length) {
    return keys
      .map((key) => {
        const index = options.findIndex((option, i) => optionKey(option, i) === key);
        const option = index >= 0 ? options[index] : null;
        return option ? `${key}) ${optionLabel(option)}` : key;
      })
      .join("; ");
  }
  return selected.join("; ");
}

function etalonDisplay(q: any, grading?: any): string {
  const fromServer = String(q?.answer_display || grading?.answer_display || "").trim();
  if (fromServer) return fromServer;
  const options: QuestionOption[] = Array.isArray(q?.options) ? q.options : [];
  const keys = correctKeys(q, grading);
  if (keys.length) {
    return keys
      .map((key) => {
        const index = options.findIndex((option, i) => optionKey(option, i) === key);
        return index >= 0 ? `${key}) ${optionLabel(options[index])}` : key;
      })
      .join("; ");
  }
  return String(q?.answer || "").trim();
}

export default function PreparationPage() {
  const { user, loading: authLoading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const [session, setSession] = useState<any>(null);
  const [questions, setQuestions] = useState<PreparationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [grading, setGrading] = useState<Record<string, any>>({});
  const [stats, setStats] = useState<any>(null);
  const [ai, setAi] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"full" | "count" | "sequential" | null>(null);
  const [limit, setLimit] = useState(10);
  const [bankProgress, setBankProgress] = useState<any>(null);
  const [meta, setMeta] = useState<{ title: string; subject: string } | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const subjectParam = search.get("subject") || "";
  const [experience, setExperience] = useState<"prepare" | "solve" | "exam">(
    (search.get("mode") as any) === "exam"
      ? "exam"
      : (search.get("mode") as any) === "solve"
        ? "solve"
        : "prepare"
  );

  async function begin(m: "full" | "count" | "sequential", n?: number) {
    setMode(m);
    setLoading(true);
    setError("");
    const s = await startPreparation(id, m, m === "count" ? (n ?? limit) : undefined, user?.groupId);
    if (!s.ok) {
      setError(describeApiError(s.error));
      setLoading(false);
      return;
    }
    const d = await getPreparation(s.data.session.id);
    if (d.ok) {
      setSession(d.data.session);
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
      if (m === "sequential") {
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
    setExperience(requested === "exam" ? "exam" : requested === "solve" ? "solve" : "prepare");
    void begin(flow === "sequential" ? "sequential" : "count", flow === "sequential" ? undefined : n);
    // The URL is the only trigger for auto-start; `begin` is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, mode, authLoading, user?.groupId]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    void (async () => {
      const result: any = await getTest(id, user?.groupId);
      if (cancelled || !result?.ok) return;
      const test = result.data?.test || {};
      const title = String(test.title || "");
      let subject = String(test.subject_name || subjectParam || "");
      if (!subject && test.subject_id) {
        const subjectResult: any = await getSubject(String(test.subject_id));
        if (!cancelled && subjectResult?.ok) {
          const payload: any = subjectResult.data;
          const selected = payload?.subject || payload?.item || payload;
          subject = String(selected?.name || "");
        }
      }
      if (!cancelled) setMeta({ title, subject });
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [id, authLoading, user?.groupId, subjectParam]);

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

  function answer(v: string) {
    if (!q || !session || checked[q.id]) return;
    const questionId = q.id;

    // Не заставляем интерфейс ждать SpaceWeb/Vercel round-trip:
    // ответ и результат проверки отображаются сразу, сохранение идёт в фоне.
    setAnswers((a) => ({ ...a, [questionId]: v }));
    setChecked((a) => ({ ...a, [questionId]: true }));
    setError("");

    void queueSave(
      { current_index: idx, question_id: questionId, answer_text: v, reveal: experience === "prepare" },
      (message) => {
        setChecked((a) => {
          const next = { ...a };
          delete next[questionId];
          return next;
        });
        setError("Не удалось сохранить ответ: " + message);
      },
    ).then((r) => {
      if (r.ok) {
        if (r.data?.grading) setGrading((g) => ({ ...g, [questionId]: r.data.grading }));
        refreshSequentialProgressOptimistic();
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
      const ok = window.confirm(
        `Отвечено ${answered} из ${questions.length}. Завершить досрочно?\nНеотвеченные не войдут в оценку как верные.`
      );
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
    router.push("/tests");
  }

  function startExperience(next: "prepare" | "solve" | "exam", startMode: "full" | "count" | "sequential" = "count") {
    setExperience(next);
    void begin(startMode, startMode === "count" ? limit : undefined);
  }

  if (!mode)
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <LoadingBar active={loading} />
        <Link href="/tests" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline">
          ← К тестам
        </Link>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{meta?.subject || "Проверка знаний"}</p>
          <h1 className="page-title">{meta?.title || "Тест"}</h1>
          <p className="page-subtitle">Выберите режим прохождения. Настройки действуют только для этого банка.</p>
        </div>
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { id: "prepare" as const, title: "Подготовка", desc: "Проверка сразу после каждого ответа" },
            { id: "solve" as const, title: "Решение", desc: "Проверка после завершения" },
            { id: "exam" as const, title: "Экзамен", desc: "Без эталонов до конца" },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={loading}
              onClick={() => startExperience(option.id, "count")}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 disabled:opacity-50"
            >
              <span className="block font-extrabold text-slate-900">{option.title}</span>
              <span className="mt-1 block text-sm leading-5 text-[var(--muted)]">{option.desc}</span>
              <span className="mt-3 inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                {limit} случайных вопросов
              </span>
            </button>
          ))}
        </div>
        <div className="card space-y-4 p-5">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-slate-800">Сколько случайных вопросов</span>
            <input
              type="number"
              min={1}
              max={200}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
              className="w-24 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2"
            />
            <span className="text-xs text-[var(--muted)]">если вопросов в банке меньше — будут использованы все</span>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => startExperience("prepare", "sequential")}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 disabled:opacity-50"
            >
              Пройти весь банк подряд
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => startExperience("prepare", "full")}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50"
            >
              Полный тест в случайном порядке
            </button>
          </div>
        </div>
      </div>
    );

  if (loading && !session)
    return <><LoadingBar active={loading} /><div className="p-8 text-center text-sm text-slate-500">Загрузка…</div></>;

  if (stats)
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          {meta?.subject && <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{meta.subject}</p>}
          <h1 className="page-title">Тест завершён — ответы зафиксированы</h1>
          {meta?.title && <p className="mt-1 text-sm font-semibold text-slate-700">{meta.title}</p>}
          <p className="page-subtitle">
            Правильно {stats.stats?.correct ?? 0} из {stats.stats?.total ?? 0} · {stats.stats?.percent ?? 0}%.
            Изменить ответы больше нельзя, ниже — разбор.
          </p>
        </div>
        <button onClick={() => router.push("/tests")} className="btn-primary">
          К списку тестов
        </button>
        {ai && (
          <div className="card space-y-2 p-5 text-sm">
            <b>AI-разбор</b>
            <p>{String(ai.summary || "")}</p>
          </div>
        )}
        <div className="space-y-3">
          <h2 className="text-lg font-bold">Разбор вопросов</h2>
          {questions.map((qq, i) => {
            const user = answerDisplay(qq, answers[qq.id]);
            const etalon = etalonDisplay(qq, grading[qq.id]);
            const ok = checked[qq.id] && answerCorrect(qq, answers[qq.id], grading[qq.id]);
            const missed = user === "";
            return (
              <div
                key={qq.id}
                className={
                  "rounded-xl border p-4 text-sm " +
                  (ok ? "border-emerald-200 bg-emerald-50/50" : missed ? "border-slate-200 bg-white" : "border-rose-200 bg-rose-50/40")
                }
              >
                <div className="text-xs text-slate-500">Вопрос {i + 1}</div>
                <ChemRichText text={String(qq.text || qq.body || "")} className="mt-1 font-medium" />
                <div className="mt-3 space-y-1">
                  <div>
                    <span className="text-slate-500">Ваш ответ: </span>
                    {user || <span className="italic text-slate-400">нет ответа</span>}
                  </div>
                  <div>
                    <span className="text-slate-500">Правильный ответ: </span>
                    <div className="font-semibold text-emerald-800"><ChemRichText text={etalon || "—"} asHtml={qq.is_closed !== true} className="inline" /></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );

  if (!q)
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <div className="font-semibold">Не удалось загрузить вопросы сессии.</div>
          <div className="mt-1">
            {error || (questions.length === 0
              ? "Сессия создана, но API не вернул список вопросов."
              : "Сохранённая позиция вопроса была вне диапазона.")}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {questions.length > 0 && (
            <button
              type="button"
              onClick={() => setIdx(Math.min(Math.max(0, idx), questions.length - 1))}
              className="btn-primary"
            >
              Открыть вопросы
            </button>
          )}
          <button type="button" onClick={() => router.push("/tests")} className="rounded-xl border px-4 py-2 font-semibold">
            К тестам
          </button>
        </div>
      </div>
    );

  const options: QuestionOption[] = Array.isArray(q.options) ? q.options : [];
  // is_closed приходит с сервера; старые ответы API без него разбираем по типу.
  // Если закрытый вопрос остался без вариантов, даём текстовое поле, чтобы
  // вопрос вообще можно было ответить (и отправить на ручную проверку).
  const isOpen = q.is_closed == null
    ? q.type === "open" ||
      q.type === "problem" ||
      q.type === "theory" ||
      q.type === "practical" ||
      options.length === 0
    : !q.is_closed || options.length === 0;
  const serverGrading = grading[q.id];
  const correctOptionKeys = new Set(correctKeys(q, serverGrading));
  const isMulti = !isOpen && (q.allow_multiple === true || q.requires_order === true || correctOptionKeys.size > 1);
  const selectedOptionKeys = selectedKeys(q, answers[q.id]);
  const correct = serverGrading?.is_correct === true;
  const unresolved = serverGrading && serverGrading.is_correct == null;
  const answeredCount = Object.keys(checked).length;
  const isLast = idx === questions.length - 1;
  const experienceLabel = experience === "exam" ? "Экзамен" : experience === "solve" ? "Решение" : "Подготовка";
  const reference = etalonDisplay(q, serverGrading);

  function toggleOption(key: string) {
    if (checked[q.id]) return;
    setAnswers((prev) => {
      const current = selectedKeys(q, prev[q.id]);
      const next = isMulti
        ? current.includes(key)
          ? current.filter((x) => x !== key)
          : [...current, key]
        : [key];
      return { ...prev, [q.id]: JSON.stringify(next) };
    });
  }

  return (
    <div className="test-preparation-page space-y-4 sm:space-y-5">
      <LoadingBar active={loading} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {meta?.subject && (
              <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">{meta.subject}</span>
            )}
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">{experienceLabel}</span>
          </div>
          <h1 className="page-title">{meta?.title || "Тест"}</h1>
          <p className="page-subtitle">
            Вопрос {idx + 1} из {questions.length} · отвечено {answeredCount}
            {mode === "sequential" ? " · проход всего банка" : ""}
            {isOpen
              ? " · письменный ответ"
              : isMulti
                ? " · можно выбрать несколько вариантов"
                : " · выберите вариант"} · незавершённый тест сохраняется
            {" · "}
            {experience === "exam"
              ? "эталоны после завершения"
              : experience === "solve"
                ? "проверка после завершения"
                : "проверка сразу"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void finish(answeredCount < questions.length)}
            className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800"
          >
            {answeredCount < questions.length ? "Завершить досрочно" : "Завершить тест"}
          </button>
          <button type="button" onClick={() => void exit()} className="text-sm text-slate-500" title="Прогресс сохранится, тест останется незавершённым">
            Сохранить и выйти
          </button>
        </div>
      </div>

      {mode === "sequential" && bankProgress && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800">Банк: {bankProgress.answered ?? 0} / {bankProgress.total ?? questions.length}{bankProgress.completed ? " · пройден полностью" : ""}</div>}

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

      <div className="h-2 rounded bg-slate-100 sticky-progress">
        <div className="h-2 rounded bg-indigo-500" style={{ width: ((idx + 1) / questions.length) * 100 + "%" }} />
      </div>

      <div className="test-question-card card space-y-4 sm:space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl bg-indigo-600 px-2 text-sm font-extrabold text-white">
            {String(idx + 1).padStart(2, "0")}
          </span>
          <div>
            <div className="text-sm font-bold text-slate-700">Вопрос {idx + 1} из {questions.length}</div>
            <div className="text-xs text-slate-400">{mode === "sequential" ? "Последовательный проход по всему банку" : "Текущий режим прохождения"}</div>
          </div>
        </div>
        <ChemRichText text={String(q.text || q.body || "")} className="text-lg font-semibold" />

        {isOpen ? (
          <>
            <textarea
              value={answers[q.id] || ""}
              disabled={!!checked[q.id]}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              placeholder="Введите свой ответ…"
              className="min-h-40 w-full rounded-xl border p-4 text-sm outline-none focus:border-indigo-400"
            />
            <button
              disabled={!!checked[q.id] || !(answers[q.id] || "").trim()}
              onClick={() => void answer(answers[q.id] || "")}
              className="btn-primary"
            >
              {experience === "prepare" ? "Проверить ответ" : "Сохранить ответ"}
            </button>
          </>
        ) : (
          <>
            {options.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Это закрытый вопрос, но варианты ответа не заполнены в банке. Ответ можно дать текстом — он уйдёт на ручную проверку.
              </div>
            )}
            {options.map((o, i) => {
              const key = optionKey(o, i);
              const label = optionLabel(o);
              const selected = selectedOptionKeys.includes(key);
              const isCorrectOption = checked[q.id] && correctOptionKeys.has(key);
              const stateClass = checked[q.id]
                ? isCorrectOption
                  ? "border-emerald-400 bg-emerald-50"
                  : selected
                    ? "border-rose-400 bg-rose-50"
                    : "border-slate-200"
                : selected
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-slate-200 hover:bg-slate-50";
              const position = q.requires_order && selected ? selectedOptionKeys.indexOf(key) + 1 : null;
              return (
                <label
                  key={key + "-" + i}
                  className={"flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left " + stateClass}
                >
                  <input
                    type={isMulti ? "checkbox" : "radio"}
                    name={"q-" + q.id}
                    checked={selected}
                    disabled={!!checked[q.id]}
                    onChange={() => toggleOption(key)}
                    className="mt-1"
                  />
                  <span className={
                    "inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-xs font-extrabold " +
                    (isCorrectOption ? "bg-emerald-600 text-white" : selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600")
                  }>
                    {position ?? key}
                  </span>
                  <ChemRichText text={label} className="flex-1 space-y-1" />
                  {isCorrectOption && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">эталон</span>}
                </label>
              );
            })}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!!checked[q.id] || selectedOptionKeys.length === 0}
                onClick={() => void answer(JSON.stringify(selectedOptionKeys))}
                className="btn-primary"
              >
                {experience === "prepare"
                  ? isMulti
                    ? "Проверить выбор"
                    : "Проверить ответ"
                  : isMulti
                    ? "Сохранить выбор"
                    : "Сохранить ответ"}
              </button>
              {q.requires_order && (
                <span className="text-xs text-[var(--muted)]">Нажимайте варианты в нужной последовательности: номер выбора появится в квадрате.</span>
              )}
            </div>
          </>
        )}

        <QuestionReport questionId={q.id} />

        {checked[q.id] && experience === "prepare" && (
          <div className={unresolved ? "rounded-xl bg-amber-50 p-4 text-amber-800" : correct ? "rounded-xl bg-emerald-50 p-4 text-emerald-700" : "rounded-xl bg-rose-50 p-4 text-rose-700"}>
            {unresolved
              ? "↻ Ответ сохранён; автоматическая проверка по эталону невозможна"
              : correct
                ? "✓ Ответ засчитан"
                : "✗ Ответ не засчитан"}
            {serverGrading?.grading_source === "ai" ? <div className="mt-1 text-xs">Проверка смысла через ИИ</div> : null}
            {serverGrading?.grading_feedback ? <div className="mt-1 text-sm">{String(serverGrading.grading_feedback)}</div> : null}
            {reference ? (
              <div className="mt-1 text-sm">
                <span className="font-semibold">Правильный ответ: </span>
                <ChemRichText text={reference} asHtml={isOpen} className="mt-1 whitespace-pre-wrap" />
              </div>
            ) : (
              <div className="mt-1 text-sm">Эталон для этого вопроса не заполнен — ответ не считается ошибкой.</div>
            )}
            {unresolved ? (
              <button type="button" disabled={loading} onClick={() => void retryPreparationGrading(session.id, q.id).then((r) => {
                if (r.ok && r.data?.items?.[0]) setGrading((g) => ({ ...g, [q.id]: r.data.items[0] }));
                else if (!r.ok) setError(describeApiError(r.error));
              })} className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 disabled:opacity-50">
                Повторить проверку
              </button>
            ) : null}
            {isOpen && (
              <div className="mt-2 text-xs opacity-70">
                Для развёрнутых задач учитывается смысл ответа; орфографические ошибки не должны снижать результат.
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-2">
          <button disabled={idx === 0} onClick={() => setIdx((i) => i - 1)} className="rounded-xl border px-4 py-2">
            Назад
          </button>
          <div className="flex gap-2">
            {!isLast && (
              <button
                disabled={experience === "prepare" && !checked[q.id]}
                onClick={() => void next()}
                className="btn-primary"
              >
                Следующий
              </button>
            )}
            {isLast && (
              <button onClick={() => void finish(false)} className="btn-primary">
                Завершить тест
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
