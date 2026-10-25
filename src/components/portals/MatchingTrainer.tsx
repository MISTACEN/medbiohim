"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, GraduationCap, Loader2, RotateCcw, Search, Table2, XCircle } from "lucide-react";
import {
  loadParasitologyBank,
  type PortalMatchingBank,
  type PortalMatchingTest,
} from "@/lib/portalContent";

type ExamQuestion = {
  key: string;
  prompt: string;
  options: string[];
  correct: number;
  rowLabel: string;
  columnLabel: string;
};

/** Экзамен: случайная характеристика случайного вида, варианты — с
 *  дистракторами из других строк той же колонки (как в старом портале
 *  «Паразитология»: aExam/bExam с distractorLib). */
function buildExam(test: PortalMatchingTest, count = 10): ExamQuestion[] {
  const questions: ExamQuestion[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (questions.length < Math.min(count, test.rows.length * 2) && guard < 500) {
    guard += 1;
    const rowIdx = Math.floor(Math.random() * test.rows.length);
    const colIdx = 1 + Math.floor(Math.random() * Math.max(1, test.columns.length - 1)); // без первой (ключевой) колонки
    const col = test.columns[colIdx];
    const row = test.rows[rowIdx];
    const answer = String(row[col.key] || "").trim();
    if (!answer || answer.length < 3) continue;
    const key = `${rowIdx}:${col.key}`;
    if (used.has(key)) continue;
    const distractors: string[] = [];
    const pool = test.rows.map((_, i) => i).filter((i) => i !== rowIdx);
    while (distractors.length < 3 && pool.length) {
      const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const value = String(test.rows[pick][col.key] || "").trim();
      if (value && value !== answer && !distractors.includes(value)) distractors.push(value);
    }
    if (distractors.length < 2) continue;
    const options = [answer, ...distractors];
    // перемешиваем варианты, запоминая верный
    for (let i = options.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    used.add(key);
    questions.push({
      key,
      prompt: `${row[test.columns[0].key] || row.species || "Возбудитель"} — ${col.label.toLowerCase()}?`,
      options,
      correct: options.indexOf(answer),
      rowLabel: String(row[test.columns[0].key] || ""),
      columnLabel: col.label,
    });
  }
  return questions;
}

function ExamView({ test }: { test: PortalMatchingTest }) {
  const [questions, setQuestions] = useState<ExamQuestion[]>(() => buildExam(test));
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState(false);

  const answered = Object.keys(picks).length;
  const correctCount = questions.filter((q) => picks[q.key] === q.correct).length;

  function restart() {
    setQuestions(buildExam(test));
    setPicks({});
    setChecked(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          10 случайных характеристик по таблице «{test.title}». Варианты подобраны из похожих видов.
        </p>
        <button
          type="button"
          onClick={restart}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
        >
          <RotateCcw className="size-3.5" /> Другой вариант
        </button>
      </div>

      <div className="grid gap-3">
        {questions.map((q, qi) => {
          const pick = picks[q.key];
          return (
            <article key={q.key} className="card p-4">
              <div className="text-xs text-slate-400">Вопрос {qi + 1} · {q.columnLabel}</div>
              <h3 className="mt-0.5 font-semibold text-slate-800">{q.prompt}</h3>
              <div className="mt-3 grid gap-2">
                {q.options.map((opt, oi) => {
                  let cls = "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40";
                  if (checked) {
                    if (oi === q.correct) cls = "border-emerald-300 bg-emerald-50";
                    else if (oi === pick) cls = "border-rose-300 bg-rose-50";
                    else cls = "border-slate-200 opacity-60";
                  } else if (pick === oi) {
                    cls = "border-indigo-400 bg-indigo-50";
                  }
                  return (
                    <button
                      key={oi}
                      type="button"
                      disabled={checked}
                      onClick={() => setPicks((p) => ({ ...p, [q.key]: oi }))}
                      className={"flex items-start gap-2 rounded-xl border px-3 py-2 text-left text-sm transition " + cls}
                    >
                      <span className="mt-0.5 text-xs font-bold text-slate-400">{String.fromCharCode(65 + oi)}</span>
                      <span className="flex-1">{opt}</span>
                      {checked && oi === q.correct && <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}
                      {checked && pick === oi && oi !== q.correct && <XCircle className="size-4 shrink-0 text-rose-500" />}
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white/95 p-3 shadow-lg backdrop-blur">
        <span className="text-sm font-semibold text-slate-600">
          {checked
            ? `Результат: ${correctCount} из ${questions.length}`
            : `Отвечено ${answered} из ${questions.length}`}
        </span>
        {checked ? (
          <button
            type="button"
            onClick={restart}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
          >
            Новый вариант
          </button>
        ) : (
          <button
            type="button"
            disabled={answered < questions.length}
            onClick={() => setChecked(true)}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:opacity-40"
          >
            Проверить
          </button>
        )}
      </div>
    </div>
  );
}

/** Тренажёр таблиц соответствия: колонки скрываются, ячейка открывается
 *  кликом — самопроверка по любой характеристике возбудителя. */
export default function MatchingTrainer() {
  const [bank, setBank] = useState<PortalMatchingBank | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testId, setTestId] = useState<string>("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"table" | "exam">("table");

  useEffect(() => {
    let alive = true;
    loadParasitologyBank()
      .then((b) => {
        if (!alive) return;
        setBank(b);
        if (b.tests[0]) setTestId(b.tests[0].id);
      })
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, []);

  const test: PortalMatchingTest | null = useMemo(
    () => bank?.tests.find((t) => t.id === testId) ?? null,
    [bank, testId],
  );

  const rows = useMemo(() => {
    if (!test) return [];
    const q = query.trim().toLowerCase();
    if (!q) return test.rows;
    return test.rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q)));
  }, [test, query]);

  useEffect(() => {
    setHidden(new Set());
    setRevealed(new Set());
    setQuery("");
  }, [testId]);

  if (error) return <div className="card p-5 text-sm text-rose-600">{error}</div>;
  if (!bank) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Загружаем тренажёры…
      </div>
    );
  }

  function toggleColumn(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setRevealed((rv) => new Set([...rv].filter((r) => !r.endsWith(`:${key}`))));
      } else next.add(key);
      return next;
    });
  }

  function revealCell(rowIdx: number, key: string) {
    setRevealed((prev) => new Set(prev).add(`${rowIdx}:${key}`));
  }

  function hideAllExcept(key: string) {
    setHidden(new Set(test!.columns.map((c) => c.key).filter((k) => k !== key)));
    setRevealed(new Set());
  }

  if (!test) return <div className="card p-5 text-sm text-slate-500">Тренажёр не найден.</div>;

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Table2 className="size-5 text-indigo-500" /> {bank.subject}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Выберите колонку, которую хотите проверить: её ячейки скроются, а клик по ним откроет ответ. Или пройдите экзамен с вариантами.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("table")}
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition " +
              (mode === "table" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
            }
          >
            <Table2 className="size-3.5" /> Таблица
          </button>
          <button
            type="button"
            onClick={() => setMode("exam")}
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition " +
              (mode === "exam" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
            }
          >
            <GraduationCap className="size-3.5" /> Экзамен
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {bank.tests.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTestId(t.id)}
              className={
                "rounded-full px-3 py-1.5 text-xs font-bold transition " +
                (testId === t.id ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
              }
            >
              {t.title}
            </button>
          ))}
        </div>
      </section>

      {mode === "exam" ? (
        <ExamView test={test} />
      ) : (
        <>
          <section className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-56">
                <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по таблице…"
                  className="w-full rounded-xl border bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <span className="text-xs text-slate-400">{rows.length} из {test.rows.length}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {test.columns.map((c) => {
                const isHidden = hidden.has(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleColumn(c.key)}
                    title={isHidden ? "Показать колонку" : "Скрывать колонку"}
                    className={
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition " +
                      (isHidden
                        ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200")
                    }
                  >
                    {isHidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />} {c.label}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  {test.columns.map((c) => (
                    <th key={c.key} className="px-3 py-2.5 text-xs font-bold text-slate-500">
                      <button
                        type="button"
                        onClick={() => hideAllExcept(c.key)}
                        className="hover:text-indigo-600"
                        title="Скрыть остальные колонки"
                      >
                        {c.label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const realIdx = test.rows.indexOf(row);
                  return (
                    <tr key={realIdx} className="border-b last:border-0 align-top">
                      {test.columns.map((c, ci) => {
                        const isHiddenCol = hidden.has(c.key);
                        const isOpen = !isHiddenCol || revealed.has(`${realIdx}:${c.key}`);
                        return (
                          <td key={c.key} className={"px-3 py-2.5 " + (ci === 0 ? "font-semibold text-slate-800" : "text-slate-600")}>
                            {isOpen ? (
                              <span className="whitespace-pre-wrap">{row[c.key]}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => revealCell(realIdx, c.key)}
                                className="w-full rounded-lg bg-amber-50 px-2 py-1.5 text-left text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                              >
                                Нажмите, чтобы открыть
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
