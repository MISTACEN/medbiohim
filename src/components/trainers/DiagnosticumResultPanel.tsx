"use client";

/**
 * Разбор ответа в режиме тренировки: итог, ошибки по частям и действия.
 *
 * Вынесено из `DiagnosticumRunner`, чтобы раннер укладывался в лимит строк.
 * Разметка, тексты и классы перенесены как есть.
 */

import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import type { DiagnosticumPart, DiagnosticumResult } from "@/lib/diagnosticum-api";

/** Состояние кнопки «В повторение» в раннере. */
export type DiagnosticumRepeatState = "idle" | "busy" | "saved" | "exists";

type DiagnosticumResultPanelProps = {
  result: DiagnosticumResult;
  /** Части задания — по ним восстанавливаются заголовки разбора. */
  parts: DiagnosticumPart[];
  label: (partId: string, optionId: string) => string;
  repeatState: DiagnosticumRepeatState;
  onRestart: () => void;
  onOpenGuide: () => void;
  onAddToRepeat: () => void;
};

export function DiagnosticumResultPanel({
  result,
  parts,
  label,
  repeatState,
  onRestart,
  onOpenGuide,
  onAddToRepeat,
}: DiagnosticumResultPanelProps) {
  return (
    <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
      <p
        className={
          "flex items-center gap-2 text-sm font-bold " +
          (result.correct ? "text-[var(--status-ok-fg)]" : "text-[var(--status-critical-fg)]")
        }
      >
        {result.correct ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
        {result.correct ? "Верно" : "Есть ошибки"} · {result.score} баллов
        {result.hints_used ? ` · подсказок: ${result.hints_used}` : ""}
      </p>
      {(result.parts ?? []).map((part) => {
        const partTitle =
          parts.find((item) => item.id === part.part_id)?.title ?? part.part_id;
        return (
        <div key={part.part_id} className="text-sm text-slate-600">
          <p
            className={
              "flex items-center gap-1.5 font-semibold " +
              (part.correct ? "text-[var(--status-ok-fg)]" : "text-slate-900")
            }
          >
            {part.correct ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4 text-[var(--status-critical-fg)]" />
            )}
            {partTitle}
          </p>
          {part.missing.length ? (
            <p>
              Не отмечено: {part.missing.map((id) => label(part.part_id, id)).join(", ")}.
            </p>
          ) : null}
          {part.extra.length ? (
            <p>
              Лишнее: {part.extra.map((id) => label(part.part_id, id)).join(", ")}.
            </p>
          ) : null}
          <p className="mt-1 text-slate-500">{part.explanation}</p>
        </div>
        );
      })}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <RotateCcw className="h-4 w-4" /> Следующее задание
        </button>
        {/* У электронограмм методички нет — кнопка вела бы в пустоту. */}
        {result.guide_key ? (
          <button
            type="button"
            onClick={onOpenGuide}
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            Методика поиска
          </button>
        ) : null}
        {result.guide_key && !result.correct ? (
          <button
            type="button"
            onClick={onAddToRepeat}
            disabled={repeatState !== "idle"}
            className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-200 disabled:opacity-60"
          >
            {repeatState === "busy"
              ? "Добавляю…"
              : repeatState === "saved"
                ? "В повторении"
                : repeatState === "exists"
                  ? "Уже в колоде"
                  : "В повторение"}
          </button>
        ) : null}
      </div>
    </div>
  );
}