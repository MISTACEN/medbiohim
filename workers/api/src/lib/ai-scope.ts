/**
 * Когда ответу тьютора нужны материалы курса (RAG).
 *
 * Раньше «точный» режим подмешивал фрагменты лекций всегда, и без предмета
 * поиск шёл по всему корпусу: план дня и чек-лист подготовки из /study получали
 * пять случайных кусков лекций — лишние токены, задержка и мусор в ответе.
 *
 * Правило: материалы нужны только для предметного вопроса в точном режиме и
 * никогда — служебным вызовам со срезом учебного состояния (context_scope=study).
 */

export const CHAT_MODES = ["precise", "fast"] as const;
export type ScopedChatMode = (typeof CHAT_MODES)[number];

/** Режим по умолчанию — «точный»; всё неизвестное считаем им же. */
export function scopeMode(mode: unknown): ScopedChatMode {
  return mode === "fast" ? "fast" : "precise";
}

export type RagScopeInput = {
  mode?: unknown;
  subjectSlug?: string | null;
  contextScope?: string | null;
};

export function shouldUseLectureRag(input: RagScopeInput): boolean {
  const subject = String(input?.subjectSlug ?? "").trim();
  if (!subject) return false;
  if (String(input?.contextScope ?? "").trim().toLowerCase() === "study") return false;
  return scopeMode(input?.mode) === "precise";
}
