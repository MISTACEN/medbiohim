"use client";

/**
 * URL снимка текущей попытки диагностикума.
 *
 * Вынесено из `DiagnosticumRunner`, чтобы раннер укладывался в лимит строк:
 * загрузка ссылки на картинку — отдельный эффект с отменой, а не часть
 * разметки задания.
 */
import { useEffect, useState } from "react";
import { getTrainerImageUrl } from "@/lib/api";

export function useDiagnosticumImage(cardId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!cardId) {
      setUrl(null);
      return;
    }
    let alive = true;
    setUrl(null);
    void getTrainerImageUrl(cardId)
      .then((value) => {
        if (alive) setUrl(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cardId]);

  return url;
}
