/**
 * Встроенный просмотр DOCX.
 *
 * Документ разбирается из OOXML: абзацы, заголовки, списки, таблицы, картинки
 * и базовое форматирование (жирный, курсив, подчёркивание). Макросы, поля,
 * embedded objects и внешние ссылки не исполняются — они остаются текстом.
 *
 * Это просмотр, а не редактор: исходный файл не изменяется.
 */
import JSZip from "jszip";
import { DEFAULT_LIMITS } from "../limits";
import type { PreviewLimits } from "../types";
import {
  findChild,
  findChildren,
  findDescendant,
  findDescendants,
  getAttr,
  isElement,
  localName,
  normalizeWhitespace,
  parseXml,
  textContent,
  type XmlNode,
} from "../xml";

export type DocRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type DocBlock =
  | { type: "heading"; level: number; runs: DocRun[] }
  | { type: "paragraph"; runs: DocRun[]; list?: { level: number; ordered: boolean } }
  | { type: "table"; rows: string[][] }
  | { type: "image"; src: string; alt: string }
  | { type: "note"; text: string };

export type DocxDocument = {
  blocks: DocBlock[];
  warnings: string[];
  truncated: boolean;
};

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  emf: "image/emf",
  wmf: "image/wmf",
};

const MAX_BLOCKS = 4_000;

function truthyProp(node: XmlNode | null): boolean {
  if (!node) return false;
  const value = (getAttr(node, "val") ?? "").toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
}

function runProperties(run: XmlNode): Pick<DocRun, "bold" | "italic" | "underline"> {
  const props = findChild(run, "rPr");
  if (!props) return {};
  return {
    bold: truthyProp(findChild(props, "b")) || undefined,
    italic: truthyProp(findChild(props, "i")) || undefined,
    underline: (findChild(props, "u") ? getAttr(findChild(props, "u")!, "val") !== "none" : false) || undefined,
  };
}

function runText(node: XmlNode): string {
  let text = "";
  for (const child of node.children) {
    const name = localName(child.name);
    if (name === "t") text += textContent(child);
    else if (name === "tab") text += "\t";
    else if (name === "br" || name === "cr") text += "\n";
    else if (name === "noBreakHyphen") text += "-";
    else if (name === "rPr") continue;
    else text += runText(child);
  }
  return text;
}

function collectRuns(node: XmlNode, out: DocRun[]): void {
  for (const child of node.children) {
    if (isElement(child, "r")) {
      const text = runText(child);
      if (text) out.push({ text, ...runProperties(child) });
      continue;
    }
    collectRuns(child, out);
  }
}

function paragraphStyle(node: XmlNode): { headingLevel: number | null; list: { level: number; ordered: boolean } | null } {
  const props = findChild(node, "pPr");
  if (!props) return { headingLevel: null, list: null };

  const styleNode = findChild(props, "pStyle");
  const styleId = (styleNode ? getAttr(styleNode, "val") ?? "" : "").trim();

  let headingLevel: number | null = null;
  const headingMatch = /^heading\s*(\d)$/i.exec(styleId);
  if (headingMatch) headingLevel = Math.min(6, Math.max(1, Number(headingMatch[1])));
  else if (/^title$/i.test(styleId)) headingLevel = 1;
  else if (/^subtitle$/i.test(styleId)) headingLevel = 2;

  const outlineNode = findChild(props, "outlineLvl");
  if (headingLevel === null && outlineNode) {
    const level = Number(getAttr(outlineNode, "val"));
    if (Number.isFinite(level) && level >= 0 && level < 6) headingLevel = level + 1;
  }

  const numPr = findChild(props, "numPr");
  let list: { level: number; ordered: boolean } | null = null;
  if (numPr) {
    const ilvl = findChild(numPr, "ilvl");
    const level = ilvl ? Number(getAttr(ilvl, "val")) : 0;
    list = { level: Number.isFinite(level) ? Math.min(8, Math.max(0, level)) : 0, ordered: false };
  }

  return { headingLevel, list };
}

function tableRows(node: XmlNode): string[][] {
  const rows: string[][] = [];
  for (const row of findChildren(node, "tr")) {
    const cells: string[] = [];
    for (const cell of findChildren(row, "tc")) {
      const paragraphs = findChildren(cell, "p").map((paragraph) => {
        const runs: DocRun[] = [];
        collectRuns(paragraph, runs);
        return runs.map((run) => run.text).join("");
      });
      cells.push(normalizeWhitespace(paragraphs.join("\n")));
      const props = findChild(cell, "tcPr");
      const span = props ? findChild(props, "gridSpan") : null;
      const extra = span ? Number(getAttr(span, "val")) : 0;
      for (let index = 1; index < extra; index += 1) cells.push("");
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function resolvePartPath(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = [...base.split("/").slice(0, -1), ...target.split("/")];
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

async function readRelations(zip: JSZip, path: string, base: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const relsFile = zip.file(path);
  if (!relsFile) return map;
  const root = parseXml(await relsFile.async("string"));
  for (const node of findDescendants(root, "Relationship")) {
    const id = node.attrs.Id ?? getAttr(node, "Id");
    const target = node.attrs.Target ?? getAttr(node, "Target");
    if (!id || !target) continue;
    map.set(id, resolvePartPath(base, target));
  }
  return map;
}

async function imageDataUrl(
  zip: JSZip,
  path: string,
  limits: PreviewLimits,
): Promise<string | null> {
  const file = zip.file(path);
  if (!file) return null;
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const mime = IMAGE_MIME[extension];
  if (!mime) return null;
  const base64 = await file.async("base64");
  if (base64.length * 0.75 > limits.maxDocImageBytes) return null;
  return `data:${mime};base64,${base64}`;
}

export async function parseDocx(
  data: ArrayBuffer | Uint8Array,
  limits: PreviewLimits = DEFAULT_LIMITS,
): Promise<DocxDocument> {
  const zip = await JSZip.loadAsync(data);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("Это не DOCX: в контейнере нет word/document.xml");

  const warnings: string[] = [];
  const root = parseXml(await documentFile.async("string"));
  const body = findDescendant(root, "body");
  if (!body) throw new Error("Документ пуст");

  const relations = await readRelations(zip, "word/_rels/document.xml.rels", "word/document.xml");

  const blocks: DocBlock[] = [];
  let images = 0;
  let truncated = false;

  const pushImage = async (embedId: string) => {
    if (images >= limits.maxDocImages) {
      if (!warnings.includes("Часть изображений не показана: превышен предел.")) {
        warnings.push("Часть изображений не показана: превышен предел.");
      }
      return;
    }
    const target = relations.get(embedId);
    if (!target) return;
    try {
      const src = await imageDataUrl(zip, target, limits);
      if (!src) {
        warnings.push("Одно изображение пропущено: формат или размер не поддержан.");
        return;
      }
      images += 1;
      blocks.push({ type: "image", src, alt: `Изображение ${images}` });
    } catch {
      warnings.push("Одно изображение не удалось прочитать.");
    }
  };

  for (const child of body.children) {
    if (blocks.length >= MAX_BLOCKS) {
      truncated = true;
      break;
    }
    const name = localName(child.name);
    if (name === "p") {
      const runs: DocRun[] = [];
      collectRuns(child, runs);
      const { headingLevel, list } = paragraphStyle(child);

      const blips = findDescendants(child, "blip")
        .map((blip) => getAttr(blip, "embed"))
        .filter((value): value is string => Boolean(value));

      if (runs.length) {
        if (headingLevel) blocks.push({ type: "heading", level: headingLevel, runs });
        else blocks.push({ type: "paragraph", runs, list: list ?? undefined });
      }
      for (const embed of blips) await pushImage(embed);
      continue;
    }
    if (name === "tbl") {
      const rows = tableRows(child);
      if (rows.length) blocks.push({ type: "table", rows });
    }
  }

  if (!blocks.length) warnings.push("В документе нет текста, который можно показать.");
  return { blocks, warnings, truncated };
}
