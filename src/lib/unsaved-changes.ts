"use client";

import { useEffect } from "react";

/**
 * Защита несохранённой работы в админке.
 *
 * До этого уход со страницы в середине правки сетки расписания, аттестации или
 * SQL-запроса молча терял всё: beforeunload не использовался нигде. Здесь две
 * вещи — предупреждение при закрытии вкладки и локальный черновик, который
 * переживает перезагрузку.
 */

const PREFIX = "mbh_draft:";

export type DraftEnvelope<T> = { savedAt: string; data: T };

export function saveDraft<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: new Date().toISOString(), data }));
  } catch {
    /* приватный режим или переполненное хранилище — черновик просто не сохранится */
  }
}

export function readDraft<T>(key: string): DraftEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    if (!parsed || typeof parsed !== "object" || !("data" in parsed)) return null;
    return { savedAt: String(parsed.savedAt || ""), data: parsed.data };
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ничего не делаем: отсутствие черновика не ошибка */
  }
}

export function formatDraftTime(savedAt: string): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return "неизвестно";
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Предупреждение браузера при закрытии вкладки с несохранёнными правками. */
export function useUnsavedChanges(dirty: boolean, message = "Есть несохранённые изменения — они потеряются, если уйти."): void {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, message]);
}
