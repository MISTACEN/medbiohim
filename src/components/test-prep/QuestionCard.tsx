"use client";

/** Карточка текущего вопроса: текст, ввод по типу, вердикт и переходы. */
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { QuestionReport } from "@/components/QuestionReport";
import { AnswerVerdict } from "@/components/test-prep/AnswerVerdict";
import { ChoiceAnswer } from "@/components/test-prep/ChoiceAnswer";
import { ClozeAnswer, MatchAnswer, OpenAnswer } from "@/components/test-prep/OtherAnswers";
import type { PreparationController } from "@/components/test-prep/usePreparation";
import type { QuestionView } from "@/components/test-prep/view";

export function QuestionCard({ page, view }: { page: PreparationController; view: QuestionView }) {
  const { q, idx, questions, mode, experience, next, finish, setIdx } = page;

  return (
    <div className="test-question-card card space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl bg-indigo-600 px-2 text-sm font-extrabold text-white">
          {view.hideNumbers ? "—" : String(idx + 1).padStart(2, "0")}
        </span>
        <div>
          <div className="text-sm font-bold text-slate-700">
            {view.hideNumbers ? "Вопрос" : `Вопрос ${idx + 1} из ${questions.length}`}
          </div>
          <div className="text-xs text-slate-400">{mode === "sequential" ? "Последовательный проход по всему банку" : "Текущий режим прохождения"}</div>
        </div>
      </div>
      <ChemRichText text={String(q.text || q.body || "")} className="text-lg font-semibold" />

      {view.isCloze ? (
        <ClozeAnswer page={page} view={view} />
      ) : view.isMatch ? (
        <MatchAnswer page={page} view={view} />
      ) : view.isOpen ? (
        <OpenAnswer page={page} view={view} />
      ) : (
        <ChoiceAnswer page={page} view={view} />
      )}

      <QuestionReport questionId={q.id} />

      <AnswerVerdict page={page} view={view} />

      <div className="flex flex-wrap justify-between gap-2">
        <button disabled={idx === 0} onClick={() => setIdx((i) => i - 1)} className="rounded-xl border px-4 py-2">
          Назад
        </button>
        <div className="flex gap-2">
          {!view.isLast && (
            <button
              disabled={experience === "prepare" && !page.checked[q.id]}
              onClick={() => void next()}
              className="btn-primary"
            >
              Следующий
            </button>
          )}
          {view.isLast && (
            <button onClick={() => void finish(false)} className="btn-primary">
              Завершить тест
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
