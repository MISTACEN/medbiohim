/** Локальный прогресс «Подготовки к самостоятельной» (открытые ответы).
 *
 *  Отдельное хранилище от мини-тестов (mb_lecture_quiz_v1): у открытых ответов
 *  своя семантика — «пройденные» пункты и список вопросов, в которых были
 *  ошибки, чтобы кнопка «Повторить ошибочные» переживала перезагрузку.
 */

const STORAGE_KEY = "mb_selfwork_v1";
export const SELF_WORK_PROGRESS_EVENT = "mb-selfwork-progress";

export type SelfWorkEntry = {
  /** id вопросов, ответ на которые полностью совпал с эталоном. */
  passed: string[];
  /** id вопросов, где были ошибки — их и предлагаем повторить. */
  mistakes: string[];
  attempts: number;
  updatedAt: number;
};

export type SelfWorkProgress = Record<string, SelfWorkEntry>;

const EMPTY: SelfWorkEntry = { passed: [], mistakes: [], attempts: 0, updatedAt: 0 };

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeEntry(raw: unknown): SelfWorkEntry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY };
  const value = raw as Record<string, unknown>;
  const list = (candidate: unknown) => (Array.isArray(candidate) ? candidate.map(String).filter(Boolean) : []);
  return {
    passed: list(value.passed),
    mistakes: list(value.mistakes),
    attempts: Number.isFinite(value.attempts) ? Number(value.attempts) : 0,
    updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : 0,
  };
}

export function readSelfWorkProgress(): SelfWorkProgress {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: SelfWorkProgress = {};
    for (const [lectureId, entry] of Object.entries(parsed as Record<string, unknown>)) {
      out[lectureId] = normalizeEntry(entry);
    }
    return out;
  } catch {
    return {};
  }
}

export function selfWorkEntry(lectureId: string, progress?: SelfWorkProgress): SelfWorkEntry {
  if (!lectureId) return { ...EMPTY };
  return (progress ?? readSelfWorkProgress())[lectureId] ?? { ...EMPTY };
}

function write(progress: SelfWorkProgress): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(progress));
    window.dispatchEvent(new Event(SELF_WORK_PROGRESS_EVENT));
  } catch {
    /* хранилище недоступно — интерфейс продолжает работать в памяти */
  }
}

/** Записывает результат проверки: полный ответ уходит из «ошибочных», частичный — попадает. */
export function recordSelfWorkResult(lectureId: string, questionId: string, result: { complete: boolean; passed: boolean }): void {
  if (!lectureId || !questionId) return;
  const progress = readSelfWorkProgress();
  const entry = progress[lectureId] ?? { ...EMPTY };
  const passed = new Set(entry.passed);
  const mistakes = new Set(entry.mistakes);
  if (result.complete) {
    passed.add(questionId);
    mistakes.delete(questionId);
  } else if (result.passed) {
    // Ответ в целом верный, но пункты потеряны — оставляем в «повторить».
    passed.delete(questionId);
    mistakes.add(questionId);
  } else {
    passed.delete(questionId);
    mistakes.add(questionId);
  }
  progress[lectureId] = {
    passed: [...passed],
    mistakes: [...mistakes],
    attempts: entry.attempts + 1,
    updatedAt: Date.now(),
  };
  write(progress);
}

/** Сбрасывает вопрос (например, «пройти заново» целиком). */
export function resetSelfWorkQuestion(lectureId: string, questionId: string): void {
  if (!lectureId || !questionId) return;
  const progress = readSelfWorkProgress();
  const entry = progress[lectureId];
  if (!entry) return;
  progress[lectureId] = {
    ...entry,
    passed: entry.passed.filter((id) => id !== questionId),
    mistakes: entry.mistakes.filter((id) => id !== questionId),
    updatedAt: Date.now(),
  };
  write(progress);
}

/** id вопросов, в которых были ошибки (для «Повторить ошибочные»). */
export function mistakeQuestionIds(lectureId: string, progress?: SelfWorkProgress): string[] {
  return selfWorkEntry(lectureId, progress).mistakes;
}
