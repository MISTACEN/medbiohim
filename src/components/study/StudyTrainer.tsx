"use client";

/**
 * Тренажёр к КР: 11 электронограмм, тесты из банков, режим КР на 20 минут
 * и список ошибок. Данные — публичные JSON сайта, прогресс — localStorage.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { krGrade } from "@/lib/study/plan";

type Em = { n: number; id: string; name: string; file: string; labels: string; theory: string };
type Question = { id: string; text: string; options: string[]; correct: number | null; answer: string; bank: string };

const BANKS = [
  { key: "nerv", file: "obschaya-gistologiya.json", bank: "Нервная ткань", title: "Нервная ткань" },
  { key: "cyt", file: "citologiya-embriologiya.json", bank: "Цитология: тесты закрытого типа", title: "Цитология, закрытые" },
  { key: "open", file: "citologiya-embriologiya.json", bank: "Цитология: тесты открытого типа", title: "Цитология, открытые" },
] as const;

type BankKey = (typeof BANKS)[number]["key"];
type Mode = "em" | "test" | "kr" | "errors";
type Phase = "question" | "em" | "result";
type RunItem = { q: Question; correct: boolean | null };
type Run = { items: RunItem[]; index: number; kr: boolean; left: number; phase: Phase; byTimer: boolean; emRating: "full" | "base" | "none" | null; emIndex: number | null };

const LS_PREFIX = "study.trainer.";
const emImage = (file: string) => `/study/img/${file.replace(/\.png$/i, ".jpg")}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* приватный режим — прогресс просто не сохранится */
  }
}

function shuffle<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function clock(seconds: number): string {
  const left = Math.max(0, seconds);
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

function normalize(bank: string, questions: Array<Record<string, unknown>>): Question[] {
  return questions.flatMap((q) => {
    const options = Array.isArray(q.options) ? q.options.map((option) => String(option)) : [];
    const answerRaw = String(q.answer ?? "").trim();
    if (!answerRaw) return [];
    const correct = options.length ? Number(answerRaw) - 1 : null;
    if (correct !== null && !(correct >= 0 && correct < options.length)) return [];
    return [{
      id: `${bank}:${String(q.number)}`,
      text: String(q.text ?? ""),
      options,
      correct,
      answer: correct === null ? answerRaw : options[correct],
      bank,
    }];
  });
}

export function StudyTrainer() {
  const [mode, setModeState] = useState<Mode>("em");
  const [ems, setEms] = useState<Em[]>([]);
  const [banks, setBanks] = useState<Record<BankKey, Question[]> | null>(null);
  const [error, setError] = useState("");

  const [emOpen, setEmOpen] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [emKnow, setEmKnow] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [bank, setBank] = useState<BankKey>("nerv");
  const [count, setCount] = useState(20);
  const [run, setRun] = useState<Run | null>(null);

  /** Смена вкладки не должна показывать чужой прогон из другой вкладки. */
  const setMode = (next: Mode) => {
    setModeState(next);
    if (next !== "em") setRun(null);
  };

  useEffect(() => {
    setEmKnow(readJson<Record<string, boolean>>("emKnow", {}));
    setErrors(readJson<string[]>("errors", []));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [emJson, cyt, general] = await Promise.all([
          fetch("/content/study/electronograms.json").then((r) => r.json()),
          fetch("/content/histology/citologiya-embriologiya.json").then((r) => r.json()),
          fetch("/content/histology/obschaya-gistologiya.json").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setEms(Array.isArray(emJson) ? (emJson as Em[]) : []);
        const loaded = {} as Record<BankKey, Question[]>;
        for (const spec of BANKS) {
          const source = spec.file.startsWith("obschaya") ? general : cyt;
          const found = (source.banks ?? []).find((entry: { title?: string }) => entry.title === spec.bank);
          if (!found) throw new Error(`Не найден банк: ${spec.bank}`);
          loaded[spec.key] = normalize(spec.key, found.questions ?? []);
        }
        setBanks(loaded);
      } catch {
        if (!cancelled) setError("Не удалось загрузить материалы. Открой страницу через сайт, а не как файл.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allQuestions = useMemo(
    () => (banks ? BANKS.flatMap((spec) => banks[spec.key]) : []),
    [banks],
  );

  const byId = useMemo(() => new Map(allQuestions.map((q) => [q.id, q])), [allQuestions]);

  const saveError = useCallback((id: string, wrong: boolean) => {
    setErrors((current) => {
      const next = wrong ? [...new Set([...current, id])] : current.filter((item) => item !== id);
      writeJson("errors", next);
      return next;
    });
  }, []);

  const start = useCallback((items: Question[], kr: boolean) => {
    if (!items.length) return;
    setRun({
      items: items.map((q) => ({ q, correct: null })),
      index: 0,
      kr,
      left: kr ? 20 * 60 : 0,
      phase: "question",
      byTimer: false,
      emRating: null,
      emIndex: null,
    });
  }, []);

  const pick = useCallback(
    (ids: string[] | null, limit: number) => {
      const pool = ids ? ids.map((id) => byId.get(id)).filter((q): q is Question => Boolean(q)) : banks?.[bank] ?? [];
      return shuffle(pool).slice(0, limit === 0 ? pool.length : Math.min(limit, pool.length));
    },
    [bank, banks, byId],
  );

  const finish = useCallback((byTimer: boolean) => {
    setRun((current) => (current ? { ...current, phase: "result", byTimer, left: byTimer ? 0 : current.left } : current));
  }, []);

  useEffect(() => {
    if (!run || !run.kr || run.phase === "result") return;
    const timer = setInterval(() => {
      setRun((current) => {
        if (!current || !current.kr || current.phase === "result") return current;
        if (current.left <= 1) return { ...current, left: 0, phase: "result", byTimer: true };
        return { ...current, left: current.left - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [run?.kr, run?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (index: number) => {
    setRun((current) => {
      if (!current) return current;
      const item = current.items[current.index];
      if (!item || item.correct !== null) return current;
      const correct = index === item.q.correct;
      if (correct) saveError(item.q.id, false);
      else saveError(item.q.id, true);
      const items = current.items.slice();
      items[current.index] = { ...item, correct };
      return { ...current, items };
    });
  };

  const rateOpen = (known: boolean) => {
    setRun((current) => {
      if (!current) return current;
      const item = current.items[current.index];
      if (!item) return current;
      saveError(item.q.id, !known);
      const items = current.items.slice();
      items[current.index] = { ...item, correct: known };
      return { ...current, items };
    });
  };

  const next = () => {
    setRun((current) => {
      if (!current) return current;
      if (current.index < current.items.length - 1) return { ...current, index: current.index + 1 };
      if (!current.kr) return { ...current, phase: "result" };
      return { ...current, phase: "em", emIndex: Math.floor(Math.random() * Math.max(1, ems.length)) };
    });
  };

  const retry = () => {
    if (!run) return;
    start(pick(run.kr ? null : run.items.map((item) => item.q.id), run.items.length), run.kr);
  };

  const reveal = () => setRevealed(true);
  const markEm = (id: string) => {
    setEmKnow((current) => {
      const nextKnow = { ...current, [id]: true };
      writeJson("emKnow", nextKnow);
      return nextKnow;
    });
  };

  const current = run?.items[run.index];
  const wrong = run ? run.items.filter((item) => item.correct === false) : [];
  const missed = run ? run.items.filter((item) => item.correct === null) : [];
  const errorCount = wrong.length + (run?.kr && run.phase === "result" ? missed.length : 0);
  const bonus = Boolean(run?.kr && run.phase === "result" && !run.byTimer);
  const effective = Math.max(0, errorCount - (bonus ? 1 : 0));
  const grade = run?.kr ? (effective === 0 && run.emRating !== "full" ? 4 : krGrade(effective)) : null;

  const tabs: Array<{ id: Mode; label: string }> = [
    { id: "em", label: "Электронограммы" },
    { id: "test", label: "Тесты" },
    { id: "kr", label: "КР на время" },
    { id: "errors", label: errors.length ? `Ошибки (${errors.length})` : "Ошибки" },
  ];

  if (error) {
    return <div className="card p-6 text-sm text-[var(--status-critical-fg)]">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2" aria-label="Режимы тренажёра">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMode(tab.id)}
            aria-pressed={mode === tab.id}
            className={
              "rounded-full border px-3 py-1.5 text-sm font-semibold transition " +
              (mode === tab.id
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-[var(--border)] bg-[var(--card)] hover:border-indigo-300")
            }
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {mode === "em" && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[var(--muted)]">
                Сначала назови и подпиши по памяти, потом открой ответ. «Знаю» убирает карточку из очереди на сегодня.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--muted)]">Знаю: {ems.filter((em) => emKnow[em.id]).length} из {ems.length}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEmKnow({});
                    writeJson("emKnow", {});
                  }}
                  className="rounded-xl border px-2.5 py-1.5 text-xs font-semibold"
                >
                  Сбросить
                </button>
              </div>
            </div>

            {emOpen === null ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {ems.map((em, index) => (
                  <button
                    key={em.id}
                    type="button"
                    onClick={() => {
                      setEmOpen(index);
                      setRevealed(false);
                    }}
                    className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] text-left"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={emImage(em.file)} alt={`Электронограмма №${em.n}`} loading="lazy" className="h-24 w-full object-cover" />
                    <span className="block px-2 py-1.5 text-xs font-semibold">
                      {emKnow[em.id] ? "✓ " : ""}№{em.n}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => { setEmOpen((emOpen + ems.length - 1) % ems.length); setRevealed(false); }} className="rounded-xl border px-3 py-1.5">←</button>
                  <strong className="text-sm">Электронограмма №{ems[emOpen]?.n}</strong>
                  <button type="button" onClick={() => { setEmOpen((emOpen + 1) % ems.length); setRevealed(false); }} className="rounded-xl border px-3 py-1.5">→</button>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={emImage(ems[emOpen].file)} alt={`Электронограмма №${ems[emOpen].n}`} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-black" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={reveal} className="btn-primary text-sm">Показать название и подписи</button>
                  <button type="button" onClick={() => markEm(ems[emOpen].id)} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold">
                    <Check className="h-4 w-4" /> Знаю
                  </button>
                  <button type="button" onClick={() => setEmOpen(null)} className="rounded-xl border px-3 py-2 text-sm font-semibold">К списку</button>
                </div>
                {revealed && (
                  <div className="mt-3 rounded-xl bg-[var(--background)] p-3 text-sm">
                    <p className="font-semibold">№{ems[emOpen].n}. {ems[emOpen].name}</p>
                    <p className="mt-1 text-[var(--muted)]">{ems[emOpen].labels}</p>
                    <p className="mt-2">{ems[emOpen].theory}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {mode === "test" && (
        <div className="space-y-4">
          {!run || run.phase === "result" ? (
            <div className="card p-4">
              <p className="text-sm font-semibold">Что гоняем</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {BANKS.map((spec) => (
                  <button
                    key={spec.key}
                    type="button"
                    onClick={() => setBank(spec.key)}
                    className={"rounded-full border px-3 py-1.5 text-sm " + (bank === spec.key ? "border-indigo-600 font-semibold text-indigo-700" : "")}
                  >
                    {spec.title} ({banks?.[spec.key]?.length ?? 0})
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[10, 20, 0].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCount(value)}
                    className={"rounded-full border px-3 py-1.5 text-sm " + (count === value ? "border-indigo-600 font-semibold text-indigo-700" : "")}
                  >
                    {value === 0 ? "Все" : value}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => start(pick(null, count), false)}
                disabled={!banks}
                className="btn-primary mt-3 inline-flex items-center gap-2 text-sm disabled:opacity-50"
              >
                {banks ? "Начать" : <Loader2 className="h-4 w-4 animate-spin" />} {banks ? "" : "Загрузка…"}
              </button>
            </div>
          ) : null}
          {run && <RunCard key={current?.q.id ?? "empty"} run={run} current={current} onAnswer={answer} onRate={rateOpen} onNext={next} onRetry={retry} onErrors={() => { setMode("test"); start(pick(errors, 0), false); }} />}
        </div>
      )}

      {mode === "kr" && (
        <div className="space-y-4">
          {!run ? (
            <div className="card p-4">
              <p className="text-sm font-semibold">Как на занятии: 20 минут, тесты + одна электронограмма.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
                <li>«3» — 4–6 ошибок, «4» — 1–3, «5» — 0 + теория по электронограмме.</li>
                <li>Сдал до таймера — +0,5, он аннулирует одну ошибку.</li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {[10, 15, 20].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCount(value)}
                    className={"rounded-full border px-3 py-1.5 text-sm " + (count === value ? "border-indigo-600 font-semibold text-indigo-700" : "")}
                  >
                    {value} вопросов
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => start(pick(null, count), true)}
                disabled={!banks}
                className="btn-primary mt-3 text-sm disabled:opacity-50"
              >
                Начать КР
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="card flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                  <Clock className="h-4 w-4" /> {clock(run.left)}
                </span>
                {run.phase !== "result" && <span className="text-xs text-[var(--muted)]">Бонус +0,5 активен, пока идёт время</span>}
              </div>
              {run.phase === "question" && <RunCard key={current?.q.id ?? "empty"} run={run} current={current} onAnswer={answer} onRate={rateOpen} onNext={next} onRetry={retry} onErrors={() => { setMode("test"); start(pick(errors, 0), false); }} />}
              {run.phase === "em" && (
                <KrEm
                  em={ems[run.emIndex ?? 0]}
                  rating={run.emRating}
                  onRate={(rating) => setRun((entry) => (entry ? { ...entry, emRating: rating } : entry))}
                  onFinish={() => finish(false)}
                />
              )}
              {run.phase === "result" && (
                <Result
                  run={run}
                  wrong={wrong}
                  missed={missed}
                  errors={errorCount}
                  effective={effective}
                  bonus={bonus}
                  grade={grade}
                  onRetry={retry}
                  onErrors={() => start(pick(errors, 0), false)}
                />
              )}
            </div>
          )}
        </div>
      )}

      {mode === "errors" && (
        <div className="card p-4">
          <p className="text-sm font-semibold">Ошибки из тестов и КР</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Прогоняй, пока список не опустеет.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setMode("test"); start(pick(errors, 0), false); }}
              disabled={!errors.length}
              className="btn-primary text-sm disabled:opacity-50"
            >
              Прогнать ошибки
            </button>
            <button
              type="button"
              onClick={() => { setErrors([]); writeJson("errors", []); }}
              className="rounded-xl border px-3 py-2 text-sm font-semibold"
            >
              Очистить
            </button>
          </div>
          {errors.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {errors.slice(0, 40).map((id) => {
                const question = byId.get(id);
                if (!question) return null;
                return <li key={id}>{question.text}</li>;
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">Список пуст.</p>
          )}
        </div>
      )}
    </div>
  );
}

function RunCard({
  run,
  current,
  onAnswer,
  onRate,
  onNext,
  onRetry,
  onErrors,
}: {
  run: Run;
  current: RunItem | undefined;
  onAnswer: (index: number) => void;
  onRate: (known: boolean) => void;
  onNext: () => void;
  onRetry: () => void;
  onErrors: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (run.phase === "result") {
    return (
      <Result
        run={run}
        wrong={run.items.filter((item) => item.correct === false)}
        missed={[]}
        errors={run.items.filter((item) => item.correct === false).length}
        effective={run.items.filter((item) => item.correct === false).length}
        bonus={false}
        grade={null}
        onRetry={onRetry}
        onErrors={onErrors}
      />
    );
  }
  if (!current) return null;
  const correct = current.correct;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <span>Вопрос {run.index + 1} из {run.items.length}</span>
        {run.kr ? null : <span>{current.q.bank === "open" ? "открытый" : "закрытый"}</span>}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
        <div className="h-full bg-indigo-600" style={{ width: `${(run.index / run.items.length) * 100}%` }} />
      </div>
      <p className="mt-3 font-semibold">{current.q.text}</p>

      {current.q.options.length ? (
        <div className="mt-3 grid gap-2">
          {current.q.options.map((option, index) => {
            const isCorrect = index === current.q.correct;
            const isPicked = correct !== null && correct === isCorrect;
            return (
              <button
                key={index}
                type="button"
                onClick={() => onAnswer(index)}
                disabled={correct !== null}
                className={
                  "rounded-xl border px-3 py-2 text-left text-sm " +
                  (correct !== null && isCorrect
                    ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]"
                    : isPicked
                      ? "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]"
                      : "")
                }
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-3">
          {open ? (
            <div className="rounded-xl bg-[var(--background)] p-3 text-sm">
              <p className="font-semibold">{current.q.answer}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => onRate(true)} disabled={correct !== null} className="rounded-xl border px-3 py-1.5 text-sm">Знал</button>
                <button type="button" onClick={() => onRate(false)} disabled={correct !== null} className="rounded-xl border px-3 py-1.5 text-sm">Не знал</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setOpen(true)} className="btn-primary text-sm">Показать ответ</button>
          )}
        </div>
      )}

      {correct !== null && current.q.options.length > 0 && (
        <p className={"mt-3 text-sm font-semibold " + (correct ? "text-[var(--status-ok-fg)]" : "text-[var(--status-critical-fg)]")}>
          {correct ? "Верно" : `Ошибка. Правильный ответ: ${current.q.answer}`}
        </p>
      )}
      {correct !== null && !current.q.options.length && (
        <p className="mt-3 text-sm font-semibold">{correct ? "Зачтено" : "Добавлено в ошибки"}</p>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={correct === null}
        className="btn-primary mt-3 text-sm disabled:opacity-40"
      >
        {run.index === run.items.length - 1 ? (run.kr ? "К электронограмме →" : "Завершить") : "Далее →"}
      </button>
    </div>
  );
}

function KrEm({ em, rating, onRate, onFinish }: { em: Em | undefined; rating: Run["emRating"]; onRate: (value: "full" | "base" | "none") => void; onFinish: () => void }) {
  const [open, setOpen] = useState(false);
  if (!em) return null;
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Электронограмма</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={emImage(em.file)} alt="Электронограмма" className="mt-2 w-full rounded-xl border border-[var(--border)] bg-black" />
      <button type="button" onClick={() => setOpen(true)} className="btn-primary mt-3 text-sm">Показать название и подписи</button>
      {open && (
        <div className="mt-3 rounded-xl bg-[var(--background)] p-3 text-sm">
          <p className="font-semibold">№{em.n}. {em.name}</p>
          <p className="mt-1 text-[var(--muted)]">{em.labels}</p>
          <p className="mt-2">{em.theory}</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {([
          ["full", "Назвал + подписи + теория"],
          ["base", "Только название и подписи"],
          ["none", "Не ответил"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onRate(value)}
            className={"rounded-xl border px-3 py-1.5 text-xs font-semibold " + (rating === value ? "border-indigo-600 text-indigo-700" : "")}
          >
            {label}
          </button>
        ))}
      </div>
      <button type="button" onClick={onFinish} className="btn-primary mt-3 text-sm">Сдать работу</button>
    </div>
  );
}

function Result({
  run,
  wrong,
  missed,
  errors,
  effective,
  bonus,
  grade,
  onRetry,
  onErrors,
}: {
  run: Run;
  wrong: RunItem[];
  missed: RunItem[];
  errors: number;
  effective: number;
  bonus: boolean;
  grade: number | null;
  onRetry: () => void;
  onErrors: () => void;
}) {
  const review = [...wrong, ...missed];
  return (
    <div className="card p-4">
      <p className="text-sm text-[var(--muted)]">{run.byTimer ? "Время вышло — работа сдана автоматически." : "Работа сдана."}</p>
      <p className="mt-1 text-2xl font-extrabold">Ошибок: {errors} из {run.items.length}</p>
      {run.kr && (
        <>
          <p className="mt-2 text-sm">
            {bonus ? "+0,5 получен: одна ошибка аннулируется. " : "Бонуса нет: сдано не до таймера. "}
            С учётом бонуса ошибок: {effective}.
          </p>
          <p className="mt-2 text-2xl font-extrabold">Оценка: {grade}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {grade === 5 ? "0 ошибок + теория по электронограмме." : effective === 0 ? "Ноль ошибок, но по электронограмме не хватило теории." : "Для «5» нужен ноль ошибок + теория."}
          </p>
        </>
      )}
      {review.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold">Разобрать ошибки:</p>
          <ul className="mt-1 space-y-1 text-sm">
            {review.map((item) => (
              <li key={item.q.id}>
                {item.q.text} → <strong>{item.q.answer}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className="btn-primary inline-flex items-center gap-1.5 text-sm">
          <RotateCcw className="h-4 w-4" /> Ещё раз
        </button>
        <button type="button" onClick={onErrors} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold">
          <TriangleAlert className="h-4 w-4" /> Прогнать ошибки
        </button>
      </div>
    </div>
  );
}
