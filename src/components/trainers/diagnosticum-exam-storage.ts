/**
 * Хранилище активной серии экзамена: только номер сессии и быстрая подсказка
 * для восстановления. Источник истины — сервер (`diagnosticum_sessions`).
 */
export const EXAM_STORAGE_KEY = "mbh:diagnosticum:exam";

export type SavedExam = {
  sessionId?: string;
  attemptId?: string;
  total?: number;
  index?: number;
  scores?: number[];
};

export function clearExamStorage() {
  try {
    window.sessionStorage.removeItem(EXAM_STORAGE_KEY);
  } catch {
    /* приватный режим: хранилища нет — чистить нечего */
  }
}
