/**
 * Сборка .docx с ответами к экзамену (фаза 2.7 карты).
 *
 * Документ минимальный, но настоящий OOXML: три части пакета — content types,
 * relationships и word/document.xml. Этого достаточно, чтобы Word, LibreOffice и
 * Google Docs открыли файл с заголовками, вопросами и ответами. Стили задаются
 * прямыми свойствами run-ов, поэтому styles.xml не нужен.
 *
 * Собираем в браузере (JSZip уже в зависимостях), а не на воркере: приватные
 * ответы не попадают в публичный storage, и нет квоты «1 генерация в день».
 */
import JSZip from "jszip";

export type ExamAnswerItem = {
  n: number;
  text: string;
  answer: string | null;
  type?: string | null;
  source?: string | null;
};

export type ExamAnswerGroup = { topic: string | null; items: ExamAnswerItem[] };

export type ExamAnswersDocument = {
  subject: string;
  subjectTitle?: string | null;
  generatedAt: string;
  groups: ExamAnswerGroup[];
  truncated?: boolean;
};

const CONTENT_TYPES = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
  '<Default Extension="xml" ContentType="application/xml"/>',
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
  "</Types>",
].join("");

const RELS = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
  "</Relationships>",
].join("");

/** Управляющие символы недопустимы в XML — их вырезаем, остальное экранируем. */
export function escapeXml(value: string): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function run(value: string, options: { bold?: boolean; size?: number } = {}): string {
  const props = `${options.bold ? "<w:b/>" : ""}${options.size ? `<w:sz w:val="${options.size}"/>` : ""}`;
  const lines = String(value ?? "").split("\n");
  const text = lines
    .map((line, index) => `${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
    .join("");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${text}</w:r>`;
}

function paragraph(value: string, options: { bold?: boolean; size?: number; after?: number } = {}): string {
  const after = options.after ?? 120;
  return `<w:p><w:pPr><w:spacing w:after="${after}" w:line="276" w:lineRule="auto"/></w:pPr>${run(value, options)}</w:p>`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

export function buildDocumentBody(doc: ExamAnswersDocument): string {
  const title = doc.subjectTitle?.trim() || doc.subject;
  const total = doc.groups.reduce((sum, group) => sum + group.items.length, 0);
  const answered = doc.groups.reduce(
    (sum, group) => sum + group.items.filter((item) => item.answer).length,
    0,
  );
  const parts: string[] = [];
  parts.push(paragraph(`Ответы к экзамену — ${title}`, { bold: true, size: 32, after: 80 }));
  parts.push(
    paragraph(
      `Вопросов: ${total} · с ответом: ${answered} · подготовлено ${formatDate(doc.generatedAt)}`,
      { size: 18, after: 240 },
    ),
  );
  if (doc.truncated) {
    parts.push(
      paragraph(
        "В документ вошли не все вопросы банка (лимит выгрузки). Откройте список вопросов на сайте, чтобы увидеть остальные.",
        { size: 18, after: 200 },
      ),
    );
  }

  for (const group of doc.groups) {
    parts.push(paragraph(group.topic || "Без темы", { bold: true, size: 26, after: 120 }));
    for (const item of group.items) {
      parts.push(paragraph(`${item.n}. ${item.text}`, { bold: true, size: 22, after: 60 }));
      parts.push(paragraph(item.answer ? `Ответ: ${item.answer}` : "Ответ не опубликован.", { size: 22, after: 200 }));
    }
  }
  return parts.join("");
}

export async function buildExamAnswersDocx(doc: ExamAnswersDocument): Promise<Blob> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file(
    "word/document.xml",
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      buildDocumentBody(doc),
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>',
      "</w:body></w:document>",
    ].join(""),
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}

/** Имя файла без спецсимволов: «Ответы-к-экзамену-physiology.docx». */
export function examAnswersFileName(subject: string): string {
  // Точки — тоже разделители: иначе "../../etc/passwd" превращается в имя
  // с «..», которое браузеры чистят по-своему.
  const safe = String(subject || "subject")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 60) || "subject";
  return `Ответы-к-экзамену-${safe}.docx`;
}
