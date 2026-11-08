"use client";

/**
 * Чтение .docx в браузере: файл — это zip, текст лежит в word/document.xml.
 * JSZip уже есть в проекте, поэтому импорт документов не тянет новых
 * зависимостей и не требует серверного парсера.
 */
import JSZip from "jszip";

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
      .replace(/<[^>]+>/g, ""),
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
