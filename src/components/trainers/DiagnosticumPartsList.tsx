"use client";

/**
 * Части задания диагностикума: заголовки и варианты ответа.
 *
 * Вынесено из `DiagnosticumRunner`, чтобы раннер укладывался в лимит строк.
 * Разметка, тексты и классы перенесены как есть.
 */

import { CheckCircle2, XCircle } from "lucide-react";
import type { DiagnosticumPart, DiagnosticumResult } from "@/lib/diagnosticum-api";

type DiagnosticumPartsListProps = {
  parts: DiagnosticumPart[];
  selected: Record<string, string[]>;
  result: DiagnosticumResult | null;
  /** Части, которые сейчас отвечаются текстом: их варианты не показываем. */
  hiddenParts?: string[];
  onToggle: (partId: string, optionId: string, kind: "single" | "multi") => void;
};

export function DiagnosticumPartsList({
  parts,
  selected,
  result,
  hiddenParts = [],
  onToggle,
}: DiagnosticumPartsListProps) {
  return (
    <>
      {parts
        .filter((part) => !hiddenParts.includes(part.id))
        .map((part) => (
        <div key={part.id} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">{part.title}</h3>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {part.kind === "single" ? "один ответ" : "несколько ответов"}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {part.options.map((option) => {
              const active = (selected[part.id] ?? []).includes(option.id);
              const feedback = result?.parts?.find((item) => item.part_id === part.id);
              const isCorrect = feedback ? !feedback.extra.includes(option.id) : false;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onToggle(part.id, option.id, part.kind)}
                  aria-pressed={active}
                  className={
                    "rounded-xl border px-3 py-2 text-left text-sm transition " +
                    (active
                      ? "border-indigo-400 bg-indigo-50 font-semibold text-indigo-900"
                      : "border-[var(--border)] bg-white text-slate-700 hover:border-indigo-200")
                  }
                >
                  {option.label}
                  {result && active && isCorrect ? (
                    <CheckCircle2 className="ml-1 inline h-4 w-4 text-[var(--status-ok-fg)]" />
                  ) : null}
                  {result && active && !isCorrect ? (
                    <XCircle className="ml-1 inline h-4 w-4 text-[var(--status-critical-fg)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}