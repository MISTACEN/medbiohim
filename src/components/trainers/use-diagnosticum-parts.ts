"use client";

/**
 * Оси задания: какие части включает «Разбор».
 *
 * Название препарата есть всегда — это ядро диагностики. Структуры и утверждения
 * можно выключить: сервер сведёт набор к существующему режиму (`identify`,
 * `schema`, `complex`), поэтому старые попытки и статистика не меняются.
 */
import { useState } from "react";

export type DiagnosticumPartId = "structures" | "statements";

const DEFAULT: DiagnosticumPartId[] = ["structures", "statements"];

export function useDiagnosticumParts(onChange?: () => void): [
  DiagnosticumPartId[],
  (part: DiagnosticumPartId) => void,
] {
  const [extra, setExtra] = useState<DiagnosticumPartId[]>(DEFAULT);

  const toggle = (part: DiagnosticumPartId) => {
    setExtra((current) =>
      current.includes(part) ? current.filter((item) => item !== part) : [...current, part],
    );
    // Набор осей изменился — текущее задание собрано по старым.
    onChange?.();
  };

  return [extra, toggle];
}
