/**
 * File Engine (этап F плана): общие типы подсистемы просмотра файлов.
 *
 * Ни один тип здесь не знает про предмет, тест или преподавателя: движок
 * описывает формат, способ просмотра и пределы безопасности. Доменное
 * поведение (права на скачивание, привязка к материалу) задаёт вызывающий
 * модуль.
 */

/** Крупная группа формата: от неё зависят пределы размера и способ просмотра. */
export type FileFamily =
  | "document"
  | "spreadsheet"
  | "presentation"
  | "pdf"
  | "image"
  | "text"
  | "archive"
  | "audio"
  | "video"
  | "other";

/**
 * Реализация просмотра. Значение — ключ allowlist-реестра: произвольный
 * рендерер из данных не вызывается.
 */
export type ViewerId =
  | "pdf"
  | "image"
  | "media"
  | "text"
  | "markdown"
  | "csv"
  | "docx"
  | "pptx"
  | "xlsx"
  | "archive"
  | "fallback";

/** Нужна ли серверная конвертация, чтобы открыть файл внутри сайта. */
export type ConversionNeed = "none" | "server";

export type FileFormat = {
  /** Стабильный идентификатор формата (он же ключ реестра). */
  id: string;
  label: string;
  family: FileFamily;
  viewer: ViewerId;
  /** Расширения без точки, в нижнем регистре. */
  extensions: readonly string[];
  /** MIME-типы, которые считаются этим форматом. */
  mimes: readonly string[];
  conversion: ConversionNeed;
  /** Можно перечислить содержимое (архивы) без распаковки. */
  listing: boolean;
  note?: string;
};

/** Семейство сигнатуры файла, определённое по первым байтам. */
export type SignatureFamily =
  | "pdf"
  | "zip"
  | "ole"
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "bmp"
  | "audio-mpeg"
  | "audio-wav"
  | "audio-ogg"
  | "audio-flac"
  | "video-mp4"
  | "video-webm"
  | "seven-zip"
  | "rar"
  | "text";

export type DetectionInput = {
  name?: string | null;
  mime?: string | null;
  /** Первые ~4 КБ файла, если уже прочитаны. */
  head?: Uint8Array | null;
};

export type Detection = {
  format: FileFormat;
  extension: string;
  declaredMime: string;
  /** Сигнатура по первым байтам; null — байты не переданы или не распознаны. */
  signature: SignatureFamily | null;
  /** Совпадает ли сигнатура с форматом. Без байтов считается совпадающей. */
  signatureMatches: boolean;
  /** Заявленный MIME относится к другому формату. */
  mimeMismatch: boolean;
  /** Диагностика для интерфейса и логов (без путей и содержимого). */
  reasons: string[];
  /** Можно ли открыть внутри сайта без конвертации и без риска. */
  canPreviewInline: boolean;
};

export type SafetyCode =
  | "ok"
  | "too_large"
  | "mime_mismatch"
  | "archive_bomb"
  | "too_many_entries"
  | "path_traversal"
  | "depth_exceeded"
  | "empty";

export type SafetyVerdict = {
  ok: boolean;
  code: SafetyCode;
  message: string;
};

/** Пределы просмотра. Значения — предохранители, а не рекомендации по UX. */
export type PreviewLimits = {
  maxBytes: number;
  maxOfficeBytes: number;
  maxTextBytes: number;
  maxTextChars: number;
  maxArchiveEntries: number;
  maxArchiveUncompressed: number;
  maxArchiveRatio: number;
  maxArchiveDepth: number;
  maxArchiveNameLength: number;
  maxSheetRows: number;
  maxSheetCols: number;
  maxSheets: number;
  maxSlides: number;
  maxDocImages: number;
  maxDocImageBytes: number;
  maxCsvRows: number;
  maxCsvCols: number;
};
