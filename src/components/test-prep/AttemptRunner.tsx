"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";

import { AnswerOption } from "@/components/questions/AnswerOption";
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { ExplainWithAi } from "@/components/tests/ExplainWithAi";
import { AttemptFinished } from "./AttemptFinished";
import { optionLabel } from "./useAttemptRunner";
import type { AttemptRunnerController } from "./useAttemptRunner";

/** Экран контролируемого тестирования: вопрос, проверка ответа, навигация. */
export function AttemptRunner({ page }: { page: AttemptRunnerController }) {
  const {
    loading, error, finished,
    questions, q, idx, setIdx,
    answers, setAnswers, checked,
    entries, isClosed, isMulti,
    selectedKeys, gradingRow, answeredCount,
    chosenText, correctText, subjectSlug,
    busy, toggle, answer, finish,
  } = page;

  if (loading) return <div className="p-8 text-center text-sm text-slate-500"><Loader2 className="inline h-4 w-4 animate-spin" /> Запуск тестирования…</div>;
  if (error) return <main className="mx-auto max-w-md p-8"><div className="card p-6 text-center"><h1 className="page-title">Не удалось начать</h1><p className="mt-2 text-sm text-[var(--status-critical-fg)]">{error}</p><Link href="/tests" className="btn-secondary mt-4 inline-flex">К тестам</Link></div></main>;

  if (finished) return <AttemptFinished page={page} />;

  if (!q) return null;

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="page-title">Контролируемое тестирование</h1>
        <p className="page-subtitle">Вопрос {idx + 1} из {questions.length} · отвечено {answeredCount} · результат уйдёт преподавателю</p>
        <div className="mt-2 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-indigo-500" style={{ width: ((idx + 1) / questions.length) * 100 + "%" }} /></div>
      </header>
      <div className="card space-y-4 p-5">
        <ChemRichText text={q.text} className="text-lg font-semibold" />
        {isClosed ? (
          <div className="space-y-2">
            {entries.map(({ option, key, index }) => {
              const selected = selectedKeys.includes(key);
              const isCorrect = checked[q.id] && gradingRow?.is_correct === true && key === gradingRow?.correct_keys?.[0];
              const label = optionLabel(option);
              return (
                <AnswerOption key={key + "-" + index} as="label" variant="choice"
                  state={checked[q.id] ? (isCorrect ? "correct" : selected ? "wrong" : "idle") : selected ? "selected" : "idle"}
                  badge={key} badgeVariant="square"
                  leading={<input type={isMulti ? "checkbox" : "radio"} name={"a-" + q.id} checked={selected} disabled={checked[q.id]} onChange={() => toggle(key)} className="mt-1" />}>
                  <ChemRichText text={label} className="flex-1 space-y-1" />
                </AnswerOption>
              );
            })}
          </div>
        ) : (
          <textarea
            value={answers[q.id] || ""}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            className="min-h-32 w-full rounded-xl border p-3 text-sm"
            placeholder="Письменный ответ — уйдёт на проверку преподавателю"
            disabled={checked[q.id]}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!checked[q.id] ? (
            <button type="button" disabled={busy || !(answers[q.id] || "").trim()} onClick={() => void answer()} className="btn-primary inline-flex items-center gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Проверить ответ
            </button>
          ) : (
            <>
              {gradingRow?.is_correct === true && <span className="rounded-xl bg-[var(--status-ok-bg)] px-4 py-2 text-sm font-bold text-[var(--status-ok-fg)]">✓ Верно</span>}
              {gradingRow?.is_correct === false && <span className="rounded-xl bg-[var(--status-critical-bg)] px-4 py-2 text-sm font-bold text-[var(--status-critical-fg)]">✗ Неверно</span>}
              <button type="button" onClick={() => { if (idx < questions.length - 1) setIdx(idx + 1); else void finish(); }} className="btn-secondary">
                {idx < questions.length - 1 ? "Следующий" : "Завершить тестирование"}
              </button>
            </>
          )}
          <button type="button" disabled={idx === 0} onClick={() => setIdx(idx - 1)} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50">Назад</button>
        </div>
        {/* Пока не проверил ответ — можно спросить ИИ, что вообще спрашивают:
            он объясняет термины и варианты, но не выдаёт правильный. */}
        {!checked[q.id] && (
          <ExplainWithAi
            clarify
            question={q.text}
            options={isClosed ? entries.map(({ option }) => optionLabel(option)) : undefined}
            subjectSlug={subjectSlug || undefined}
          />
        )}
        {checked[q.id] && gradingRow?.is_correct === false && (
          <ExplainWithAi
            question={q.text}
            chosen={chosenText}
            correct={correctText}
            subjectSlug={subjectSlug || undefined}
          />
        )}
        {error && <div className="rounded-xl bg-[var(--status-critical-bg)] px-4 py-2 text-sm text-[var(--status-critical-fg)]">{error}</div>}
      </div>
    </main>
  );
}
