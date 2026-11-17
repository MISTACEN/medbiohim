#!/usr/bin/env node
/**
 * Извлечение текста учебников в txt (для подготовки лекций).
 * Запуск: node scripts/extract-book-text.mjs <pdf> <out.txt>
 */
import fs from "node:fs";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node extract-book-text.mjs <pdf> <out.txt>");
  process.exit(2);
}

const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(input)));
const { text: pages } = await extractText(pdf, { mergePages: false });
const average = pages.reduce((sum, page) => sum + page.trim().length, 0) / Math.max(pages.length, 1);
const chunks = pages.map((page, i) => `===== стр. ${i + 1} =====\n${page.trim()}`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, chunks.join("\n\n"), "utf8");
console.log(`${path.basename(input)}: ${pages.length} стр., среднее ${Math.round(average)} симв./стр. → ${output}`);
