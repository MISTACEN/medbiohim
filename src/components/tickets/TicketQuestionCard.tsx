"use client";

/** Один вопрос билета: варианты, эталон в режиме практики. */
import { Eye } from "lucide-react";
import { type BankQuestion } from "@/lib/api";
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { AnswerOption } from "@/components/questions/AnswerOption";
import { displayOptionEntries } from "@/components/questions/optionOrder";

export function TicketQuestionCard({ question, index, mode, reveal, onToggleReveal }: {
  question: BankQuestion;
  index: number;
  mode: "practice" | "exam";
  reveal: Record<string, boolean>;
  onToggleReveal: (id: string) => void;
}) {
  const qq = question;
  return (
    <li key={qq.id} className="card p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        <span>Вопрос {index + 1}</span>
        {qq.subject ? <span>· {qq.subject}</span> : null}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-slate-600">
          {qq.is_closed ? "закрытый" : "открытый"}
        </span>
      </div>
      <div className="mt-2 font-medium leading-snug">
        <ChemRichText text={String(qq.text || "")} asHtml />
      </div>
      {Array.isArray(qq.options) && qq.options.length > 0 && (
        <div className="mt-3 space-y-2">
          {displayOptionEntries(qq, qq.options as any[], (option: any, optionIndex: number) =>
            option?.key != null && String(option.key).trim()
              ? String(option.key)
              : String.fromCharCode(65 + optionIndex),
          ).map(({ option, key, index }) => {
            const isCorrect = mode === "practice" && reveal[qq.id] && option?.correct === true;
            return (
              <AnswerOption
                key={key + "-" + index}
                variant="row"
                badge={key}
                badgeVariant="square"
                state={isCorrect ? "correct" : "idle"}
              >
                <ChemRichText text={String(option?.label ?? option ?? "")} className="inline flex-1" />
              </AnswerOption>
            );
          })}
        </div>
      )}
      {mode === "practice" && (
        <div className="mt-3">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm text-indigo-600"
            onClick={() => onToggleReveal(qq.id)}
          >
            <Eye className="h-4 w-4" />
            {reveal[qq.id] ? "Скрыть эталон" : "Показать эталон"}
          </button>
          {reveal[qq.id] && (
            <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Эталон</div>
              {String(qq.answer_display || qq.answer || "").trim() ? (
                <ChemRichText text={String(qq.answer_display || qq.answer || "")} asHtml />
              ) : (
                <div className="text-[var(--status-warn-fg)]">Эталон для этого вопроса не заполнен.</div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
