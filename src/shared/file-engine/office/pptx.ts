/**
 * Встроенный просмотр PPTX.
 *
 * Слайды читаются из OOXML: заголовок, текстовые блоки, заметки и число
 * картинок. Анимации, переходы и видео не воспроизводятся — это просмотр
 * содержимого, а не плеер презентации.
 */
import JSZip from "jszip";
import { DEFAULT_LIMITS } from "../limits";
import type { PreviewLimits } from "../types";
import {
  findDescendant,
  findDescendants,
  getAttr,
  localName,
  normalizeWhitespace,
  parseXml,
  textContent,
  type XmlNode,
} from "../xml";

export type PresentationSlide = {
  index: number;
  title: string;
  lines: string[];
  notes: string[];
  images: number;
};

export type Presentation = {
  slides: PresentationSlide[];
  warnings: string[];
  truncated: boolean;
};

function slideNumber(path: string): number {
  const match = /slide(\d+)\.xml$/.exec(path);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function paragraphText(paragraph: XmlNode): string {
  let text = "";
  for (const child of paragraph.children) {
    if (localName(child.name) === "t") text += textContent(child);
    else if (localName(child.name) === "br") text += "\n";
    else text += paragraphText(child);
  }
  return text;
}

function shapeParagraphs(shape: XmlNode): string[] {
  const lines: string[] = [];
  for (const paragraph of findDescendants(shape, "p")) {
    const text = normalizeWhitespace(paragraphText(paragraph));
    if (text) lines.push(text);
  }
  return lines;
}

function isTitlePlaceholder(shape: XmlNode): boolean {
  const placeholder = findDescendant(shape, "ph");
  if (!placeholder) return false;
  const type = (getAttr(placeholder, "type") ?? "").toLowerCase();
  return type === "title" || type === "ctrtitle";
}

export async function parsePptx(
  data: ArrayBuffer | Uint8Array,
  limits: PreviewLimits = DEFAULT_LIMITS,
): Promise<Presentation> {
  const zip = await JSZip.loadAsync(data);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (!slidePaths.length) throw new Error("Это не PPTX: слайды не найдены");

  const warnings: string[] = [];
  const slides: PresentationSlide[] = [];
  const truncated = slidePaths.length > limits.maxSlides;

  for (const path of slidePaths.slice(0, limits.maxSlides)) {
    const file = zip.file(path);
    if (!file) continue;
    const root = parseXml(await file.async("string"));
    const number = slideNumber(path);

    let title = "";
    const lines: string[] = [];
    let images = 0;

    for (const shape of findDescendants(root, "sp")) {
      const paragraphs = shapeParagraphs(shape);
      if (!paragraphs.length) continue;
      if (!title && isTitlePlaceholder(shape)) {
        title = paragraphs[0];
        lines.push(...paragraphs.slice(1));
      } else {
        lines.push(...paragraphs);
      }
    }
    images = findDescendants(root, "blip").length;

    const notesFile = zip.file(`ppt/notesSlides/notesSlide${number}.xml`);
    let notes: string[] = [];
    if (notesFile) {
      const notesRoot = parseXml(await notesFile.async("string"));
      notes = findDescendants(notesRoot, "p")
        .map((paragraph) => normalizeWhitespace(paragraphText(paragraph)))
        .filter((line) => line && !/^\d+$/.test(line));
    }

    slides.push({ index: number, title, lines, notes, images });
  }

  if (truncated) warnings.push(`Показаны первые ${limits.maxSlides} слайдов.`);
  if (!slides.length) warnings.push("В презентации нет текста, который можно показать.");

  return { slides, warnings, truncated };
}
