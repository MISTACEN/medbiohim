"use client";

/**
 * Диагностикум: тренировка распознавания микропрепаратов.
 *
 * Четыре режима заданий, подсказки по уровням (каждая снижает балл) и разбор
 * ошибок после ответа. Ключ ответа остаётся на сервере — до отправки интерфейс
 * не знает правильный вариант, поэтому «подсмотреть» в разметке нечего.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTrainerImageUrl } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import {
  finishDiagnosticumSession,
  getDiagnosticumAttempt,
  getDiagnosticumOverview,
  getDiagnosticumSession,
  startDiagnosticumSession,
  requestDiagnosticumHint,
  startDiagnosticumAttempt,
  submitDiagnosticumAnswer,
  type DiagnosticumAttempt,
  type DiagnosticumHint,
  type DiagnosticumMode,
  type DiagnosticumOverview,
  type DiagnosticumResult,
  type DiagnosticumSessionItem,
  type DiagnosticumSessionReview,
} from "@/lib/diagnosticum-api";
import { PreparationGuidePanel } from "@/components/trainers/PreparationGuidePanel";
import { DiagnosticumToolbar } from "@/components/trainers/DiagnosticumToolbar";
import { DiagnosticumImage } from "@/components/trainers/DiagnosticumImage";
import { DiagnosticumHints } from "@/components/trainers/DiagnosticumHints";
import { DiagnosticumAnswerActions } from "@/components/trainers/DiagnosticumAnswerActions";
import {
  EXAM_STORAGE_KEY,
  clearExamStorage,
  type SavedExam,
} from "@/components/trainers/diagnosticum-exam-storage";
import {
  attemptFromItem,
  reviewFromSession,
} from "@/components/trainers/diagnosticum-exam-resume";
import { DiagnosticumStatsDetails } from "@/components/trainers/DiagnosticumStatsDetails";
import { DiagnosticumPartsList } from "@/components/trainers/DiagnosticumPartsList";
import {
  DiagnosticumResultPanel,
  type DiagnosticumRepeatState,
} from "@/components/trainers/DiagnosticumResultPanel";
import {
  DiagnosticumExamProgress,
  DiagnosticumExamResult,
  type DiagnosticumExamState,
} from "@/components/trainers/DiagnosticumExamPanel";
import { srsAddTrainerCard } from "@/lib/features-api";

/**
 * Режим можно задать снаружи — так тренажёр выбирает диагностикум форматом
 * заданий, а не отдельной вкладкой. Внутренний переключатель в этом случае
 * скрывается (`showModeChips={false}`), чтобы выбор был в одном месте.
 */
type DiagnosticumRunnerProps = {
  mode?: DiagnosticumMode;
  showModeChips?: boolean;
  /**
   * Выбранные в тренажёре препараты: серия строится ровно по ним.
   * Пустой список — обычная серия по разделу.
   */
  cardIds?: string[];
};

export function DiagnosticumRunner({
  mode: controlledMode,
  showModeChips = true,
  cardIds,
}: DiagnosticumRunnerProps = {}) {
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
  const [repeatState, setRepeatState] = useState<DiagnosticumRepeatState>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Экзамен — серия вопросов без подсказок и без эталона до итога.
  const [exam, setExam] = useState<DiagnosticumExamState | null>(null);
  // Серия живёт на сервере: состав, порядок и итог приходят из
  // `/diagnosticum/sessions`, клиент хранит только номер вопроса для быстрой
  // перерисовки.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionItems, setSessionItems] = useState<DiagnosticumSessionItem[]>([]);
  const [review, setReview] = useState<DiagnosticumSessionReview | null>(null);
  // Длина серии и таймер на вопрос — требования §7.4 концепции.
  const [examLength, setExamLength] = useState(10);
  const [examTime, setExamTime] = useState(90);
  const [timeLeft, setTimeLeft] = useState(90);
  const [timedOut, setTimedOut] = useState(false);
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
    // Новая серия восстанавливается с сервера целиком: номер вопроса, ответы
    // и итог не зависят от того, что осталось в sessionStorage.
    const savedSessionId = saved?.sessionId;
    if (savedSessionId) {
      void getDiagnosticumSession(savedSessionId).then((res) => {
        if (!res.ok) {
          clearExamStorage();
          return;
        }
        const data = res.data;
        setSessionId(data.session_id);
        setSessionItems(data.items);
        if (data.status === "finished") {
          const last = data.items[data.items.length - 1];
          // Завершённая серия после перезагрузки должна показывать разбор, а не
          // пустой экран: панель итога рендерится внутри блока задания.
          if (last) setAttempt(attemptFromItem(last));
          setReview(reviewFromSession(data));
          setExam({
            total: data.total,
            index: data.total,
            scores: data.items.map((item) => Number(item.score ?? 0)),
            finished: true,
          });
          clearExamStorage();
          return;
        }
        const nextIndex = data.items.findIndex((item) => !item.answered);
        const index = nextIndex < 0 ? data.items.length - 1 : nextIndex;
        const item = data.items[index];
        if (!item) {
          clearExamStorage();
          return;
        }
        setAttempt(attemptFromItem(item));
        setExam({
          total: data.total,
          index: index + 1,
          scores: data.items.filter((entry) => entry.answered).map((entry) => Number(entry.score ?? 0)),
          finished: false,
        });
        setTimeLeft(examTime);
        setResumedNote(true);
      });
      return;
    }

    // Старый формат хранилища (до серверных серий): одна попытка без серии.
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
          sessionId: sessionId ?? undefined,
          attemptId: attempt.attempt_id,
          total: exam.total,
          index: exam.index,
          scores: exam.scores,
        } satisfies SavedExam),
      );
    } catch {
      /* приватный режим: серия просто не восстановится */
    }
  }, [mode, attempt, exam, result, sessionId]);

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
      setExam({ total: examLength, index: 1, scores: [], finished: false });
      setTimeLeft(examTime);
      setTimedOut(false);
      setReview(null);
      setSessionItems([]);
      setSessionId(null);
      try {
        const started = await startDiagnosticumSession({
          mode: "exam",
          section: section || undefined,
          length: examLength,
          timer_sec: examTime || null,
          card_ids: cardIds?.length ? cardIds : undefined,
        });
        if (!started.ok) {
          setAttempt(null);
          setError(describeApiError(started.error));
          return;
        }
        const first = started.data.items[0];
        if (!first) {
          setAttempt(null);
          setError("Сервер не собрал ни одного вопроса серии");
          return;
        }
        setSessionId(started.data.session_id);
        setSessionItems(started.data.items);
        setAttempt(attemptFromItem(first));
        setExam({ total: started.data.items.length, index: 1, scores: [], finished: false });
      } catch {
        setError("Не удалось начать серию");
      } finally {
        setBusy(false);
      }
      return;
    }
    setExam(null);
    setSessionId(null);
    setSessionItems([]);
    setReview(null);
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
  }, [mode, section, examLength, examTime, cardIds]);

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

  /** Следующий вопрос серии или её итог с разбором после последнего. */
  const nextExamQuestion = useCallback(async () => {
    if (!exam) return;
    if (exam.index >= exam.total) {
      if (!sessionId) {
        setExam({ ...exam, finished: true });
        return;
      }
      setBusy(true);
      try {
        const res = await finishDiagnosticumSession(sessionId);
        if (res.ok) {
          setReview(res.data);
          setSessionItems(res.data.items);
          setExam((current) =>
            current
              ? {
                  ...current,
                  finished: true,
                  scores: res.data.items.map((item) => Number(item.score ?? 0)),
                }
              : current,
          );
          setStatsKey((key) => key + 1);
        } else {
          setError(describeApiError(res.error));
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    const next = sessionItems[exam.index];
    if (!next) {
      setExam({ ...exam, finished: true });
      return;
    }
    setAttempt(attemptFromItem(next));
    setExam({ ...exam, index: exam.index + 1 });
    setSelected({});
    setHints([]);
    setResult(null);
    setTimeLeft(examTime);
    setTimedOut(false);
  }, [exam, examTime, sessionId, sessionItems]);

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


  return (
    <div className="space-y-4">
      <DiagnosticumToolbar
        overview={overview}
        mode={mode}
        showModeChips={showModeChips}
        onSelectMode={(next) => {
          setLocalMode(next);
          setAttempt(null);
          setResult(null);
        }}
        section={section}
        onSectionChange={setSection}
        examLength={examLength}
        examTime={examTime}
        onExamLengthChange={setExamLength}
        onExamTimeChange={setExamTime}
        busy={busy}
        attemptActive={Boolean(attempt)}
        selectedCount={cardIds?.length ?? 0}
        onStart={() => void start()}
      />

      {error ? (
        <p className="rounded-xl bg-[var(--status-critical-bg)] px-3 py-2 text-sm text-[var(--status-critical-fg)]">
          {error}
        </p>
      ) : null}

      {attempt ? (
        <div className="card space-y-4 p-4">
          <p className="text-sm font-semibold text-slate-700">{attempt.question.prompt}</p>
          {mode === "exam" && exam ? (
            <DiagnosticumExamProgress
              exam={exam}
              resumedNote={resumedNote}
              examTime={examTime}
              timeLeft={timeLeft}
              result={result}
            />
          ) : null}
          <DiagnosticumImage url={imageUrl} busy={busy} />

          <DiagnosticumPartsList
            parts={attempt.question.parts}
            selected={selected}
            result={result}
            onToggle={toggle}
          />

          <DiagnosticumHints hints={hints} />

          {result && mode !== "exam" ? (
            <DiagnosticumResultPanel
              result={result}
              parts={attempt.question.parts}
              label={label}
              repeatState={repeatState}
              onRestart={() => void start()}
              onOpenGuide={() => setGuideOpen(true)}
              onAddToRepeat={() => void addToRepeat()}
            />
          ) : result && mode === "exam" && exam ? (
            <DiagnosticumExamResult
              exam={exam}
              result={result}
              review={review}
              timedOut={timedOut}
              onRestart={() => void start()}
              onNext={() => void nextExamQuestion()}
            />
          ) : (
            <DiagnosticumAnswerActions
              mode={mode}
              busy={busy}
              ready={ready}
              hintsUsed={hints.length}
              hintsTotal={attempt.hints_total}
              onSubmit={() => void submit()}
              onHint={() => void askHint()}
            />
          )}
        </div>
      ) : null}

      <DiagnosticumStatsDetails
        open={statsOpen}
        onOpenChange={setStatsOpen}
        refreshKey={statsKey}
      />

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
