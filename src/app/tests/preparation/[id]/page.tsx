"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { QuestionReport } from "@/components/QuestionReport";
import { ChemRichText } from "@/components/chemistry/ChemRichText";
import {
  startPreparation,
  getPreparation,
  getBankProgress,
  savePreparation,
  finishPreparation,
  preparationAiReview,
  type PreparationQuestion,
} from "@/lib/api";

type QuestionOption = string | { label?: unknown; correct?: boolean };
const optionLabel = (option: QuestionOption) =>
  typeof option === "string" ? option : String(option?.label ?? "");
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

function correctLabels(q: any): string[] {
  return Array.isArray(q?.options)
    ? q.options.filter((o: QuestionOption) => optionCorrect(o)).map(optionLabel)
    : [];
}

function sameSet(a: string[], b: string[]): boolean {
  const norm = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))).sort();
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

function answerCorrect(q: any, value: string | undefined): boolean {
  const selected = parseSelection(value);
  const correct = correctLabels(q);
  if (correct.length) return selected.length > 0 && sameSet(selected, correct);
  return selected.length > 0 && selected[0].trim().toLowerCase() === String(q?.answer ?? "").trim().toLowerCase();
}

function answerDisplay(q: any, value: string | undefined): string {
  const selected = parseSelection(value);
  if (!selected.length) return "";
  return selected.join("; ");
}

export default function PreparationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const [session, setSession] = useState<any>(null);
  const [questions, setQuestions] = useState<PreparationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [stats, setStats] = useState<any>(null);
  const [ai, setAi] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"full" | "count" | "sequential" | null>(null);
  const [limit, setLimit] = useState(10);
  const [bankProgress, setBankProgress] = useState<any>(null);
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
    const s = await startPreparation(id, m, m === "count" ? (n ?? limit) : undefined);
    if (!s.ok) {
      setError(s.error.message);
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
        const p = await getBankProgress(id);
        if (p.ok) setBankProgress(p.data);
      }
      const a: Record<string, string> = {};
      for (const x of d.data.answers || []) a[x.question_id] = x.answer_text || "";
      setAnswers(a);
      const c: Record<string, boolean> = {};
      for (const x of d.data.answers || []) c[x.question_id] = x.is_correct !== null && x.is_correct !== undefined;
      setChecked(c);
    } else setError(d.error.message);
    setLoading(false);
  }

  const q = questions[idx];

  useEffect(() => {
    const requested = search.get("mode");
    const flow = search.get("flow");
    if ((!requested && flow !== "sequential") || mode !== null) return;
    const n = Math.max(1, Number(search.get("count") || limit));
    setLimit(n);
    setExperience(requested === "exam" ? "exam" : requested === "solve" ? "solve" : "prepare");
    void begin(flow === "sequential" ? "sequential" : "count", flow === "sequential" ? undefined : n);
  }, [search, mode]);

  async function refreshSequentialProgress() {
    if (mode !== "sequential") return;
    const p = await getBankProgress(id);
    if (p.ok) setBankProgress(p.data);
  }

  async function answer(v: string) {
    if (!q || checked[q.id]) return;
    setAnswers((a) => ({ ...a, [q.id]: v }));
    const r = await savePreparation(session.id, { current_index: idx, question_id: q.id, answer_text: v });
    if (r.ok) { setChecked((a) => ({ ...a, [q.id]: true })); await refreshSequentialProgress(); }
    else setError(r.error.message);
  }

  async function next() {
    const n = Math.min(idx + 1, questions.length - 1);
    setIdx(n);
    if (session) await savePreparation(session.id, { current_index: n });
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
    const r = await finishPreparation(session.id);
    if (r.ok) {
      await refreshSequentialProgress();
      setStats(r.data);
      const a = await preparationAiReview(session.id);
      if (a.ok) setAi(a.data.review);
    } else setError(r.error.message);
    setLoading(false);
  }

  /** Exit without completing — session stays in_progress until user presses Завершить */
  async function exit() {
    if (session && !stats) {
      try {
        await savePreparation(session.id, { current_index: idx });
      } catch {
        /* still leave */
      }
    }
    router.push("/tests");
  }

  if (!mode)
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          {mode === "sequential" && bankProgress && (
            <div className="mb-2 inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              Банк: {bankProgress.answered ?? 0} / {bankProgress.total ?? questions.length}
              {bankProgress.completed ? " · пройден полностью" : ""}
            </div>
          )}
          <h1 className="page-title">Гистология · проверка знаний</h1>
          <p className="page-subtitle">Выберите объём. Режим «весь банк» проходит вопросы подряд в исходном порядке и фиксирует прогресс по всему банку.</p>
        </div>
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
        <div className="card space-y-4 p-6">
          <button disabled={loading} onClick={() => void begin("sequential")} className="btn-primary w-full">
            Пройти весь банк подряд
          </button>
          <button disabled={loading} onClick={() => void begin("full")} className="rounded-xl border px-4 py-2 font-semibold w-full">
            Полный тест в случайном порядке
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={1}
              max={200}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))}
              className="w-24 rounded-xl border px-3 py-2"
            />
            <button disabled={loading} onClick={() => void begin("count", limit)} className="rounded-xl border px-4 py-2 font-semibold">
              Случайные N вопросов
            </button>
          </div>
        </div>
      </div>
    );

  if (loading && !session)
    return <div className="p-8 text-center text-sm text-slate-500">Загрузка…</div>;

  if (stats)
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h1 className="page-title">Тест завершён — ответы зафиксированы</h1>
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
            const etalon = correctLabels(qq).join("; ") || String(qq.answer || "").trim();
            const ok = checked[qq.id] && answerCorrect(qq, answers[qq.id]);
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
                    <div className="font-semibold text-emerald-800"><ChemRichText text={etalon || "—"} className="inline" /></div>
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

  const isOpen =
    q.type === "open" ||
    q.type === "problem" ||
    q.type === "theory" ||
    q.type === "practical" ||
    !Array.isArray(q.options) ||
    q.options.length === 0;
  const options: QuestionOption[] = Array.isArray(q.options) ? q.options : [];
  const correctOptionLabels = correctLabels(q);
  const isMulti = !isOpen && correctOptionLabels.length > 1;
  const selectedOptions = parseSelection(answers[q.id]);
  const correct = checked[q.id] && answerCorrect(q, answers[q.id]);
  const answeredCount = Object.keys(checked).length;
  const isLast = idx === questions.length - 1;

  function toggleOption(label: string) {
    if (checked[q.id]) return;
    setAnswers((prev) => {
      const current = parseSelection(prev[q.id]);
      const next = isMulti
        ? current.includes(label)
          ? current.filter((x) => x !== label)
          : [...current, label]
        : [label];
      return { ...prev, [q.id]: JSON.stringify(next) };
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">
            {experience === "exam" ? "Экзамен" : experience === "solve" ? "Решение" : "Подготовка"}
          </h1>
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

      <div className="h-2 rounded bg-slate-100">
        <div className="h-2 rounded bg-indigo-500" style={{ width: ((idx + 1) / questions.length) * 100 + "%" }} />
      </div>

      <div className="card space-y-5">
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
            {options.map((o, i) => {
            const label = optionLabel(o);
            const selected = selectedOptions.includes(label);
            const isCorrectOption = optionCorrect(o);
            const stateClass = checked[q.id]
              ? isCorrectOption
                ? "border-emerald-400 bg-emerald-50"
                : selected
                  ? "border-rose-400 bg-rose-50"
                  : "border-slate-200"
              : selected
                ? "border-indigo-400 bg-indigo-50"
                : "border-slate-200 hover:bg-slate-50";
            return (
              <label
                key={i}
                className={"flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left " + stateClass}
              >
                <input
                  type={isMulti ? "checkbox" : "radio"}
                  name={"q-" + q.id}
                  checked={selected}
                  disabled={!!checked[q.id]}
                  onChange={() => toggleOption(label)}
                  className="mt-0.5"
                />
                <ChemRichText text={label} className="flex-1 space-y-1" />
              </label>
            );
            })}
            <button
              type="button"
              disabled={!!checked[q.id] || selectedOptions.length === 0}
              onClick={() => void answer(JSON.stringify(selectedOptions))}
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
          </>
        )}

        <QuestionReport questionId={q.id} />

        {checked[q.id] && experience === "prepare" && (
          <div className={correct ? "rounded-xl bg-emerald-50 p-4 text-emerald-700" : "rounded-xl bg-rose-50 p-4 text-rose-700"}>
            {correct ? "✓ Ответ совпал с эталоном" : "✗ Ответ требует разбора"}
            <div className="mt-1 text-sm">Эталон: <ChemRichText text={String(q.answer || "—")} className="mt-1 whitespace-pre-wrap" /></div>
            {isOpen && (
              <div className="mt-2 text-xs opacity-70">
                Для развёрнутых задач точное совпадение не заменяет смысловую проверку; используйте эталон для самопроверки.
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
