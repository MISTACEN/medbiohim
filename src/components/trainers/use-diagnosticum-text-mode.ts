"use client";

/**
 * Переключатель «ответ вариантами / ответ текстом».
 *
 * Живёт в localStorage: студент выбирает формат один раз, и он сохраняется между
 * заданиями и перезагрузками. Сервер про формат не знает — в `/answer` уходят
 * либо выбранные id, либо текстовые ответы, поэтому одну и ту же попытку можно
 * закрыть любым способом.
 */
import { useEffect, useState } from "react";

const STORAGE_KEY = "mbh:diagnosticum:text-mode";

export function useDiagnosticumTextMode(): [boolean, (value: boolean) => void] {
  const [textMode, setTextMode] = useState(false);

  useEffect(() => {
    try {
      setTextMode(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* приватный режим: остаёмся на вариантах */
    }
  }, []);

  const update = (value: boolean) => {
    setTextMode(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      /* приватный режим: выбор живёт до перезагрузки */
    }
  };

  return [textMode, update];
}
