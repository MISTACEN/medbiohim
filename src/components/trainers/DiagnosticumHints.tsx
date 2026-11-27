"use client";

/**
 * Уже выданные подсказки задания. Вынесено из `DiagnosticumRunner` ради
 * бюджета строк: раннер не должен заниматься разметкой списков.
 */
import type { DiagnosticumHint } from "@/lib/diagnosticum-api";

export function DiagnosticumHints({ hints }: { hints: DiagnosticumHint[] }) {
  if (!hints.length) return null;
  return (
    <ul className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
      {hints.map((item) => (
        <li key={item.level}>
          <span className="font-semibold">Подсказка {item.level}.</span> {item.hint}
        </li>
      ))}
    </ul>
  );
}
