"use client";

/** Вердикт по ответу: верно/частично/ошибка, эталон и пояснение кафедры. */
import { Loader2 } from "lucide-react";
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { ExplainWithAi } from "@/components/tests/ExplainWithAi";
import { answerDisplay } from "@/components/test-prep/answers";
import type { PreparationController } from "@/components/test-prep/usePreparation";
import type { QuestionView } from "@/components/test-prep/view";

export function AnswerVerdict({ page, view }: { page: PreparationController; view: QuestionView }) {
  const { q, answers, checked, experience, loading, meta, subjectSlugForAi, retryGrading } = page;
  const {
    serverGrading,
    staleAnswer,
    unresolved,
    correct,
    partial,
    isOpen,
    isChecking,
    reference,
  } = view;
  const reveal = checked[q.id] && experience === "prepare";

  return (
    <>
      {isChecking && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-semibold text-indigo-900">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Проверяем ответ…
          </span>
          <div className="mt-1 text-xs font-normal opacity-70">Ответ сравнивается с эталоном на сервере.</div>
        </div>
      )}

      {reveal && (
        <div className={staleAnswer ? "rounded-xl bg-[var(--status-warn-bg)] p-4 text-[var(--status-warn-fg)]" : unresolved ? "rounded-xl bg-[var(--status-warn-bg)] p-4 text-[var(--status-warn-fg)]" : correct ? "rounded-xl bg-[var(--status-ok-bg)] p-4 text-[var(--status-ok-fg)]" : partial ? "rounded-xl bg-[var(--status-warn-bg)] p-4 text-[var(--status-warn-fg)]" : "rounded-xl bg-[var(--status-critical-bg)] p-4 text-[var(--status-critical-fg)]"}>
          {staleAnswer
            ? "↻ Ответ сохранён до исправления банка: варианты изменились, перепроверьте вопрос"
            : unresolved
            ? "↻ Ответ сохранён; автоматическая проверка по эталону невозможна"
            : correct
              ? "✓ Ответ засчитан"
              : partial
                ? "◐ Частично верно: выбрана часть эталонных вариантов"
                : "✗ Ответ не засчитан"}
          {serverGrading?.grading_source === "ai" ? <div className="mt-1 text-xs">Проверка смысла через ИИ</div> : null}
          {serverGrading?.grading_feedback ? <div className="mt-1 text-sm">{String(serverGrading.grading_feedback)}</div> : null}
          {reference ? (
            <div className="mt-1 text-sm">
              <span className="font-semibold">Правильный ответ: </span>
              <ChemRichText text={reference} asHtml={isOpen} className="mt-1 whitespace-pre-wrap" />
            </div>
          ) : (
            <div className="mt-1 text-sm">Эталон для этого вопроса не заполнен — ответ не считается ошибкой.</div>
          )}
          {unresolved ? (
            <button type="button" disabled={loading} onClick={() => void retryGrading(q.id)} className="mt-2 rounded-lg border border-[var(--status-warn-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--status-warn-fg)] disabled:opacity-50">
              Повторить проверку
            </button>
          ) : null}
          {isOpen && (
            <div className="mt-2 text-xs opacity-70">
              Для развёрнутых задач учитывается смысл ответа; орфографические ошибки не должны снижать результат.
            </div>
          )}
          {q.explanation ? (
            <div className="mt-3 rounded-xl bg-white/70 p-3 text-left">
              <div className="text-xs font-bold uppercase tracking-wide opacity-70">Пояснение кафедры</div>
              <ChemRichText text={String(q.explanation)} className="mt-1 space-y-1" />
            </div>
          ) : null}
        </div>
      )}

      {/* Разбор ошибки в один клик: тот же компонент, что в старом раннере. */}
      {reveal && !unresolved && !isOpen && !correct && (
        <ExplainWithAi
          question={String(q.text || q.body || "")}
          chosen={answerDisplay(q, answers[q.id])}
          correct={reference}
          subjectSlug={subjectSlugForAi || undefined}
          subjectName={meta?.subject || undefined}
        />
      )}
    </>
  );
}
