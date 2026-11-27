"use client";

/**
 * Выбор вариантов в задании диагностикума: состояние, подписи и переключение.
 *
 * Вынесено из `DiagnosticumRunner`, чтобы раннер укладывался в лимит строк.
 * Правило прежнее: `single` заменяет выбор, `multi` добавляет и снимает.
 */
import { useMemo, useState } from "react";
import type { DiagnosticumAttempt } from "@/lib/diagnosticum-api";

export function useDiagnosticumSelection(attempt: DiagnosticumAttempt | null) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const part of attempt?.question.parts ?? []) {
      for (const option of part.options) map.set(`${part.id}:${option.id}`, option.label);
    }
    return map;
  }, [attempt]);

  const toggle = (partId: string, optionId: string, kind: "single" | "multi") => {
    setSelected((current) => {
      const picked = current[partId] ?? [];
      if (kind === "single") return { ...current, [partId]: [optionId] };
      return {
        ...current,
        [partId]: picked.includes(optionId)
          ? picked.filter((id) => id !== optionId)
          : [...picked, optionId],
      };
    });
  };

  const label = (partId: string, optionId: string) =>
    labels.get(`${partId}:${optionId}`) ?? optionId;

  return { selected, setSelected, toggle, label };
}
