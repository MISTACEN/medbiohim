"use client";

/** Панель конспекта: прогресс заполнения, проверка всех пропусков и сброс. */
import { CheckCircle2, Layers, RotateCcw, XCircle } from "lucide-react";
import type { LectureLearnState } from "@/components/lectures/useLectureLearn";

export function ClozeToolbar({ page }: { page: LectureLearnState }) {
  const { items, checkedCount, total, rightCount, setChecked, reset } = page;

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs">
      <span className="font-semibold">
        Заполнено: {checkedCount} из {total} · верно {rightCount}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setChecked(Object.fromEntries(items.map((_item, index) => [index, true])))}
          className="rounded-full bg-[var(--primary)] px-3 py-1.5 font-semibold text-white"
        >
          Проверить
        </button>
        <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1.5 font-semibold">
          <RotateCcw className="h-3.5 w-3.5" /> Сбросить
        </button>
      </div>
    </div>
  );
}

/** Один пропуск конспекта: поле ввода, вердикт и кнопка «В карточки». */
export function ClozeItem({ page, index }: { page: LectureLearnState; index: number }) {
  const { items, answers, setAnswers, checked, added, isRight, addToCards } = page;
  const item = items[index];
  const isChecked = checked[index] === true;
  const correct = isChecked && isRight(index);

  return (
    <li key={`${index}-${item.answer}`} className="rounded-xl border border-[var(--border)] px-3 py-2.5">
      <p className="text-sm leading-7">
        {item.before}{" "}
        <input
          value={answers[index] || ""}
          onChange={(event) => setAnswers((current) => ({ ...current, [index]: event.target.value }))}
          disabled={isChecked}
          placeholder={item.hint}
          aria-label={`Пропуск ${index + 1}`}
          className={
            "mx-1 w-40 rounded-lg border px-2 py-1 text-sm outline-none " +
            (isChecked
              ? correct
                ? "border-[var(--status-ok-fg)] bg-[var(--status-ok-bg)]"
                : "border-[var(--status-critical-fg)] bg-[var(--status-critical-bg)]"
              : "border-[var(--border)] bg-[var(--background)] focus:ring-2 focus:ring-[var(--primary)]/30")
          }
        />{" "}
        {item.after}
      </p>
      {isChecked ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          {correct ? (
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--status-ok-fg)]">
              <CheckCircle2 className="h-3.5 w-3.5" /> Верно
            </span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--status-critical-fg)]">
                <XCircle className="h-3.5 w-3.5" /> Термин: {item.answer}
              </span>
              <button
                type="button"
                onClick={() => void addToCards(index)}
                disabled={added[index]}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--primary)]/40 px-2.5 py-1 font-semibold text-[var(--primary)] disabled:opacity-50"
              >
                <Layers className="h-3 w-3" /> {added[index] ? "В карточках" : "В карточки"}
              </button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
