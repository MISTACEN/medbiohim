"use client";

/**
 * Авторский предпросмотр теста (план §9.1, BACKLOG п.2).
 *
 * Преподаватель проходит свой тест в том же интерфейсе, который увидит
 * студент: те же варианты, порядок и проверка. Отличия от попытки студента:
 *  - попытка на сервере не создаётся, статистика и результаты не меняются;
 *  - проверка закрытых вопросов идёт общим детерминированным грейдером
 *    (src/lib/question-types), открытые — сверяются с эталоном вручную;
 *  - эталон виден сразу, сервер отдаёт его только teacher/admin.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, FlaskConical, Loader2 } from "lucide-react";
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { AnswerOption } from "@/components/questions/AnswerOption";
import { displayOptionEntries } from "@/components/questions/optionOrder";
import {
  gradeQuestion,
  normalizeQuestion,
  questionTypeLabelFull,
} from "@/lib/question-types";
import { testPreview, type PreviewQuestion } from "@/lib/api/teacher";
import { describeApiError } from "@/lib/errors";

type Verdict = "correct" | "wrong" | "unresolved";

function optionKey(option: PreviewQuestion["options"][number], index: number): string {
  if (typeof option !== "string" && option?.key != null && String(option.key).trim()) {
    return String(option.key);
  }
  return String.fromCharCode(65 + index);
}
function optionLabel(option: PreviewQuestion["options"][number]): string {
  return typeof option === "string" ? option : String(option?.label ?? "");
}

export default function TeacherPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [questions, setQuestions] = useState<PreviewQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [openVerdicts, setOpenVerdicts] = useState<Record<string, Verdict>>({});
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await testPreview(id);
      if (cancelled) return;
      if (result.ok) {
        setTitle(result.data.test.title);
        setSubject(result.data.test.subject_name || "");
        setQuestions(result.data.questions);
      } else {
        setError(describeApiError(result.error));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const normalized = useMemo(
    () =>
      questions.map((q) =>
        normalizeQuestion(
          { type: q.type, text: q.text, answer: q.answer || "", options: q.options },
          { reveal: true },
        ),
      ),
    [questions],
  );

  const q = questions[idx];
  const norm = normalized[idx];

  function selection(qid: string): string[] {
    const value = answers[qid];
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
    return [];
  }

  function toggleOption(key: string) {
    if (!q || revealed[q.id]) return;
    const current = selection(q.id);
    const isMulti = q.allow_multiple || q.requires_order;
    const next = isMulti
      ? current.includes(key)
        ? current.filter((x) => x !== key)
        : [...current, key]
      : [key];
    setAnswers((a) => ({ ...a, [q.id]: JSON.stringify(next) }));
  }

  function checkCurrent() {
    if (!q) return;
    setRevealed((r) => ({ ...r, [q.id]: true }));
  }

  function verdictFor(question: PreviewQuestion, index: number): Verdict {
    const given = answers[question.id];
    if (!revealed[question.id] && !given) return "unresolved";
    const outcome = gradeQuestion(normalized[index], given || null);
    if (outcome.isCorrect == null) return openVerdicts[question.id] || "unresolved";
    return outcome.isCorrect ? "correct" : "wrong";
  }

  const stats = useMemo(() => {
    const counts = { correct: 0, wrong: 0, unresolved: 0 };
    questions.forEach((question, index) => {
      counts[verdictFor(question, index)] += 1;
    });
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, answers, revealed, openVerdicts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Загрузка предпросмотра…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-4 text-sm text-[var(--status-critical-fg)]">
          {error}
        </div>
        <Link href="/teacher" className="btn-secondary inline-block">
          В кабинет
        </Link>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="card p-5 text-sm">В этом тесте нет опубликованных вопросов.</div>
        <Link href="/teacher" className="btn-secondary inline-block">
          В кабинет
        </Link>
      </div>
    );
  }

  if (finished) {
    const total = questions.length;
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Авторский предпросмотр</p>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">
            Попытка не создана, статистика не изменилась. Автопроверка: верно {stats.correct},
            неверно {stats.wrong}, без эталона/вручную {stats.unresolved} из {total}.
          </p>
        </div>
        <div className="space-y-3">
          {questions.map((question, index) => {
            const verdict = verdictFor(question, index);
            const given = selection(question.id);
            const labelOf = (key: string) => {
              const i = question.options.findIndex((o, j) => optionKey(o, j) === key);
              return i >= 0 ? `${key}) ${optionLabel(question.options[i])}` : key;
            };
            const etalonKeys = normalized[index].correctIndexes.map(String);
            return (
              <div
                key={question.id}
                className={
                  "rounded-xl border p-4 text-sm " +
                  (verdict === "correct"
                    ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]/50"
                    : verdict === "wrong"
                      ? "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]/40"
                      : "border-slate-200 bg-white")
                }
              >
                <div className="text-xs text-slate-500">
                  Вопрос {index + 1} · {questionTypeLabelFull(question.type)}
                </div>
                <ChemRichText text={question.text} className="mt-1 font-medium" />
                <div className="mt-2">
                  <span className="text-slate-500">Ответ: </span>
                  {question.is_closed ? (
                    given.length ? given.map(labelOf).join("; ") : <span className="italic text-slate-400">нет ответа</span>
                  ) : (
                    (answers[question.id] || "").trim() || <span className="italic text-slate-400">нет ответа</span>
                  )}
                </div>
                <div className="mt-1">
                  <span className="text-slate-500">Эталон: </span>
                  <span className="font-semibold text-[var(--status-ok-fg)]">
                    {question.is_closed
                      ? etalonKeys.map(labelOf).join("; ") || "—"
                      : question.answer_display || question.answer || "—"}
                  </span>
                </div>
                {question.answer_resolution ? (
                  <div className="mt-1 text-xs text-slate-500">{question.answer_resolution}</div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => {
            setAnswers({});
            setRevealed({});
            setOpenVerdicts({});
            setIdx(0);
            setFinished(false);
          }} className="btn-primary">
            Пройти заново
          </button>
          <Link href="/teacher" className="btn-secondary inline-block">
            В кабинет
          </Link>
        </div>
      </div>
    );
  }

  if (!q || !norm) return null;

  const isMulti = q.allow_multiple || q.requires_order;
  const isRevealed = revealed[q.id];
  const outcome = isRevealed ? gradeQuestion(norm, answers[q.id] || null) : null;
  const selectedKeys = selection(q.id);
  const correctKeys = new Set(norm.correctIndexes.map((i) => optionKey(q.options[i], i)));

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {subject && <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">{subject}</span>}
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-warn-bg)] px-2.5 py-1 text-xs font-bold text-[var(--status-warn-fg)]">
              <FlaskConical className="h-3 w-3" /> Предпросмотр автора — попытка не создаётся
            </span>
          </div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">Вопрос {idx + 1} из {questions.length}</p>
        </div>
        <Link href="/teacher" className="text-sm text-slate-500">
          <ArrowLeft className="mr-1 inline h-4 w-4" /> В кабинет
        </Link>
      </div>

      <div className="h-2 rounded bg-slate-100">
        <div className="h-2 rounded bg-indigo-500" style={{ width: ((idx + 1) / questions.length) * 100 + "%" }} />
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl bg-indigo-600 px-2 text-sm font-extrabold text-white">
            {String(idx + 1).padStart(2, "0")}
          </span>
          <div>
            <div className="text-sm font-bold text-slate-700">{questionTypeLabelFull(q.type)}</div>
            {q.topic_title && <div className="text-xs text-slate-400">{q.topic_title}</div>}
          </div>
        </div>
        <ChemRichText text={q.text} className="text-lg font-semibold" />

        {q.is_closed ? (
          <div className="space-y-2">
            {/* Показ перемешан как у студента; ключи — из исходного порядка. */}
            {displayOptionEntries(q, q.options, optionKey).map(({ option, key, index }) => {
              const selected = selectedKeys.includes(key);
              const isCorrectOption = isRevealed && correctKeys.has(key);
              const position = q.requires_order && selected ? selectedKeys.indexOf(key) + 1 : null;
              return (
                <AnswerOption
                  key={key + "-" + index}
                  as="label"
                  variant="choice"
                  state={
                    isRevealed
                      ? isCorrectOption
                        ? "correct"
                        : selected
                          ? "wrong"
                          : "idle"
                      : selected
                        ? "selected"
                        : "idle"
                  }
                  badge={position ?? key}
                  badgeVariant="square"
                  leading={
                    <input
                      type={isMulti ? "checkbox" : "radio"}
                      name={"preview-" + q.id}
                      checked={selected}
                      disabled={isRevealed}
                      onChange={() => toggleOption(key)}
                      className="mt-1"
                    />
                  }
                  trailing={
                    isCorrectOption ? (
                      <span className="rounded-full bg-[var(--status-ok-bg)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--status-ok-fg)]">эталон</span>
                    ) : null
                  }
                >
                  <ChemRichText text={optionLabel(option)} className="flex-1 space-y-1" />
                </AnswerOption>
              );
            })}
          </div>
        ) : (
          <textarea
            value={answers[q.id] || ""}
            disabled={isRevealed}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            placeholder="Введите ответ, чтобы сверить его с эталоном…"
            className="min-h-40 w-full rounded-xl border p-4 text-sm outline-none focus:border-indigo-400"
          />
        )}

        {isRevealed && (
          <div className="rounded-xl bg-[var(--status-ok-bg)] p-4 text-[var(--status-ok-fg)]">
            <div className="font-semibold">Эталон</div>
            <div className="mt-1">
              <ChemRichText
                text={q.is_closed
                  ? norm.correctIndexes.map((i) => optionKey(q.options[i], i)).join(", ")
                  : q.answer_display || q.answer || "—"}
                asHtml={!q.is_closed}
              />
            </div>
            {q.answer_resolution && <div className="mt-1 text-sm opacity-80">{q.answer_resolution}</div>}
            {outcome?.isCorrect == null && !q.is_closed && (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpenVerdicts((v) => ({ ...v, [q.id]: "correct" }))}
                  className="rounded-lg border border-[var(--status-ok-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--status-ok-fg)]"
                >
                  Я оцениваю ответ как верный
                </button>
                <button
                  type="button"
                  onClick={() => setOpenVerdicts((v) => ({ ...v, [q.id]: "wrong" }))}
                  className="rounded-lg border border-[var(--status-critical-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--status-critical-fg)]"
                >
                  Как неверный
                </button>
              </div>
            )}
            {outcome?.isCorrect != null && (
              <div className={"mt-2 text-sm font-semibold " + (outcome.isCorrect ? "" : "text-[var(--status-critical-fg)]")}>
                {outcome.isCorrect ? "✓ Ответ совпал с эталоном" : "✗ Ответ не совпал с эталоном"}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-2">
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => setIdx((i) => i - 1)}
            className="rounded-xl border px-4 py-2"
          >
            Назад
          </button>
          <div className="flex gap-2">
            {!isRevealed && (
              <button type="button" onClick={checkCurrent} className="btn-secondary">
                Показать эталон
              </button>
            )}
            {idx < questions.length - 1 ? (
              <button
                type="button"
                disabled={!isRevealed}
                onClick={() => setIdx((i) => i + 1)}
                className="btn-primary"
              >
                Следующий
              </button>
            ) : (
              <button type="button" disabled={!isRevealed} onClick={() => setFinished(true)} className="btn-primary">
                Завершить предпросмотр
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
