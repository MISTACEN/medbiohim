"use client";

/**
 * Диагностикум: тренировка распознавания микропрепаратов.
 *
 * Четыре режима заданий, подсказки по уровням (каждая снижает балл) и разбор
 * ошибок после ответа. Ключ ответа остаётся на сервере — до отправки интерфейс
 * не знает правильный вариант, поэтому «подсмотреть» в разметке нечего.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, HelpCircle, Loader2, Play, RotateCcw, XCircle } from "lucide-react";
import { getTrainerImageUrl } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import {
  getDiagnosticumAttempt,
  getDiagnosticumOverview,
  requestDiagnosticumHint,
  startDiagnosticumAttempt,
  submitDiagnosticumAnswer,
  type DiagnosticumAttempt,
  type DiagnosticumHint,
  type DiagnosticumMode,
  type DiagnosticumOverview,
  type DiagnosticumResult,
} from "@/lib/diagnosticum-api";
import { PreparationGuidePanel } from "@/components/trainers/PreparationGuidePanel";
import { DiagnosticumStats } from "@/components/trainers/DiagnosticumStats";
import { srsAddTrainerCard } from "@/lib/features-api";

/**
 * Режим можно задать снаружи — так тренажёр выбирает диагностикум форматом
 * заданий, а не отдельной вкладкой. Внутренний переключатель в этом случае
 * скрывается (`showModeChips={false}`), чтобы выбор был в одном месте.
 */
type DiagnosticumRunnerProps = {
  mode?: DiagnosticumMode;
  showModeChips?: boolean;
};

/**
 * Что показываем студенту в переключателе. Остальные режимы (`identify`,
 * `structures`, `differential`, `schema`) остались в API ради старых попыток и
 * ссылок, но в интерфейсе дублируют «разбор препарата».
 */
const STUDENT_MODES: DiagnosticumMode[] = ["complex", "exam", "electronogram"];

/** Ключ sessionStorage для незавершённой экзаменационной серии. */
const EXAM_STORAGE_KEY = "mbh:diagnosticum:exam";

type SavedExam = { attemptId?: string; total?: number; index?: number; scores?: number[] };

function clearExamStorage() {
  try {
    window.sessionStorage.removeItem(EXAM_STORAGE_KEY);
  } catch {
    /* приватный режим: хранилища нет — чистить нечего */
  }
}

export function DiagnosticumRunner({ mode: controlledMode, showModeChips = true }: DiagnosticumRunnerProps = {}) {
  const [overview, setOverview] = useState<DiagnosticumOverview | null>(null);
  // `mode` — только стартовое значение: переключатель внутри раннера должен
  // реально менять режим, даже если родитель передал свой (иначе «Экзамен» и
  // «Электронограмма» оставались бы кнопками ни о чём).
  const [mode, setLocalMode] = useState<DiagnosticumMode>(controlledMode ?? "complex");
  const [section, setSection] = useState("");
  const [attempt, setAttempt] = useState<DiagnosticumAttempt | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [hints, setHints] = useState<DiagnosticumHint[]>([]);
  const [result, setResult] = useState<DiagnosticumResult | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  // Статистика не показывается сразу: это вторичный блок, и он не должен
  // удлинять экран задания. Заодно запрос статистики уходит только при
  // открытии, а не при каждом входе в тренажёр.
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsKey, setStatsKey] = useState(0);
  // Ошибка сразу уходит в повторение: препарат добавляется точечно по ключу
  // методички, а не пачкой из десяти случайных.
  const [repeatState, setRepeatState] = useState<"idle" | "busy" | "saved" | "exists">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Экзамен — серия вопросов без подсказок и без эталона до итога.
  const [exam, setExam] = useState<{ total: number; index: number; scores: number[]; finished: boolean } | null>(null);
  // Длина серии и таймер на вопрос — оставшиеся требования §7.4 концепции.
  // Оба значения живут в клиенте: сервер по-прежнему хранит отдельные попытки,
  // а не сессию, поэтому миграция БД не нужна.
  const [examLength, setExamLength] = useState(10);
  const [examTime, setExamTime] = useState(90);
  const [timeLeft, setTimeLeft] = useState(90);
  const [timedOut, setTimedOut] = useState(false);
  const EXAM_LENGTHS = [10, 20, 30] as const;
  // Серия переживает перезагрузку: ход серии — в sessionStorage, само задание
  // восстанавливается с сервера по id попытки (без ключа ответа).
  const [resumedNote, setResumedNote] = useState(false);
  const resumeTried = useRef(false);

  useEffect(() => {
    let alive = true;
    void getDiagnosticumOverview()
      .then((res) => {
        if (!alive) return;
        if (res.ok) setOverview(res.data);
        else setError(describeApiError(res.error));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Смена режима снаружи должна сбросить текущее задание, иначе останется
  // картинка и вопрос предыдущего формата.
  useEffect(() => {
    if (controlledMode) setLocalMode(controlledMode);
  }, [controlledMode]);

  useEffect(() => {
    setAttempt(null);
    setResult(null);
    setSelected({});
    setHints([]);
    setExam(null);
    setTimedOut(false);
    setRepeatState("idle");
    resumeTried.current = false;
    setResumedNote(false);
  }, [mode]);

  // Восстановление экзамена после перезагрузки. Одного раза на вход в режим
  // достаточно: дальше серия живёт в состоянии, а не в хранилище.
  useEffect(() => {
    if (resumeTried.current || mode !== "exam") return;
    resumeTried.current = true;
    let raw = "";
    try {
      raw = window.sessionStorage.getItem(EXAM_STORAGE_KEY) || "";
    } catch {
      return;
    }
    if (!raw) return;

    let saved: SavedExam | null = null;
    try {
      saved = JSON.parse(raw) as SavedExam;
    } catch {
      saved = null;
    }
    const attemptId = saved?.attemptId;
    if (!attemptId) {
      clearExamStorage();
      return;
    }

    void getDiagnosticumAttempt(attemptId).then((res) => {
      // Отвеченное задание не переигрываем и не показываем второй раз.
      if (!res.ok || res.data.answered) {
        clearExamStorage();
        return;
      }
      setAttempt(res.data);
      setExam({
        total: Number(saved?.total) || examLength,
        index: Number(saved?.index) || 1,
        scores: Array.isArray(saved?.scores) ? saved.scores : [],
        finished: false,
      });
      setTimeLeft(examTime);
      setResumedNote(true);
    });
  }, [mode, examLength, examTime]);

  // Сохраняем только активный вопрос: после ответа ждём перехода к следующему,
  // иначе после перезагрузки студент увидел бы уже отвеченное задание.
  useEffect(() => {
    if (mode !== "exam" || !attempt || !exam || exam.finished || result) return;
    try {
      window.sessionStorage.setItem(
        EXAM_STORAGE_KEY,
        JSON.stringify({
          attemptId: attempt.attempt_id,
          total: exam.total,
          index: exam.index,
          scores: exam.scores,
        }),
      );
    } catch {
      /* приватный режим: серия просто не восстановится */
    }
  }, [mode, attempt, exam, result]);

  // Итог серии — серия закончена, восстанавливать нечего.
  useEffect(() => {
    if (mode !== "exam" || !exam?.finished) return;
    clearExamStorage();
  }, [mode, exam?.finished]);

  useEffect(() => {
    const cardId = attempt?.question.image_card_id;
    if (!cardId) {
      setImageUrl(null);
      return;
    }
    let alive = true;
    setImageUrl(null);
    void getTrainerImageUrl(cardId)
      .then((url) => {
        if (alive) setImageUrl(url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [attempt?.question.image_card_id]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSelected({});
    setHints([]);
    setResult(null);
    setRepeatState("idle");
    if (mode === "exam") {
      setExam((current) =>
        current && !current.finished && current.index <= current.total
          ? current
          : { total: examLength, index: 1, scores: [], finished: false },
      );
      setTimeLeft(examTime);
      setTimedOut(false);
    } else {
      setExam(null);
    }
    try {
      const res = await startDiagnosticumAttempt({ mode, section: section || undefined });
      if (res.ok) {
        setAttempt(res.data);
      } else {
        setAttempt(null);
        setError(describeApiError(res.error));
      }
    } catch {
      setError("Не удалось получить задание");
    } finally {
      setBusy(false);
    }
  }, [mode, section, examLength, examTime]);

  const askHint = useCallback(async () => {
    if (!attempt || result) return;
    setBusy(true);
    try {
      const res = await requestDiagnosticumHint(attempt.attempt_id);
      if (res.ok) setHints((current) => [...current, res.data]);
      else setError(describeApiError(res.error));
    } finally {
      setBusy(false);
    }
  }, [attempt, result]);

  const submit = useCallback(async () => {
    if (!attempt || result) return;
    setBusy(true);
    setError(null);
    try {
      const res = await submitDiagnosticumAnswer(attempt.attempt_id, selected);
      if (res.ok) {
        setResult(res.data);
        setStatsKey((key) => key + 1);
        if (mode === "exam") {
          setExam((current) =>
            current ? { ...current, scores: [...current.scores, res.data.score] } : current,
          );
        }
      } else {
        setError(describeApiError(res.error));
      }
    } finally {
      setBusy(false);
    }
  }, [attempt, result, selected, mode]);

  /** Следующий вопрос экзамена или итог после последнего. */
  const nextExamQuestion = useCallback(async () => {
    if (!exam) return;
    if (exam.index >= exam.total) {
      setExam({ ...exam, finished: true });
      return;
    }
    setExam({ ...exam, index: exam.index + 1 });
    await start();
  }, [exam, start]);

  // Отсчёт только для активного вопроса экзамена: без результата и без итога.
  useEffect(() => {
    if (mode !== "exam" || !examTime || !attempt || result || !exam || exam.finished) return;
    const timer = window.setInterval(() => {
      setTimeLeft((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode, examTime, attempt, result, exam]);

  // Время вышло — ответ уходит автоматически с тем, что отмечено. Пустой выбор
  // тоже принимается: пропуск по времени не должен ждать студента.
  useEffect(() => {
    if (mode !== "exam" || !examTime || timeLeft > 0) return;
    if (!attempt || result || !exam || exam.finished) return;
    setTimedOut(true);
    void submit();
  }, [mode, examTime, timeLeft, attempt, result, exam, submit]);

  /** Положить разобранный препарат в очередь повторения (идемпотентно). */
  const addToRepeat = useCallback(async () => {
    const key = result?.guide_key;
    if (!key || repeatState === "busy" || repeatState === "saved" || repeatState === "exists") return;
    setRepeatState("busy");
    const res = await srsAddTrainerCard(key);
    if (!res.ok) {
      setRepeatState("idle");
      setError(describeApiError(res.error));
      return;
    }
    setRepeatState(res.data.added > 0 ? "saved" : "exists");
  }, [result?.guide_key, repeatState]);

  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const part of attempt?.question.parts ?? []) {
      for (const option of part.options) map.set(`${part.id}:${option.id}`, option.label);
    }
    return map;
  }, [attempt]);

  const toggle = (partId: string, optionId: string, kind: "single" | "multi") => {
    if (result) return;
    setSelected((current) => {
      const picked = current[partId] ?? [];
      if (kind === "single") return { ...current, [partId]: [optionId] };
      return {
        ...current,
        [partId]: picked.includes(optionId)
          ? picked.filter((id) => id !== optionId)
          : [...picked, optionId],
      };
    });
  };

  const ready = Boolean(
    attempt &&
      attempt.question.parts.every((part) => (selected[part.id] ?? []).length > 0),
  );

  const label = (partId: string, optionId: string) =>
    labels.get(`${partId}:${optionId}`) ?? optionId;

  const selectClass =
    "min-h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-semibold text-slate-700";

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        {showModeChips ? (
        <div className="flex flex-wrap gap-2">
          {(overview?.modes ?? []).filter((item) => STUDENT_MODES.includes(item.mode)).map((item) => (
            <button
              key={item.mode}
              type="button"
              onClick={() => {
                setLocalMode(item.mode);
                setAttempt(null);
                setResult(null);
              }}
              className={
                "rounded-full border px-3 py-1.5 text-sm font-semibold transition " +
                (mode === item.mode
                  ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                  : "border-[var(--border)] bg-white text-slate-600 hover:border-indigo-200")
              }
            >
              {item.title}
            </button>
          ))}
        </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={section}
            onChange={(event) => setSection(event.target.value)}
            className={selectClass}
            aria-label="Раздел"
          >
            <option value="">Все разделы</option>
            {(overview?.sections ?? []).map((item) => (
              <option key={item.section} value={item.section}>
                {item.section} · {item.total}
                {item.missing ? ` из ${item.total + item.missing}` : ""}
              </option>
            ))}
          </select>
          {mode === "exam" ? (
            <>
              <select
                value={examLength}
                onChange={(event) => setExamLength(Number(event.target.value))}
                className={selectClass}
                aria-label="Вопросов в экзамене"
              >
                {EXAM_LENGTHS.map((value) => (
                  <option key={value} value={value}>{value} вопросов</option>
                ))}
              </select>
              <select
                value={examTime}
                onChange={(event) => setExamTime(Number(event.target.value))}
                className={selectClass}
                aria-label="Время на вопрос"
              >
                <option value={0}>Без таймера</option>
                <option value={60}>60 с на вопрос</option>
                <option value={90}>90 с на вопрос</option>
              </select>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => void start()}
            disabled={busy || overview?.migrated === false}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy && !attempt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {attempt
              ? "Новое задание"
              : mode === "exam"
                ? "Начать экзамен"
                : mode === "electronogram"
                  ? "Начать электронограмму"
                  : "Начать разбор"}
          </button>
          {overview && !overview.migrated ? (
            <span className="text-xs text-slate-500">
              Диагностикум включится после применения миграции методических карточек.
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-xl bg-[var(--status-critical-bg)] px-3 py-2 text-sm text-[var(--status-critical-fg)]">
          {error}
        </p>
      ) : null}

      {attempt ? (
        <div className="card space-y-4 p-4">
          <p className="text-sm font-semibold text-slate-700">{attempt.question.prompt}</p>
          {mode === "exam" && exam ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  Экзамен · вопрос {Math.min(exam.index, exam.total)} из {exam.total}
                </p>
                {resumedNote ? (
                  <p className="text-[11px] text-slate-500">Серия продолжена с того же вопроса.</p>
                ) : null}
              </div>
              {examTime && !exam.finished && !result ? (
                <span
                  className={
                    "rounded-full px-2.5 py-1 text-xs font-bold tabular-nums " +
                    (timeLeft <= 10
                      ? "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]"
                      : "bg-slate-100 text-slate-700")
                  }
                  aria-label="Осталось времени на вопрос"
                >
                  {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-slate-50">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="Микропрепарат для диагностики"
                className="max-h-[420px] w-full object-contain"
              />
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-slate-400">
                {busy ? "Загрузка изображения…" : "Изображение недоступно"}
              </div>
            )}
          </div>

          {attempt.question.parts.map((part) => (
            <div key={part.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">{part.title}</h3>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {part.kind === "single" ? "один ответ" : "несколько ответов"}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {part.options.map((option) => {
                  const active = (selected[part.id] ?? []).includes(option.id);
                  const feedback = result?.parts?.find((item) => item.part_id === part.id);
                  const isCorrect = feedback ? !feedback.extra.includes(option.id) : false;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggle(part.id, option.id, part.kind)}
                      aria-pressed={active}
                      className={
                        "rounded-xl border px-3 py-2 text-left text-sm transition " +
                        (active
                          ? "border-indigo-400 bg-indigo-50 font-semibold text-indigo-900"
                          : "border-[var(--border)] bg-white text-slate-700 hover:border-indigo-200")
                      }
                    >
                      {option.label}
                      {result && active && isCorrect ? (
                        <CheckCircle2 className="ml-1 inline h-4 w-4 text-[var(--status-ok-fg)]" />
                      ) : null}
                      {result && active && !isCorrect ? (
                        <XCircle className="ml-1 inline h-4 w-4 text-[var(--status-critical-fg)]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {hints.length ? (
            <ul className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              {hints.map((item) => (
                <li key={item.level}>
                  <span className="font-semibold">Подсказка {item.level}.</span> {item.hint}
                </li>
              ))}
            </ul>
          ) : null}

          {result && mode !== "exam" ? (
            <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
              <p
                className={
                  "flex items-center gap-2 text-sm font-bold " +
                  (result.correct ? "text-[var(--status-ok-fg)]" : "text-[var(--status-critical-fg)]")
                }
              >
                {result.correct ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                {result.correct ? "Верно" : "Есть ошибки"} · {result.score} баллов
                {result.hints_used ? ` · подсказок: ${result.hints_used}` : ""}
              </p>
              {(result.parts ?? []).map((part) => {
                const partTitle =
                  attempt.question.parts.find((item) => item.id === part.part_id)?.title ?? part.part_id;
                return (
                <div key={part.part_id} className="text-sm text-slate-600">
                  <p
                    className={
                      "flex items-center gap-1.5 font-semibold " +
                      (part.correct ? "text-[var(--status-ok-fg)]" : "text-slate-900")
                    }
                  >
                    {part.correct ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4 text-[var(--status-critical-fg)]" />
                    )}
                    {partTitle}
                  </p>
                  {part.missing.length ? (
                    <p>
                      Не отмечено: {part.missing.map((id) => label(part.part_id, id)).join(", ")}.
                    </p>
                  ) : null}
                  {part.extra.length ? (
                    <p>
                      Лишнее: {part.extra.map((id) => label(part.part_id, id)).join(", ")}.
                    </p>
                  ) : null}
                  <p className="mt-1 text-slate-500">{part.explanation}</p>
                </div>
                );
              })}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void start()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  <RotateCcw className="h-4 w-4" /> Следующее задание
                </button>
                {/* У электронограмм методички нет — кнопка вела бы в пустоту. */}
                {result.guide_key ? (
                  <button
                    type="button"
                    onClick={() => setGuideOpen(true)}
                    className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    Методика поиска
                  </button>
                ) : null}
                {result.guide_key && !result.correct ? (
                  <button
                    type="button"
                    onClick={() => void addToRepeat()}
                    disabled={repeatState !== "idle"}
                    className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-200 disabled:opacity-60"
                  >
                    {repeatState === "busy"
                      ? "Добавляю…"
                      : repeatState === "saved"
                        ? "В повторении"
                        : repeatState === "exists"
                          ? "Уже в колоде"
                          : "В повторение"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : result && mode === "exam" && exam ? (
            <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
              {exam.finished ? (
                <>
                  <p className="text-sm font-bold text-slate-900">
                    Экзамен завершён: без ошибок {exam.scores.filter((score) => score >= 100).length} из {exam.total}
                  </p>
                  <p className="text-sm text-slate-600">
                    Средний балл: {exam.scores.length ? Math.round(exam.scores.reduce((sum, score) => sum + score, 0) / exam.scores.length) : 0}
                    {" · "}лучший: {exam.scores.length ? Math.max(...exam.scores) : 0}
                  </p>
                  <p className="text-xs text-slate-500">
                    Ошибки уже в очереди повторения, разбор и эталоны — в режиме тренировки.
                  </p>
                  <button
                    type="button"
                    onClick={() => void start()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    <RotateCcw className="h-4 w-4" /> Новый экзамен
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-slate-900">Ответ принят · {result.score} баллов</p>
                  {timedOut ? (
                    <p className="text-xs font-semibold text-[var(--status-warn-fg)]">
                      Время на вопрос вышло — ответ отправлен автоматически.
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    Вопрос {exam.index} из {exam.total}. Разбор и эталон — только после последнего вопроса.
                  </p>
                  <button
                    type="button"
                    onClick={() => void nextExamQuestion()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    {exam.index >= exam.total ? "Показать итог" : "Следующий вопрос"}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !ready}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                Ответить
              </button>
              {mode === "exam" || mode === "electronogram" ? (
                <span className="text-xs text-slate-500">
                  {mode === "exam"
                    ? "Экзамен: подсказок нет, эталон откроется только в разборе после серии."
                    : "Для электронограмм подсказок нет: методички к ним не привязаны."}
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void askHint()}
                    disabled={busy || hints.length >= attempt.hints_total}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:border-indigo-200 disabled:opacity-60"
                  >
                    <HelpCircle className="h-4 w-4" />
                    Подсказка {hints.length + 1}/{attempt.hints_total}
                  </button>
                  <span className="text-xs text-slate-400">Каждая подсказка снижает балл на 10.</span>
                </>
              )}
            </div>
          )}
        </div>
      ) : null}

      <details
        className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3"
        onToggle={(event) => setStatsOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          Мои результаты и ошибки
        </summary>
        {statsOpen ? (
          <div className="mt-3">
            <DiagnosticumStats refreshKey={statsKey} />
          </div>
        ) : null}
      </details>

      {guideOpen && result?.guide_key ? (
        <PreparationGuidePanel
          guideKey={result?.guide_key ?? ""}
          title="Методика поиска"
          onClose={() => setGuideOpen(false)}
        />
      ) : null}
    </div>
  );
}
