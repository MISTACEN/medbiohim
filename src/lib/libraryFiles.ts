/**
 * Личная библиотека пользователя: индекс загруженных файлов, коллекции,
 * закладки и заметки.
 *
 * Сами файлы лежат в серверном storage (метаданные — `public.files`), здесь
 * хранится только пользовательская обвязка: к какому предмету отнесён файл,
 * в какую коллекцию положен, сколько прочитано и какие закладки сделаны.
 * Индекс локальный: серверного API для коллекций пока нет, и выдавать
 * локальные данные за синхронизированные нельзя.
 */

export type FileBookmark = {
  id: string;
  label: string;
  /** Страница или процент — что указал пользователь. */
  position: string;
};

export type UserFile = {
  /** id файла в `public.files` (серверный storage). */
  id: string;
  name: string;
  mime: string;
  size: number;
  subjectSlug: string;
  collection: string;
  addedAt: string;
  progressPercent: number;
  bookmarks: FileBookmark[];
  notes: string;
};

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export const USER_FILES_KEY = "mbh:user_files:v1";
const MAX_FILES = 300;

export function defaultStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function clampPercent(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeBookmarks(value: unknown): FileBookmark[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): FileBookmark | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = String(record.label ?? "").trim();
      if (!label) return null;
      return {
        id: String(record.id ?? label),
        label: label.slice(0, 200),
        position: String(record.position ?? "").slice(0, 50),
      };
    })
    .filter((item): item is FileBookmark => item !== null)
    .slice(0, 100);
}

export function parseUserFiles(raw: string | null | undefined): UserFile[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): UserFile | null => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const id = String(record.id ?? "").trim();
        const name = String(record.name ?? "").trim();
        if (!id || !name) return null;
        return {
          id,
          name: name.slice(0, 255),
          mime: String(record.mime ?? "application/octet-stream"),
          size: Math.max(0, Math.round(Number(record.size) || 0)),
          subjectSlug: String(record.subjectSlug ?? "").trim(),
          collection: String(record.collection ?? "").trim().slice(0, 80),
          addedAt: String(record.addedAt ?? ""),
          progressPercent: clampPercent(record.progressPercent),
          bookmarks: normalizeBookmarks(record.bookmarks),
          notes: String(record.notes ?? "").slice(0, 5000),
        };
      })
      .filter((file): file is UserFile => file !== null)
      .slice(-MAX_FILES);
  } catch {
    return [];
  }
}

export function readUserFiles(storage: StorageLike | null = defaultStorage()): UserFile[] {
  if (!storage) return [];
  try {
    return parseUserFiles(storage.getItem(USER_FILES_KEY));
  } catch {
    return [];
  }
}

function persist(files: UserFile[], storage: StorageLike | null): UserFile[] {
  if (storage) {
    try {
      storage.setItem(USER_FILES_KEY, JSON.stringify(files));
    } catch {
      // Квота не должна ломать загрузку: файл уже на сервере.
    }
  }
  return files;
}

/** Добавляет файл; повторная загрузка того же id обновляет запись. */
export function addUserFile(
  file: UserFile,
  storage: StorageLike | null = defaultStorage(),
): UserFile[] {
  const existing = readUserFiles(storage).filter((item) => item.id !== file.id);
  const next = [...existing, { ...file, progressPercent: clampPercent(file.progressPercent) }]
    .slice(-MAX_FILES);
  return persist(next, storage);
}

export function updateUserFile(
  id: string,
  patch: Partial<Omit<UserFile, "id">>,
  storage: StorageLike | null = defaultStorage(),
): UserFile[] {
  const next = readUserFiles(storage).map((file) => {
    if (file.id !== id) return file;
    return {
      ...file,
      ...patch,
      id: file.id,
      progressPercent: clampPercent(patch.progressPercent ?? file.progressPercent),
      bookmarks: patch.bookmarks ? normalizeBookmarks(patch.bookmarks) : file.bookmarks,
      notes: patch.notes !== undefined ? String(patch.notes).slice(0, 5000) : file.notes,
    };
  });
  return persist(next, storage);
}

export function removeUserFile(
  id: string,
  storage: StorageLike | null = defaultStorage(),
): UserFile[] {
  return persist(readUserFiles(storage).filter((file) => file.id !== id), storage);
}

export function collectionNames(files: UserFile[]): string[] {
  const set = new Set<string>();
  for (const file of files) {
    if (file.collection) set.add(file.collection);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
}

export function filesByCollection(files: UserFile[], collection: string): UserFile[] {
  if (!collection) return files;
  return files.filter((file) => file.collection === collection);
}

export type UserFilesSummary = {
  total: number;
  collections: number;
  read: number;
  averageProgress: number | null;
};

export function summarizeUserFiles(files: UserFile[]): UserFilesSummary {
  if (!files.length) {
    return { total: 0, collections: 0, read: 0, averageProgress: null };
  }
  const sum = files.reduce((total, file) => total + file.progressPercent, 0);
  return {
    total: files.length,
    collections: collectionNames(files).length,
    read: files.filter((file) => file.progressPercent >= 100).length,
    averageProgress: Math.round(sum / files.length),
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
