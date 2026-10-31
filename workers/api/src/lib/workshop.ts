/**
 * Workshop: чистые эвристики, которые не зависят от Hono/Supabase.
 *
 * Их проще тестировать: при загрузке фотолекции или PDF с вопросами клиент
 * получает те же подсказки, что и сервер, и автор видит результат до отправки.
 */

export type WorkshopKind = "photo_lecture" | "notes" | "test_questions" | "pdf" | "other";
export type WorkshopStatus = "draft" | "pending" | "published" | "hidden" | "rejected" | "deleted";

export type UploadHint = {
  name?: string;
  mime?: string;
  size?: number;
};

const IMAGE_MIME = /^image\//i;
const TEXT_MIME = /^text\//i;
const PDF_MIME = /pdf/i;

const PERSONAL_DATA_PATTERNS: Array<{ code: string; label: string; re: RegExp }> = [
  { code: "journal", label: "похоже на журнал/ведомость", re: /(журнал|ведомост|таблиц[аы]\s+успеваемост|оценк[иа]\s+групп)/i },
  { code: "names", label: "похоже на список фамилий", re: /(фамили[яи]|фио|список\s+(студентов|группы)|ф\.и\.о\.?)/i },
  { code: "group_list", label: "похоже на список группы", re: /(студент[ыа]?\s+группы|группа\s+\d|подгруппа\s+\d)/i },
];

const PERSONAL_DATA_HEADER = /(?:^|[^А-ЯЁA-Z])(?:[А-ЯЁA-Z][а-яёa-z-]{2,})\s+[А-ЯЁA-Z]\.\s?[А-ЯЁA-Z]\./u;

/** Нормализует теги: без `#`, нижний регистр, без дублей, до 40 символов каждый. */
export function normalizeTags(input: unknown, limit = 10): string[] {
  const rows = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[,#;\s]+/)
      : [];
  const out: string[] = [];
  for (const raw of rows) {
    const tag = String(raw ?? "").trim().replace(/^#+/, "").toLowerCase().slice(0, 40);
    if (!tag || !/^[a-zа-яё0-9][a-zа-яё0-9_-]*$/u.test(tag)) continue;
    if (!out.includes(tag)) out.push(tag);
    if (out.length >= limit) break;
  }
  return out;
}

/** Тип материала по составу загрузки: 10 фото = одна фотолекция. */
export function detectKind(files: UploadHint[], hasQuestions: boolean): WorkshopKind {
  if (hasQuestions) return "test_questions";
  const images = files.filter((file) => IMAGE_MIME.test(String(file.mime || ""))).length;
  const pdfs = files.filter((file) => PDF_MIME.test(String(file.mime || "")) || /\.pdf$/i.test(String(file.name || ""))).length;
  if (images > 0 && images === files.length && images > 1) return "photo_lecture";
  if (pdfs > 0) return "pdf";
  if (images === 1) return "notes";
  if (files.some((file) => TEXT_MIME.test(String(file.mime || "")))) return "notes";
  return "other";
}

/**
 * Предупреждение о чужих персональных данных. Это не окончательный запрет:
 * автор обязан подтвердить, что данных нет или он их вырезал.
 */
export function personalDataFlags(input: { title?: string; text?: string; fileNames?: string[] }): string[] {
  const haystack = [input.title, input.text, ...(input.fileNames || [])].filter(Boolean).join("\n");
  const flags: string[] = [];
  for (const pattern of PERSONAL_DATA_PATTERNS) {
    if (pattern.re.test(haystack)) flags.push(pattern.label);
  }
  if (PERSONAL_DATA_HEADER.test(haystack)) flags.push("похоже на ФИО");
  return [...new Set(flags)].slice(0, 5);
}

/**
 * Разбивает текст с вопросами на отдельные вопросы.
 * Поддерживает нумерацию «1.», «2)», «Вопрос 3:» и блоки через пустую строку.
 */
export function splitQuestions(raw: string, limit = 300): string[] {
  const text = String(raw || "").replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const numbered = text
    .split(/\n(?=\s*(?:вопрос\s*)?\d{1,3}\s*[.):\-]\s+)/iu)
    .map((chunk) => chunk.replace(/^\s*(?:вопрос\s*)?\d{1,3}\s*[.):\-]\s*/iu, "").trim())
    .filter(Boolean);
  const candidates = numbered.length > 1
    ? numbered
    : text.split(/\n\s*\n+/).map((chunk) => chunk.trim()).filter(Boolean);
  return candidates
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .filter((chunk) => chunk.length >= 3)
    .slice(0, limit);
}

/** Заголовок по умолчанию: «Фотолекция · Гистология» вместо имени файла. */
export function defaultTitle(kind: WorkshopKind, subject?: string | null, topic?: string | null, fileName?: string | null): string {
  const label = {
    photo_lecture: "Фотолекция",
    notes: "Конспект",
    test_questions: "Вопросы",
    pdf: "Материал",
    other: "Материал",
  }[kind];
  const scope = [subject, topic].filter(Boolean).join(" · ");
  if (scope) return `${label} · ${scope}`.slice(0, 160);
  const cleaned = String(fileName || "").replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  return (cleaned ? `${label} · ${cleaned}` : label).slice(0, 160);
}

/** Теги-подсказки из имени файла и типа материала. */
export function suggestTags(kind: WorkshopKind, fileNames: string[] = [], extra: string[] = []): string[] {
  const base = [kind === "photo_lecture" ? "фотолекция" : kind === "test_questions" ? "вопросы" : kind === "pdf" ? "pdf" : kind === "notes" ? "конспект" : "материал"];
  const words = fileNames
    .join(" ")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/g, " ")
    .split(/[^a-zа-яё0-9]+/u)
    .filter((word) => word.length >= 4 && !/^(img|photo|scan|image|document|pdf|file|whatsapp|telegram)/.test(word));
  return normalizeTags([...base, ...extra, ...words.slice(0, 6)], 8);
}

/** Безопасная сортировка страниц фотолекции: 2.jpg должен идти до 10.jpg. */
export function sortFilesForBatch<T extends { original_name?: string; name?: string; position?: number }>(files: T[]): T[] {
  const key = (file: T) => String(file.original_name || file.name || "");
  return [...files].sort((left, right) => {
    if (left.position != null && right.position != null && left.position !== right.position) return left.position - right.position;
    return key(left).localeCompare(key(right), "ru", { numeric: true, sensitivity: "base" });
  });
}
