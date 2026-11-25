"use client";

import { Pencil, X } from "lucide-react";

import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { QuestionMedia } from "@/components/test-prep/QuestionMedia";
import { AnswerOption } from "@/components/questions/AnswerOption";
import { QuestionReport } from "@/components/QuestionReport";
import { correctOf, keyOf, labelOf, type BankQuestion } from "./model";
import { QuestionEditor } from "./QuestionEditor";
import type { TestBankController } from "./useTestBank";

type Props = {
  page: TestBankController;
};

/** Секция «Все вопросы и ответы»: переключатель эталонов, фильтр по темам, список вопросов. */
export function BankQuestions({ page }: Props) {
  const {
    questions, visibleQuestions, isAdmin, topicOptions,
    topicFilter, setTopicFilter, showAnswers, setShowAnswers,
    editingId, openEditor, closeEditor,
    draft, setDraft, saveMessage, saving,
    updateDraftOption, addDraftOption, removeDraftOption, saveQuestion,
  } = page;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Все вопросы и ответы</h2>
        <button
          type="button"
          onClick={() => setShowAnswers((v) => !v)}
          className="rounded-xl border px-4 py-2 text-sm font-semibold"
        >
          {showAnswers ? "Скрыть ответы" : "Показать ответы"}
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="text-sm font-semibold text-slate-700">
          Тема занятия
          <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal sm:min-w-[320px]">
            <option value="all">Все темы</option>
            {topicOptions.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
          </select>
        </label>
        <div className="text-xs text-slate-500">Показывается {visibleQuestions.length} из {questions.length} вопросов</div>
      </div>

      <div className="mt-5 space-y-3">
        {visibleQuestions.map((q: BankQuestion, i: number) => {
          const originalIndex = questions.findIndex((item) => item.id === q.id);
          const displayNumber = originalIndex >= 0 ? originalIndex + 1 : i + 1;
          const correctOptions = q.options.filter(correctOf).map(labelOf);
          const hasStructuredAnswers = correctOptions.length > 0;
          const reference = String(q.answer_display || q.answer || "").trim();
          return (
            <article key={q.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl bg-indigo-600 px-2 text-sm font-extrabold text-white">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-semibold text-slate-500">Вопрос {displayNumber} из {questions.length}</span>
                  {q.topicTitle && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{q.topicTitle}</span>}
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => editingId === q.id ? closeEditor() : openEditor(q)}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700"
                  >
                    {editingId === q.id ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                    {editingId === q.id ? "Закрыть редактор" : "Исправить вопрос"}
                  </button>
                )}
              </div>
              <ChemRichText text={q.text} className="mt-3 font-medium" />
              <QuestionMedia media={q.media} className="mt-3 space-y-2" />

              <div className="mt-3 space-y-2">
                {q.options.map((option, oi) => {
                  const label = labelOf(option);
                  const isCorrect = correctOf(option);
                  return (
                    <AnswerOption
                      key={oi}
                      variant="row"
                      badge={keyOf(option, oi)}
                      badgeVariant="square"
                      state={showAnswers && isCorrect ? "correct" : "idle"}
                      trailing={showAnswers && isCorrect ? <span className="text-xs font-bold text-[var(--status-ok-fg)]">✓ эталон</span> : null}
                    >
                      <ChemRichText text={label} className="inline flex-1" />
                    </AnswerOption>
                  );
                })}
              </div>

              {q.is_closed && q.options.length === 0 && (
                <div className="mt-3 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">
                  Закрытый вопрос без вариантов ответа: их нужно заполнить в редакторе банка.
                </div>
              )}

              {showAnswers && reference && (
                <div className="mt-3 rounded-xl bg-[var(--status-ok-bg)] p-3 text-sm text-[var(--status-ok-fg)]">
                  <span className="font-semibold">Эталон: </span>
                  <ChemRichText text={reference} asHtml={q.is_closed !== true} className="inline" />
                  {q.is_closed && !hasStructuredAnswers && (
                    <span className="ml-2 text-xs text-[var(--status-warn-fg)]">эталон не сопоставлен с вариантами</span>
                  )}
                  {q.requires_order && <span className="ml-2 text-xs text-[var(--status-ok-fg)]">порядок вариантов</span>}
                </div>
              )}

              {!q.is_closed && q.options.length === 0 && !reference && (
                <div className="mt-3 text-xs text-slate-400">Эталон для этого вопроса пока не заполнен.</div>
              )}

              {isAdmin && editingId === q.id && draft && (
                <QuestionEditor
                  number={i + 1}
                  draft={draft}
                  setDraft={setDraft}
                  updateOption={updateDraftOption}
                  addOption={addDraftOption}
                  removeOption={removeDraftOption}
                  saveMessage={saveMessage}
                  saving={saving}
                  onSave={() => void saveQuestion()}
                  onClose={closeEditor}
                />
              )}
              <QuestionReport questionId={q.id} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
