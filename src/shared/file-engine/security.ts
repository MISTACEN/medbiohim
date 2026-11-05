/**
 * Предохранители File Engine.
 *
 * Здесь нет «доверия» ни расширению, ни MIME, ни архиву. Проверки применяются
 * до распаковки и до отрисовки, а при отказе интерфейс показывает информацию о
 * файле и оригинал, но не пытается его открыть.
 */
import type { FileFamily, FileFormat, PreviewLimits, SafetyVerdict } from "./types";
import { DEFAULT_LIMITS } from "./limits";

function verdict(code: SafetyVerdict["code"], message: string): SafetyVerdict {
  if (code === "ok") return { ok: true, code, message };
  return { ok: false, code, message };
}

function limitForFamily(family: FileFamily, limits: PreviewLimits): number {
  switch (family) {
    case "document":
    case "spreadsheet":
    case "presentation":
    case "archive":
      return limits.maxOfficeBytes;
    case "text":
      return limits.maxTextBytes;
    default:
      return limits.maxBytes;
  }
}

export function checkPreviewSafety(
  input: {
    format: FileFormat;
    size?: number | null;
    signatureMatches?: boolean;
    signature?: string | null;
  },
  limits: PreviewLimits = DEFAULT_LIMITS,
): SafetyVerdict {
  const size = Number(input.size ?? 0);
  if (Number.isFinite(size) && size > limitForFamily(input.format.family, limits)) {
    return verdict(
      "too_large",
      `Файл больше предела встроенного просмотра (${Math.round(
        limitForFamily(input.format.family, limits) / (1024 * 1024),
      )} МБ). Оригинал можно скачать.`,
    );
  }
  if (input.signatureMatches === false && input.signature) {
    return verdict(
      "mime_mismatch",
      "Содержимое файла не совпадает с его расширением или типом. Безопаснее скачать оригинал.",
    );
  }
  return verdict("ok", "");
}

function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export type ArchiveEntry = {
  /** Нормализованный путь внутри архива. */
  path: string;
  /** Короткое имя для списка. */
  name: string;
  directory: boolean;
  depth: number;
};

export type ArchiveSanitizeResult = {
  entries: ArchiveEntry[];
  rejected: string[];
  truncated: boolean;
};

/**
 * Нормализует имена внутри архива: отбрасывает абсолютные пути, `..`,
 * управляющие символы и слишком глубокие вложения. Распаковки здесь нет.
 */
export function sanitizeArchiveEntries(
  names: readonly string[],
  limits: PreviewLimits = DEFAULT_LIMITS,
): ArchiveSanitizeResult {
  const entries: ArchiveEntry[] = [];
  const rejected: string[] = [];
  let truncated = false;

  for (const raw of names) {
    if (entries.length >= limits.maxArchiveEntries) {
      truncated = true;
      break;
    }
    const original = String(raw ?? "");
    const normalized = original.replace(/\\/g, "/").replace(/\/{2,}/g, "/").trim();
    if (!normalized) {
      rejected.push(original);
      continue;
    }
    if (original.length > limits.maxArchiveNameLength || hasControlChars(original)) {
      rejected.push(original);
      continue;
    }
    if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) {
      rejected.push(original);
      continue;
    }
    const segments = normalized.split("/").filter(Boolean);
    if (!segments.length || segments.some((segment) => segment === ".." || segment === ".")) {
      rejected.push(original);
      continue;
    }
    if (segments.length > limits.maxArchiveDepth) {
      rejected.push(original);
      continue;
    }
    const directory = normalized.endsWith("/");
    entries.push({
      path: segments.join("/"),
      name: segments[segments.length - 1],
      directory,
      depth: segments.length,
    });
  }

  return { entries, rejected, truncated };
}

/** Проверка бюджета архива: число записей, суммарный размер и коэффициент сжатия. */
export function checkArchiveBudget(
  entries: ReadonlyArray<{ compressedSize?: number; uncompressedSize?: number }>,
  limits: PreviewLimits = DEFAULT_LIMITS,
): SafetyVerdict {
  if (!entries.length) return verdict("empty", "Архив пуст.");
  if (entries.length > limits.maxArchiveEntries) {
    return verdict("too_many_entries", `В архиве больше ${limits.maxArchiveEntries} записей.`);
  }
  let uncompressed = 0;
  let compressed = 0;
  for (const entry of entries) {
    uncompressed += Math.max(0, Number(entry.uncompressedSize ?? 0));
    compressed += Math.max(0, Number(entry.compressedSize ?? 0));
  }
  if (uncompressed > limits.maxArchiveUncompressed) {
    return verdict("archive_bomb", "Распакованный архив слишком велик для встроенного просмотра.");
  }
  if (compressed > 0 && uncompressed / compressed > limits.maxArchiveRatio) {
    return verdict("archive_bomb", "Подозрительная степень сжатия: архив похож на «zip-бомбу».");
  }
  return verdict("ok", "");
}

/** Безопасное имя для заголовка скачивания: без путей и управляющих символов. */
export function sanitizeFileName(name: string | null | undefined, fallback = "file"): string {
  const base = String(name ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return base.slice(0, 200) || fallback;
}
