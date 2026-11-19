"use client";

/** Закрытый вопрос: варианты ответа, порядок и кнопка проверки. */
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { AnswerOption } from "@/components/questions/AnswerOption";
import { optionLabel, type QuestionOption } from "@/components/test-prep/answers";
import type { PreparationController } from "@/components/test-prep/usePreparation";
import type { QuestionView } from "@/components/test-prep/view";

export function ChoiceAnswer({ page, view }: { page: PreparationController; view: QuestionView }) {
  const { q, checked, experience, answer, toggleOption } = page;
  const {
    options,
    displayEntries,
    correctOptionKeys,
    isMulti,
    selectedOptionKeys,
    revealAnswers,
    partial,
    isChecking,
  } = view;

  return (
    <>
      {options.length === 0 && (
        <div className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-4 text-sm text-[var(--status-warn-fg)]">
          Это закрытый вопрос, но варианты ответа не заполнены в банке. Ответ можно дать текстом — он уйдёт на ручную проверку.
        </div>
      )}
      {displayEntries.map(({ option: o, key, index }) => {
        const label = optionLabel(o as QuestionOption);
        const selected = selectedOptionKeys.includes(key);
        const isCorrectOption = checked[q.id] && correctOptionKeys.has(key);
        const position = q.requires_order && selected ? selectedOptionKeys.indexOf(key) + 1 : null;
        return (
          <AnswerOption
            key={key + "-" + index}
            as="label"
            variant="choice"
            state={
              !revealAnswers
                ? selected
                  ? "selected"
                  : "idle"
                : isCorrectOption
                  ? "correct"
                  : selected
                    ? partial
                      ? "partial"
                      : "wrong"
                    : "idle"
            }
            badge={position ?? key}
            badgeVariant="square"
            leading={
              <input
                type={isMulti ? "checkbox" : "radio"}
                name={"q-" + q.id}
                checked={selected}
                disabled={!!checked[q.id] || isChecking}
                onChange={() => toggleOption(q, isMulti, key)}
                className="mt-1"
              />
            }
            trailing={
              isCorrectOption ? (
                <span className="rounded-full bg-[var(--status-ok-bg)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--status-ok-fg)]">эталон</span>
              ) : null
            }
          >
            <ChemRichText text={label} className="flex-1 space-y-1" />
          </AnswerOption>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!!checked[q.id] || isChecking || selectedOptionKeys.length === 0}
          onClick={() => void answer(JSON.stringify(selectedOptionKeys))}
          className="btn-primary"
        >
          {isChecking
            ? "Проверяем…"
            : experience === "prepare"
              ? isMulti
                ? "Проверить выбор"
                : "Проверить ответ"
              : isMulti
                ? "Сохранить выбор"
                : "Сохранить ответ"}
        </button>
        {q.requires_order && (
          <span className="text-xs text-[var(--muted)]">Нажимайте варианты в нужной последовательности: номер выбора появится в квадрате.</span>
        )}
      </div>
    </>
  );
}
