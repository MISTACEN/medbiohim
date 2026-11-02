"use client";

/**
 * Импорт своего документа в лекцию.
 *
 * .md и .txt читаются напрямую, .docx разбирается на клиенте (JSZip уже есть в
 * проекте — никаких новых тяжёлых зависимостей), .pdf отдаёт текстовый слой в
 * Worker (unpdf), фото страницы распознаёт OCR-шлюз. Дальше текст проходит ту
 * же авторазметку, что и кнопка «Разметить текст»: абзацы и разделы.
 */
import JSZip from "jszip";
import { extractPdfText, ocrImage } from "@/lib/api";
import { structureLectureMarkdown } from "./structureMarkdown";

export type ImportedDocument = {
  title: string;
  markdown: string;
  source: "md" | "txt" | "docx" | "pdf" | "image";
  chars: number;
  headings: number;
};

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

function documentTitle(name: string): string {
  const base = String(name || "").replace(/\.[^.]+$/, "").trim();
  return base || "Импортированный документ";
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_all, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

/** XML Word → текст: абзацы через пустую строку, табы и переносы сохраняются. */
export function docxXmlToText(xml: string): string {
  return decodeEntities(
    String(xml || "")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function readDocxText(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("В .docx не найден word/document.xml — пересохраните файл в Word");
  return docxXmlToText(await entry.async("string"));
}

export async function importDocument(file: File): Promise<ImportedDocument> {
  const name = String(file.name || "").toLowerCase();
  const type = String(file.type || "");
  let text = "";
  let source: ImportedDocument["source"] = "txt";

  if (name.endsWith(".docx") || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    source = "docx";
    text = await readDocxText(file);
  } else if (name.endsWith(".md") || name.endsWith(".markdown")) {
    source = "md";
    text = await file.text();
  } else if (name.endsWith(".txt") || type.startsWith("text/")) {
    source = "txt";
    text = await file.text();
  } else if (name.endsWith(".pdf") || type === "application/pdf") {
    source = "pdf";
    if (file.size > MAX_PDF_BYTES) throw new Error("PDF больше 8 МБ — разбейте файл на части");
    const result: any = await extractPdfText(await fileToBase64(file));
    if (!result?.ok) throw new Error(result?.error?.message || "Не удалось прочитать PDF");
    text = String(result.data?.text || "");
  } else if (type.startsWith("image/")) {
    source = "image";
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Изображение больше 6 МБ — уменьшите его");
    const result: any = await ocrImage({ image_base64: await fileToBase64(file), mime: type });
    if (!result?.ok) throw new Error(result?.error?.message || "OCR не смог распознать страницу");
    text = String(result.data?.text || "");
  } else if (name.endsWith(".doc")) {
    throw new Error("Старый .doc не поддерживается — сохраните файл как .docx");
  } else {
    throw new Error("Поддерживаются .md, .txt, .docx, .pdf и фото страницы");
  }

  if (!text.trim()) throw new Error("В документе не нашлось текста");

  const structured = structureLectureMarkdown(text);
  return {
    title: documentTitle(file.name),
    markdown: structured.markdown,
    source,
    chars: structured.markdown.replace(/\s+/g, " ").trim().length,
    headings: structured.headings,
  };
}
