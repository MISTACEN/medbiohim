/**
 * Текстовые форматы: CSV и Markdown.
 *
 * Markdown разбирается в собственные блоки, а не в HTML: тогда встроенный
 * просмотр не может выполнить чужой скрипт. Ссылки допускаются только
 * http/https, всё остальное остаётся текстом.
 */
import { DEFAULT_LIMITS } from "./limits";
import type { PreviewLimits } from "./types";

export type CsvTable = {
  rows: string[][];
  delimiter: string;
  truncated: boolean;
};

function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string, limits: PreviewLimits = DEFAULT_LIMITS): CsvTable {
  const text = String(input ?? "").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let truncated = false;

  const pushField = () => {
    row.push(field.slice(0, 2000));
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((cell) => cell.trim().length > 0) || rows.length === 0) {
      rows.push(row.slice(0, limits.maxCsvCols));
    }
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      pushField();
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      pushRow();
      if (rows.length >= limits.maxCsvRows) {
        truncated = true;
        break;
      }
      continue;
    }
    field += char;
  }

  if (!truncated && (field.length || row.length)) pushRow();
  if (rows.length > limits.maxCsvRows) {
    rows.length = limits.maxCsvRows;
    truncated = true;
  }

  return { rows, delimiter, truncated };
}

export type InlineToken = {
  type: "text" | "bold" | "italic" | "code" | "link";
  text: string;
  href?: string;
};

const INLINE_PATTERN = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\((https?:\/\/[^)\s]+)\))/;

export function inlineMarkdown(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let rest = String(input ?? "");

  while (rest.length) {
    const match = INLINE_PATTERN.exec(rest);
    if (!match || match.index === undefined) break;
    if (match.index > 0) tokens.push({ type: "text", text: rest.slice(0, match.index) });

    const [full, code, bold, italic, link, href] = match;
    if (code) tokens.push({ type: "code", text: code.slice(1, -1) });
    else if (bold) tokens.push({ type: "bold", text: bold.slice(2, -2) });
    else if (italic) tokens.push({ type: "italic", text: italic.slice(1, -1) });
    else if (link && href) tokens.push({ type: "link", text: link.slice(1, link.indexOf("]")), href });

    rest = rest.slice(match.index + full.length);
  }

  if (rest.length) tokens.push({ type: "text", text: rest });
  return tokens;
}

export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; language: string; text: string }
  | { type: "quote"; text: string }
  | { type: "rule" };

const LIST_PATTERN = /^\s{0,3}([-*+]|\d{1,3}[.)])\s+(.*)$/;

export function parseMarkdown(input: string, limits: PreviewLimits = DEFAULT_LIMITS): MarkdownBlock[] {
  const text = String(input ?? "").replace(/\r\n?/g, "\n").slice(0, limits.maxTextChars);
  const lines = text.split("\n");
  const blocks: MarkdownBlock[] = [];

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  let code: { language: string; lines: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: "list", ordered: list.ordered, items: list.items });
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push({ type: "quote", text: quote.join(" ").trim() });
      quote = [];
    }
  };

  for (const line of lines) {
    if (code) {
      if (/^\s*```/.test(line)) {
        blocks.push({ type: "code", language: code.language, text: code.lines.join("\n") });
        code = null;
      } else {
        code.lines.push(line);
      }
      continue;
    }

    const fence = /^\s*```(\S*)\s*$/.exec(line);
    if (fence) {
      flushParagraph();
      flushList();
      flushQuote();
      code = { language: fence[1] ?? "", lines: [] };
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      continue;
    }

    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push({ type: "rule" });
      continue;
    }

    const listMatch = LIST_PATTERN.exec(line);
    if (listMatch) {
      flushParagraph();
      flushQuote();
      const ordered = /\d/.test(listMatch[1]);
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push(listMatch[2].trim());
      continue;
    }

    const quoteMatch = /^\s*>\s?(.*)$/.exec(line);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quote.push(quoteMatch[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }

  if (code) blocks.push({ type: "code", language: code.language, text: code.lines.join("\n") });
  flushParagraph();
  flushList();
  flushQuote();

  return blocks;
}

/** Текст для `text`-просмотра: строки без управляющих символов, с пределом. */
export function normalizePlainText(input: string, limits: PreviewLimits = DEFAULT_LIMITS): string {
  return String(input ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .slice(0, limits.maxTextChars);
}
