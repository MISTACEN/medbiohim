/**
 * Прогресс по модулю, независимый от предмета, из которого его открыли.
 *
 * Ключ — стабильный `module.id`, поэтому переход «химия → биохимия» не
 * создаёт вторую запись и не теряет историю. Предмет лишь фиксируется в
 * списке контекстов, чтобы показать, откуда модуль открывали.
 */

export type ModuleVisit = {
  moduleId: string;
  visits: number;
  lastAt: string;
  lastSubject: string;
  subjects: string[];
};

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export const MODULE_PROGRESS_KEY = "mbh:module_progress:v1";
const MAX_VISITS = 300;

export function defaultStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalize(value: unknown): ModuleVisit | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const moduleId = String(record.moduleId ?? "").trim();
  if (!moduleId) return null;
  const subjects = Array.isArray(record.subjects)
    ? Array.from(new Set(record.subjects.map((item) => String(item ?? "").trim()).filter(Boolean)))
    : [];
  return {
    moduleId,
    visits: Math.max(1, Math.round(Number(record.visits) || 1)),
    lastAt: String(record.lastAt ?? ""),
    lastSubject: String(record.lastSubject ?? subjects[subjects.length - 1] ?? ""),
    subjects,
  };
}

export function parseVisits(raw: string | null | undefined): ModuleVisit[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalize)
      .filter((item): item is ModuleVisit => item !== null)
      .slice(-MAX_VISITS);
  } catch {
    return [];
  }
}

export function readVisits(storage: StorageLike | null = defaultStorage()): ModuleVisit[] {
  if (!storage) return [];
  try {
    return parseVisits(storage.getItem(MODULE_PROGRESS_KEY));
  } catch {
    return [];
  }
}

function persist(visits: ModuleVisit[], storage: StorageLike | null): ModuleVisit[] {
  if (storage) {
    try {
      storage.setItem(MODULE_PROGRESS_KEY, JSON.stringify(visits));
    } catch {
      // Квота не должна ломать открытие модуля.
    }
  }
  return visits;
}

/** Отмечает открытие модуля в контексте предмета; id записи не меняется. */
export function recordModuleVisit(
  moduleId: string,
  subjectKey: string | null | undefined,
  now: Date = new Date(),
  storage: StorageLike | null = defaultStorage(),
): ModuleVisit[] {
  const id = String(moduleId ?? "").trim();
  if (!id) return readVisits(storage);
  const visits = readVisits(storage);
  const subject = String(subjectKey ?? "").trim();
  const existing = visits.find((visit) => visit.moduleId === id);
  if (existing) {
    existing.visits += 1;
    existing.lastAt = now.toISOString();
    if (subject) {
      existing.lastSubject = subject;
      if (!existing.subjects.includes(subject)) existing.subjects.push(subject);
    }
  } else {
    visits.push({
      moduleId: id,
      visits: 1,
      lastAt: now.toISOString(),
      lastSubject: subject,
      subjects: subject ? [subject] : [],
    });
  }
  return persist(visits.slice(-MAX_VISITS), storage);
}

export function visitFor(
  moduleId: string,
  storage: StorageLike | null = defaultStorage(),
): ModuleVisit | null {
  return readVisits(storage).find((visit) => visit.moduleId === moduleId) ?? null;
}

export type ModuleProgressSummary = {
  modules: number;
  visits: number;
  lastModuleId: string | null;
  lastSubject: string;
};

export function summarizeVisits(visits: ModuleVisit[]): ModuleProgressSummary {
  const total = visits.reduce((sum, visit) => sum + visit.visits, 0);
  const last = [...visits].sort((a, b) => a.lastAt.localeCompare(b.lastAt)).pop() ?? null;
  return {
    modules: visits.length,
    visits: total,
    lastModuleId: last?.moduleId ?? null,
    lastSubject: last?.lastSubject ?? "",
  };
}
