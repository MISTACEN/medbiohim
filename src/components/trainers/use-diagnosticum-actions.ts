"use client";

/**
 * Действия вокруг задания: подсказка и отправка ошибки в повторение.
 *
 * Вынесено из `DiagnosticumRunner`, чтобы раннер укладывался в лимит строк.
 * Оба действия идемпотентны и не меняют задание — только дополняют его.
 */
import { useCallback, useState } from "react";
import { describeApiError } from "@/lib/errors";
import { requestDiagnosticumHint, type DiagnosticumHint } from "@/lib/diagnosticum-api";
import { srsAddTrainerCard } from "@/lib/features-api";
import type { DiagnosticumRepeatState } from "@/components/trainers/DiagnosticumResultPanel";

/** Подсказки выдаются по одной: список растёт, сброс — при новом задании. */
export function useDiagnosticumHint(input: {
  attemptId: string | undefined;
  answered: boolean;
  onBusy: (value: boolean) => void;
  onError: (message: string) => void;
}) {
  const { attemptId, answered, onBusy, onError } = input;
  const [hints, setHints] = useState<DiagnosticumHint[]>([]);

  const ask = useCallback(async () => {
    if (!attemptId || answered) return;
    onBusy(true);
    try {
      const res = await requestDiagnosticumHint(attemptId);
      if (res.ok) setHints((current) => [...current, res.data]);
      else onError(describeApiError(res.error));
    } finally {
      onBusy(false);
    }
  }, [attemptId, answered, onBusy, onError]);

  const reset = useCallback(() => setHints([]), []);
  return { hints, ask, reset };
}

/** «В повторение»: препарат добавляется в SRS по ключу методички. */
export function useDiagnosticumRepeat(guideKey: string | undefined, onError: (message: string) => void) {
  const [repeatState, setRepeatState] = useState<DiagnosticumRepeatState>("idle");

  const add = useCallback(async () => {
    if (!guideKey || repeatState !== "idle") return;
    setRepeatState("busy");
    const res = await srsAddTrainerCard(guideKey);
    if (!res.ok) {
      setRepeatState("idle");
      onError(describeApiError(res.error));
      return;
    }
    setRepeatState(res.data.added > 0 ? "saved" : "exists");
  }, [guideKey, repeatState, onError]);

  const reset = useCallback(() => setRepeatState("idle"), []);
  return { repeatState, add, reset };
}
