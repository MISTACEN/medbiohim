"use client";

import {
  CheckCircle2,
  ChevronLeft,
  Eye,
  EyeOff,
  Save,
  Star,
} from "lucide-react";
import { AnswerOption } from "@/components/questions/AnswerOption";
import { displayOptionEntries } from "@/components/questions/optionOrder";
import { QuestionReport } from "@/components/QuestionReport";
import type { BankQuestion } from "@/lib/api";
import { questionTypeLabel } from "@/lib/question-types";
import { subjectDisplayName } from "@/lib/subjectSlug";
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";

import {
  correctOptionIndexes,
  isChoiceQuestion,
  optionKey,
  optionText,
  referenceText,
} from "./model";

export type QuestionDetailProps = {
  selected: BankQuestion;
  activeSubjectLabel: string;
  showAnswer: boolean;
  draft: string;
  favorite: boolean;
  note: string;
  noteSaving: boolean;
  savedMessage: string | null;
  onDraft: (value: string) => void;
  onNote: (value: string) => void;
  onToggleAnswer: () => void;
  onToggleFavorite: () => void;
  onSaveNote: () => void;
  onBack: () => void;
};

/** Карточка вопроса: эталон, варианты ответа, заметка и избранное. */
export function QuestionDetail({
  selected,
  activeSubjectLabel,
  showAnswer,
  draft,
  favorite,
  note,
  noteSaving,
  savedMessage,
  onDraft,
  onNote,
  onToggleAnswer,
  onToggleFavorite,
  onSaveNote,
  onBack,
}: QuestionDetailProps) {
  return (
    <article className="card space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                {selected.subject_slug || selected.subject_name
                  ? subjectDisplayName(selected.subject_slug, selected.subject_name)
                  : activeSubjectLabel}
              </span>
              {selected.topic && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{String(selected.topic)}</span>
              )}
              {questionTypeLabel(selected.type) && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                  {questionTypeLabel(selected.type)}
                </span>
              )}
            </div>
            <h2 className="mt-2 text-lg font-extrabold leading-snug text-slate-950">
              <ChemRichText text={selected.text || selected.stem || "Вопрос"} />
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onToggleFavorite}
              className={
                "rounded-xl border p-2 " +
                (favorite
                  ? "border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]"
                  : "border-[var(--border)] bg-[var(--card)] text-slate-500 hover:text-[var(--status-warn-fg)]")
              }
              aria-label="Добавить в избранное"
              title="Избранное"
            >
              <Star className={"h-4 w-4 " + (favorite ? "fill-current" : "")} />
            </button>
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 text-slate-500 lg:hidden"
              aria-label="К списку"
              title="К списку"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>

        <QuestionReport questionId={String(selected.id)} />

        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-slate-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Моя заметка</div>
          <textarea
            value={note}
            onChange={(event) => onNote(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            placeholder="Что нужно запомнить по этому вопросу…"
          />
          <button
            type="button"
            disabled={noteSaving}
            onClick={onSaveNote}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {noteSaving ? "Сохранение…" : "Сохранить заметку"}
          </button>
          {savedMessage && <div className="text-xs font-semibold text-[var(--status-ok-fg)]">{savedMessage}</div>}
        </div>

        {isChoiceQuestion(selected) ? (
          <div className="space-y-2">
            {displayOptionEntries(selected, selected.options as any[], optionKey).map(({ option, key, index }) => {
              const isSelected = draft === String(index);
              const isCorrect = correctOptionIndexes(selected).includes(index);
              return (
                <AnswerOption
                  key={key + "-" + index}
                  variant="button"
                  state={
                    showAnswer && isCorrect
                      ? "correct"
                      : showAnswer && isSelected && !isCorrect
                        ? "wrong"
                        : isSelected
                          ? "selected"
                          : "idle"
                  }
                  onSelect={() => onDraft(String(index))}
                  badge={key}
                  trailing={
                    showAnswer && isCorrect ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--status-ok-fg)]" />
                    ) : null
                  }
                >
                  <span className="min-w-0 flex-1">{optionText(option)}</span>
                </AnswerOption>
              );
            })}
          </div>
        ) : (
          <textarea
            className="min-h-[140px] w-full rounded-xl border border-[var(--border)] p-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            placeholder="Ваш ответ (черновик)…"
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
          />
        )}

        <button
          type="button"
          className="btn-primary inline-flex items-center gap-2 text-sm"
          onClick={onToggleAnswer}
        >
          {showAnswer ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showAnswer ? "Скрыть эталон" : "Показать эталон"}
        </button>

        {showAnswer && (
          <div className="rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]/80 p-4 text-sm text-slate-800">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--status-ok-fg)]">
              Официальный ответ
            </div>
            {isChoiceQuestion(selected) && correctOptionIndexes(selected).length ? (
              <p className="whitespace-pre-wrap font-semibold">{referenceText(selected)}</p>
            ) : (
              <ChemRichText text={referenceText(selected)} asHtml />
            )}
          </div>
        )}
    </article>
  );
}
