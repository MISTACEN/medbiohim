"use client";

/** Навигатор по вопросам: отвечено / помечено / текущий. */
import type { PreparationController } from "@/components/test-prep/usePreparation";
import type { QuestionView } from "@/components/test-prep/view";

export function QuestionNavigator({ page, view }: { page: PreparationController; view: QuestionView }) {
  const { questions, checked, marked, idx, q, setIdx, setMarked } = page;

  return (
    <div className="card flex flex-wrap items-center gap-1.5 p-3">
      {questions.map((item, index) => {
        const answeredItem = Boolean(checked[item.id]);
        const markedItem = Boolean(marked[item.id]);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setIdx(index)}
            aria-label={
              view.hideNumbers
                ? "Вопрос без номера" + (markedItem ? " (помечен)" : answeredItem ? " (отвечен)" : "")
                : "Вопрос " + (index + 1) + (markedItem ? " (помечен)" : answeredItem ? " (отвечен)" : "")
            }
            className={
              "h-8 min-w-8 rounded-lg px-1.5 text-xs font-bold transition " +
              (index === idx
                ? "bg-indigo-600 text-white"
                : markedItem
                  ? "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]"
                  : answeredItem
                    ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]"
                    : "bg-slate-100 text-slate-500")
            }
          >
            {view.hideNumbers ? (markedItem ? "!" : answeredItem ? "✓" : "•") : index + 1}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setMarked((m) => ({ ...m, [q.id]: !m[q.id] }))}
        className={
          "ml-2 rounded-lg px-3 py-1.5 text-xs font-bold " +
          (marked[q.id]
            ? "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]"
            : "border text-slate-600")
        }
      >
        {marked[q.id] ? "Снять пометку" : "Пометить для возврата"}
      </button>
    </div>
  );
}
