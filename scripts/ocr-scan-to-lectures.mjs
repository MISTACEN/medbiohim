#!/usr/bin/env node
/**
 * Скан-конспекты (PDF-фото iPhone) → OCR (Tesseract rus+eng) → текст → лекции.
 *
 * Пайплайн на одну лекцию:
 *   1. pymupdf (python) рендерит страницы PDF в PNG ~200 dpi;
 *   2. tesseract --psm 6 -l rus+eng распознаёт каждую страницу;
 *   3. страницы склеиваются с маркерами, заголовки «1.» / капс → h2/h3.
 *
 * Запуск (после того как python-часть сгенерировала txt):
 *   python scripts/ocr_render.py <pdf> <png_dir>   # рендер страниц
 *   tesseract <png> <txt> -l rus+eng --psm 6       # по странице
 *   node scripts/ocr-scan-to-lectures.mjs <config.json> <target.json>
 *
 * Конфиг: [{ id, title, text: "<txt со страницами>" }]
 */
import fs from "node:fs";

const CFG_PATH = process.argv[2];
const TARGET = process.argv[3];
if (!CFG_PATH || !TARGET) {
  console.error("usage: node ocr-scan-to-lectures.mjs <config.json> <target.json>");
  process.exit(2);
}

const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Заголовок: нумерованные строки, строки-КЛАПС, «Вопрос N». */
function headingLevel(text) {
  const trimmed = text.trim();
  if (trimmed.length > 110) return 0;
  if (/^(вопрос|задача)\s+\d+/i.test(trimmed) && !/[.;,]$/.test(trimmed)) return 2;
  const numbered = trimmed.match(/^(\d+(?:\.\d+)*)[.)]?\s+\S/);
  if (numbered && !/[;:]$/.test(trimmed) && !trimmed.endsWith(".")) {
    return Math.min(numbered[1].split(".").length + 1, 3);
  }
  const letters = trimmed.replace(/[^A-Za-zА-Яа-яЁё]/g, "");
  const upper = trimmed.replace(/[^A-ZА-ЯЁ]/g, "");
  if (trimmed.length <= 80 && letters.length > 5 && upper.length / letters.length > 0.8) return 2;
  return 0;
}

function ocrTextToHtml(text) {
  const out = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (/^[\s=_—–-]{6,}$/.test(line)) continue; // разделители OCR
    const level = headingLevel(line);
    if (level) out.push(`<h${level}>${escapeHtml(line)}</h${level}>`);
    else out.push(`<p>${escapeHtml(line)}</p>`);
  }
  return out.join("\n");
}

const config = JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));
const lectures = fs.existsSync(TARGET)
  ? JSON.parse(fs.readFileSync(TARGET, "utf8"))
  : { subject: "Лекции", items: [], stats: {} };
lectures.items ??= [];

for (const entry of config) {
  if (!fs.existsSync(entry.text)) {
    console.log(`пропуск (нет файла): ${entry.text}`);
    continue;
  }
  const html = ocrTextToHtml(fs.readFileSync(entry.text, "utf8"));
  const item = { id: entry.id, title: entry.title, html, source: "OCR (Tesseract rus+eng)" };
  const index = lectures.items.findIndex((existing) => existing.id === entry.id);
  if (index >= 0) lectures.items[index] = item;
  else lectures.items.push(item);
  console.log(`${entry.id}: ${html.length} символов HTML`);
}

lectures.stats = { ...(lectures.stats ?? {}), lectures: lectures.items.length };
fs.writeFileSync(TARGET, `${JSON.stringify(lectures, null, 1)}\n`);
console.log(`записано: ${TARGET} (${lectures.items.length} лекций)`);
