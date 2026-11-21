"use client";

/**
 * Мини-тест после блока лекции: вопросы из опубликованного банка MEDBIOHIM.
 * Выделен из LectureRenderer (аудит 2026-11-22: внутри рендера жил полноценный
 * квиз-движок с API-вызовами). Эталоны сервер проверяет по одному запросу —
 * в браузер правильные варианты не передаются.
 */
import { useEffect, useState } from "react";
import { checkLectureMiniQuizAnswer, getLectureMiniQuizQuestions } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { markLectureQuizSolved, readLectureProgress } from "@/lib/lectureProgress";
import { AnswerOption } from "@/components/questions/AnswerOption";
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";

type MiniQuizSpec = { subjectId?: string; title?: string; questionIds?: string[] };
type MiniQuizQuestion = {
  id: string;
  text: string;
  type?: string;
  allow_multiple?: boolean;
  requires_order?: boolean;
  is_closed?: boolean;
  options?: Array<{ index: number; label: string }>;
};

function MiniQuizBlock({ raw, lectureId }: { raw: string; lectureId?: string }) {
  const [spec, setSpec] = useState<MiniQuizSpec>({});
  const [questions, setQuestions] = useState<MiniQuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const parsed = JSON.parse(raw) as MiniQuizSpec;
      setSpec(parsed);
      const ids = Array.isArray(parsed.questionIds) ? parsed.questionIds.filter(Boolean) : [];
      if (!parsed.subjectId || ids.length === 0) { setQuestions([]); setLoading(false); return () => { cancelled = true; }; }
      setLoading(true);
      void getLectureMiniQuizQuestions(ids, parsed.subjectId).then((r) => {
        if (cancelled) return;
        if (r.ok) {
          const byId = new Map((r.data?.items || []).map((item: MiniQuizQuestion) => [String(item.id), item]));
          const loaded = ids.map((id) => byId.get(id)).filter(Boolean) as MiniQuizQuestion[];
          setQuestions(loaded);
          if (lectureId) {
            const solved = new Set(readLectureProgress()[lectureId] ?? []);
            setScore(loaded.filter((item) => solved.has(String(item.id))).length);
          }
          setError(null);
        } else setError(describeApiError(r.error));
        setLoading(false);
      });
    } catch { setError("Мини-тест настроен некорректно."); setLoading(false); }
    return () => { cancelled = true; };
  }, [raw, lectureId]);

  const question = questions[index];
  // Вопросы банка бывают с несколькими верными вариантами: API отдаёт это
  // флагом allow_multiple, и одиночный выбор такие задания пройти не давал.
  const multiple = question?.allow_multiple === true;
  const ordering = question?.requires_order === true;

  function pick(optionIndex: number) {
    if (checked !== null || busy) return;
    setSelected((current) =>
      multiple
        ? current.includes(optionIndex)
          ? current.filter((value) => value !== optionIndex)
          : [...current, optionIndex]
        : [optionIndex]
    );
  }

  async function check() {
    if (!question || selected.length === 0 || !spec.subjectId || busy) return;
    setBusy(true);
    const r = await checkLectureMiniQuizAnswer(question.id, selected, spec.subjectId);
    if (r.ok) {
      const isCorrect = r.data?.is_correct ?? r.data?.correct;
      if (typeof isCorrect === "boolean") {
        setChecked(isCorrect);
        if (isCorrect) {
          setScore((value) => value + 1);
          if (lectureId) markLectureQuizSolved(lectureId, question.id);
        }
      } else setError("Для этого вопроса в банке нет эталонного ответа.");
    } else setError(describeApiError(r.error));
    setBusy(false);
  }

  function next() {
    if (index + 1 >= questions.length) { setIndex(questions.length); return; }
    setIndex((value) => value + 1);
    setSelected([]);
    setChecked(null);
  }

  if (loading) return <section className="my-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-indigo-800">Загружаем вопросы этого блока из банка…</section>;
  if (questions.length === 0) return <section className="my-6 rounded-2xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-4 text-sm text-[var(--status-warn-fg)]">Для этого блока в базе пока нет подходящих опубликованных вопросов.</section>;
  if (index >= questions.length) return (
    <section className="my-6 rounded-2xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-[var(--status-ok-fg)]">Блок проверен</div>
      <div className="mt-1 text-lg font-extrabold text-[var(--status-ok-fg)]">{spec.title || "Мини-тест"} · {score}/{questions.length}</div>
      <p className="mt-1 text-sm text-[var(--status-ok-fg)]">Вопросы взяты из опубликованного банка MEDBIOHIM; эталонный ответ не передаётся в браузер.</p>
      <button
        type="button"
        onClick={() => { setIndex(0); setSelected([]); setChecked(null); setScore(0); }}
        className="mt-3 rounded-xl border border-[var(--status-ok-border)] bg-white px-4 py-2 text-sm font-bold text-[var(--status-ok-fg)] transition hover:bg-[var(--status-ok-bg)]"
      >
        ↺ Пройти заново
      </button>
    </section>
  );

  return (
    <section className="my-7 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Мини-тест после блока</div><h3 className="mt-1 text-base font-extrabold text-slate-900">{spec.title || "Проверь себя"}</h3></div>
        <div className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">{index + 1}/{questions.length}</div>
      </div>
      <ChemRichText text={question.text} className="mt-4 text-sm font-semibold leading-6 text-slate-900" />
      <p className="mt-1 text-xs font-semibold text-slate-500">{multiple ? "Выберите все верные варианты" : "Выберите один вариант"}</p>
      {ordering ? (
        <div className="mt-3 rounded-xl bg-[var(--status-warn-bg)] px-3 py-2 text-xs font-semibold text-[var(--status-warn-fg)]">
          Задание на последовательность проверяется в разделе тренажёров — здесь оно идёт без оценки.
        </div>
      ) : null}
      <div className="mt-3 grid gap-2">
        {(question.options || []).map((option) => (
          <AnswerOption
            key={option.index}
            variant="button"
            state={selected.includes(option.index) ? "selected" : "idle"}
            disabled={checked !== null || busy || ordering}
            onSelect={() => pick(option.index)}
            className="hover:border-indigo-200"
          >
            <ChemRichText text={option.label} className="inline" />
          </AnswerOption>
        ))}
      </div>
      {checked !== null ? <div className={"mt-4 rounded-xl px-3 py-2.5 text-sm font-semibold " + (checked ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]")}>{checked ? "✓ Правильно" : "✕ Пока неверно — перечитай блок и попробуй ещё раз."}</div> : null}
      <div className="mt-4 flex justify-end gap-2">
        {ordering ? <button type="button" onClick={next} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Следующий вопрос</button> : checked === false ? <button type="button" onClick={() => { setSelected([]); setChecked(null); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Повторить</button> : checked === true ? <button type="button" onClick={next} className="btn-primary px-4 py-2 text-sm">Следующий вопрос</button> : <button type="button" disabled={selected.length === 0 || busy} onClick={() => void check()} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">Проверить</button>}
      </div>
      {error ? <div className="mt-3 text-xs text-[var(--status-critical-fg)]">{error}</div> : null}
    </section>
  );
}

export { MiniQuizBlock };
