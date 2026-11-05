/**
 * Реестр форматов File Engine.
 *
 * Это allowlist: просмотрщик выбирается только по записи отсюда. Новый формат
 * добавляется одной записью и одной реализацией просмотрщика, а не ветвлением
 * в каждом экране.
 *
 * Правила, зафиксированные планом:
 *  - первая версия — только просмотр, без редактирования Office;
 *  - старые форматы (DOC/XLS/PPT) требуют серверной конвертации, поэтому
 *    открываются как fallback с оригиналом, а не «наполовину»;
 *  - HTML и исполняемые форматы внутри сайта не рендерятся;
 *  - оригинал всегда остаётся неизменным: просмотр ничего не перезаписывает.
 */
import type { FileFamily, FileFormat } from "./types";

export const FILE_FORMATS: readonly FileFormat[] = [
  {
    id: "pdf",
    label: "PDF",
    family: "pdf",
    viewer: "pdf",
    extensions: ["pdf"],
    mimes: ["application/pdf"],
    conversion: "none",
    listing: false,
  },
  {
    id: "docx",
    label: "Word (DOCX)",
    family: "document",
    viewer: "docx",
    extensions: ["docx"],
    mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    conversion: "none",
    listing: false,
  },
  {
    id: "doc",
    label: "Word (DOC)",
    family: "document",
    viewer: "fallback",
    extensions: ["doc"],
    mimes: ["application/msword"],
    conversion: "server",
    listing: false,
    note: "Старый формат Word открывается после серверной конвертации; оригинал сохраняется.",
  },
  {
    id: "xlsx",
    label: "Excel (XLSX)",
    family: "spreadsheet",
    viewer: "xlsx",
    extensions: ["xlsx"],
    mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    conversion: "none",
    listing: false,
  },
  {
    id: "xls",
    label: "Excel (XLS)",
    family: "spreadsheet",
    viewer: "fallback",
    extensions: ["xls"],
    mimes: ["application/vnd.ms-excel"],
    conversion: "server",
    listing: false,
    note: "Старый формат Excel открывается после серверной конвертации.",
  },
  {
    id: "csv",
    label: "CSV",
    family: "spreadsheet",
    viewer: "csv",
    extensions: ["csv", "tsv"],
    mimes: ["text/csv", "text/tab-separated-values"],
    conversion: "none",
    listing: false,
  },
  {
    id: "pptx",
    label: "PowerPoint (PPTX)",
    family: "presentation",
    viewer: "pptx",
    extensions: ["pptx"],
    mimes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    conversion: "none",
    listing: false,
  },
  {
    id: "ppt",
    label: "PowerPoint (PPT)",
    family: "presentation",
    viewer: "fallback",
    extensions: ["ppt"],
    mimes: ["application/vnd.ms-powerpoint"],
    conversion: "server",
    listing: false,
    note: "Старый формат PowerPoint открывается после серверной конвертации.",
  },
  {
    id: "png",
    label: "Изображение PNG",
    family: "image",
    viewer: "image",
    extensions: ["png"],
    mimes: ["image/png"],
    conversion: "none",
    listing: false,
  },
  {
    id: "jpeg",
    label: "Изображение JPEG",
    family: "image",
    viewer: "image",
    extensions: ["jpg", "jpeg"],
    mimes: ["image/jpeg"],
    conversion: "none",
    listing: false,
  },
  {
    id: "gif",
    label: "Изображение GIF",
    family: "image",
    viewer: "image",
    extensions: ["gif"],
    mimes: ["image/gif"],
    conversion: "none",
    listing: false,
  },
  {
    id: "webp",
    label: "Изображение WebP",
    family: "image",
    viewer: "image",
    extensions: ["webp"],
    mimes: ["image/webp"],
    conversion: "none",
    listing: false,
  },
  {
    id: "bmp",
    label: "Изображение BMP",
    family: "image",
    viewer: "image",
    extensions: ["bmp"],
    mimes: ["image/bmp", "image/x-ms-bmp"],
    conversion: "none",
    listing: false,
  },
  {
    id: "svg",
    label: "Изображение SVG",
    family: "image",
    viewer: "image",
    extensions: ["svg"],
    mimes: ["image/svg+xml"],
    conversion: "none",
    listing: false,
    note: "SVG показывается только как изображение: скрипты внутри не выполняются.",
  },
  {
    id: "txt",
    label: "Текст",
    family: "text",
    viewer: "text",
    extensions: ["txt", "log"],
    mimes: ["text/plain"],
    conversion: "none",
    listing: false,
  },
  {
    id: "markdown",
    label: "Markdown",
    family: "text",
    viewer: "markdown",
    extensions: ["md", "markdown"],
    mimes: ["text/markdown", "text/x-markdown"],
    conversion: "none",
    listing: false,
  },
  {
    id: "zip",
    label: "Архив ZIP",
    family: "archive",
    viewer: "archive",
    extensions: ["zip"],
    mimes: ["application/zip", "application/x-zip-compressed"],
    conversion: "none",
    listing: true,
  },
  {
    id: "seven-zip",
    label: "Архив 7Z",
    family: "archive",
    viewer: "fallback",
    extensions: ["7z"],
    mimes: ["application/x-7z-compressed"],
    conversion: "server",
    listing: false,
    note: "Список содержимого 7Z без безопасной поддержки не показывается.",
  },
  {
    id: "rar",
    label: "Архив RAR",
    family: "archive",
    viewer: "fallback",
    extensions: ["rar"],
    mimes: ["application/vnd.rar", "application/x-rar-compressed"],
    conversion: "server",
    listing: false,
    note: "Список содержимого RAR без безопасной поддержки не показывается.",
  },
  {
    id: "mp3",
    label: "Аудио MP3",
    family: "audio",
    viewer: "media",
    extensions: ["mp3"],
    mimes: ["audio/mpeg", "audio/mp3"],
    conversion: "none",
    listing: false,
  },
  {
    id: "wav",
    label: "Аудио WAV",
    family: "audio",
    viewer: "media",
    extensions: ["wav"],
    mimes: ["audio/wav", "audio/x-wav", "audio/wave"],
    conversion: "none",
    listing: false,
  },
  {
    id: "ogg",
    label: "Аудио OGG",
    family: "audio",
    viewer: "media",
    extensions: ["ogg", "oga"],
    mimes: ["audio/ogg"],
    conversion: "none",
    listing: false,
  },
  {
    id: "mp4",
    label: "Видео MP4",
    family: "video",
    viewer: "media",
    extensions: ["mp4", "m4v", "m4a"],
    mimes: ["video/mp4", "audio/mp4", "video/x-m4v"],
    conversion: "none",
    listing: false,
  },
  {
    id: "webm",
    label: "Видео WebM",
    family: "video",
    viewer: "media",
    extensions: ["webm"],
    mimes: ["video/webm"],
    conversion: "none",
    listing: false,
  },
  {
    id: "unknown",
    label: "Файл",
    family: "other",
    viewer: "fallback",
    extensions: [],
    mimes: [],
    conversion: "none",
    listing: false,
    note: "Формат не распознан: доступна безопасная информация и скачивание оригинала.",
  },
];

const FORMAT_BY_ID = new Map<string, FileFormat>(FILE_FORMATS.map((format) => [format.id, format]));

const FORMAT_BY_EXTENSION = new Map<string, FileFormat>(
  FILE_FORMATS.flatMap((format) => format.extensions.map((extension) => [extension, format] as const)),
);

const FORMAT_BY_MIME = new Map<string, FileFormat>(
  FILE_FORMATS.flatMap((format) => format.mimes.map((mime) => [mime, format] as const)),
);

export const UNKNOWN_FORMAT: FileFormat = FORMAT_BY_ID.get("unknown")!;

export function getFormatById(id: string | null | undefined): FileFormat | null {
  if (!id) return null;
  return FORMAT_BY_ID.get(id) ?? null;
}

export function getFormatByExtension(extension: string | null | undefined): FileFormat | null {
  if (!extension) return null;
  return FORMAT_BY_EXTENSION.get(extension.toLowerCase()) ?? null;
}

export function getFormatByMime(mime: string | null | undefined): FileFormat | null {
  if (!mime) return null;
  const normalized = mime.split(";")[0].trim().toLowerCase();
  return FORMAT_BY_MIME.get(normalized) ?? null;
}

/** Формат открывается внутри сайта без конвертации и без fallback. */
export function isInlinePreviewsSupported(format: FileFormat): boolean {
  return format.viewer !== "fallback" && format.conversion === "none";
}

export function familyLabel(family: FileFamily): string {
  const labels: Record<FileFamily, string> = {
    document: "Документ",
    spreadsheet: "Таблица",
    presentation: "Презентация",
    pdf: "PDF",
    image: "Изображение",
    text: "Текст",
    archive: "Архив",
    audio: "Аудио",
    video: "Видео",
    other: "Файл",
  };
  return labels[family];
}

/** Размер файла в человеческом виде. Общий хелпер, а не копия в каждом экране. */
export function formatBytes(bytes: number | null | undefined): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}
