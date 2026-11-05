/**
 * Определение формата по расширению, MIME и сигнатуре.
 *
 * Расширению не доверяем: сигнатура первых байт должна совпадать с семейством
 * формата. Если заявленный MIME противоречит расширению, а сигнатура —
 * исполняемый/посторонний файл, движок помечает несоответствие и не открывает
 * такой файл внутри сайта.
 */
import { getFormatByExtension, getFormatByMime, isInlinePreviewsSupported, UNKNOWN_FORMAT } from "./formats";
import type { Detection, DetectionInput, FileFormat, SignatureFamily } from "./types";

const SIGNATURE_LABELS: Record<SignatureFamily, string> = {
  pdf: "PDF",
  zip: "ZIP-контейнер",
  ole: "старый Office (OLE)",
  png: "PNG",
  jpeg: "JPEG",
  gif: "GIF",
  webp: "WebP",
  bmp: "BMP",
  "audio-mpeg": "MPEG-аудио",
  "audio-wav": "WAV",
  "audio-ogg": "OGG",
  "audio-flac": "FLAC",
  "video-mp4": "MP4",
  "video-webm": "WebM",
  "seven-zip": "7Z",
  rar: "RAR",
  text: "текст",
};

/** Какие сигнатуры допустимы для формата. Пустой список — формат без сигнатуры. */
const ACCEPTED_SIGNATURES: Record<string, SignatureFamily[]> = {
  pdf: ["pdf"],
  docx: ["zip"],
  doc: ["ole"],
  xlsx: ["zip"],
  xls: ["ole"],
  pptx: ["zip"],
  ppt: ["ole"],
  csv: ["text"],
  txt: ["text"],
  markdown: ["text"],
  zip: ["zip"],
  "seven-zip": ["seven-zip"],
  rar: ["rar"],
  png: ["png"],
  jpeg: ["jpeg"],
  gif: ["gif"],
  webp: ["webp"],
  bmp: ["bmp"],
  svg: ["text"],
  mp3: ["audio-mpeg"],
  wav: ["audio-wav"],
  ogg: ["audio-ogg"],
  mp4: ["video-mp4"],
  webm: ["video-webm"],
};

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[offset + index] !== signature[index]) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let result = "";
  const end = Math.min(to, bytes.length);
  for (let index = from; index < end; index += 1) {
    result += String.fromCharCode(bytes[index]);
  }
  return result;
}

/** Доля печатных символов: по ней отличаем текст от двоичного мусора. */
function looksTextual(bytes: Uint8Array): boolean {
  if (!bytes.length) return false;
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let printable = 0;
  let suspiciousControl = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13) {
      printable += 1;
      continue;
    }
    if (byte === 0) {
      suspiciousControl += 1;
      continue;
    }
    if (byte < 32) {
      suspiciousControl += 1;
      continue;
    }
    printable += 1;
  }
  return printable / sample.length > 0.9 && suspiciousControl === 0;
}

/** Определяет семейство по первым байтам. null — не распознано. */
export function sniffSignature(head: Uint8Array | null | undefined): SignatureFamily | null {
  if (!head || head.length < 4) return null;
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) return "zip";
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && ascii(head, 8, 12) === "WEBP") return "webp";
  if (startsWith(head, [0x42, 0x4d])) return "bmp";
  if (startsWith(head, [0x49, 0x44, 0x33]) || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) {
    return "audio-mpeg";
  }
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && ascii(head, 8, 12) === "WAVE") return "audio-wav";
  if (startsWith(head, [0x4f, 0x67, 0x67, 0x53])) return "audio-ogg";
  if (startsWith(head, [0x66, 0x4c, 0x61, 0x43])) return "audio-flac";
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return "video-webm";
  if (ascii(head, 4, 8) === "ftyp") return "video-mp4";
  if (startsWith(head, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return "seven-zip";
  if (startsWith(head, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) return "rar";
  if (looksTextual(head)) return "text";
  return null;
}

export function extensionOf(name: string | null | undefined): string {
  const value = String(name ?? "").trim();
  const base = value.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

function normalizeMime(mime: string | null | undefined): string {
  return String(mime ?? "").split(";")[0].trim().toLowerCase();
}

export function detectFile(input: DetectionInput): Detection {
  const reasons: string[] = [];
  const extension = extensionOf(input.name);
  const declaredMime = normalizeMime(input.mime);

  const byExtension = extension ? getFormatByExtension(extension) : null;
  const byMime = getFormatByMime(declaredMime);

  const format: FileFormat = byExtension ?? byMime ?? UNKNOWN_FORMAT;
  if (!byExtension && byMime) reasons.push("Формат определён по MIME: расширения нет или оно неизвестно.");
  if (byExtension && byMime && byExtension.id !== byMime.id) {
    reasons.push(`MIME ${declaredMime} не совпадает с расширением .${extension}.`);
  }

  const signature = sniffSignature(input.head);
  if (signature) reasons.push(`Сигнатура: ${SIGNATURE_LABELS[signature]}.`);

  let signatureMatches = true;
  if (signature && input.head) {
    const accepted = ACCEPTED_SIGNATURES[format.id];
    if (accepted && accepted.length && !accepted.includes(signature)) {
      signatureMatches = false;
      reasons.push(`Содержимое не похоже на ${format.label}: найдена сигнатура «${SIGNATURE_LABELS[signature]}».`);
      // Если расширение не подтверждается, а MIME или сигнатура дают
      // безопасный известный формат — показываем его, но помечаем несоответствие.
      const bySignature = formatBySignature(signature);
      if (bySignature && isInlinePreviewsSupported(bySignature)) {
        reasons.push(`Просмотр пойдёт как ${bySignature.label}.`);
      }
    }
  }

  const mimeMismatch =
    Boolean(byExtension && byMime) && byExtension!.id !== byMime!.id && declaredMime !== "application/octet-stream";

  const canPreviewInline = isInlinePreviewsSupported(format) && signatureMatches;

  return {
    format,
    extension,
    declaredMime,
    signature,
    signatureMatches,
    mimeMismatch,
    reasons,
    canPreviewInline,
  };
}

/**
 * Формат по сигнатуре. Для ZIP однозначного ответа нет (это может быть DOCX,
 * XLSX, PPTX или обычный архив), поэтому ZIP формат здесь не возвращается:
 * решает расширение.
 */
function formatBySignature(signature: SignatureFamily): FileFormat | null {
  const map: Partial<Record<SignatureFamily, string>> = {
    pdf: "pdf",
    png: "png",
    jpeg: "jpeg",
    gif: "gif",
    webp: "webp",
    bmp: "bmp",
    "audio-mpeg": "mp3",
    "audio-wav": "wav",
    "audio-ogg": "ogg",
    "video-mp4": "mp4",
    "video-webm": "webm",
    "seven-zip": "seven-zip",
    rar: "rar",
  };
  const id = map[signature];
  if (!id) return null;
  const extension = id;
  return getFormatByExtension(extension);
}
