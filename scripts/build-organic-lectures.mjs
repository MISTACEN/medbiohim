#!/usr/bin/env node
/**
 * PDF учебников → HTML-лекции по органической химии.
 *
 * Задача: собрать лекции из Травеня с последующей правкой по Тюкавкиной —
 * оригинальные формулировки сохраняются (блок «как в учебнике»), упрощённое
 * объяснение добавляется только там, где оно есть в источнике.
 *
 * Скрипт:
 *  1. извлекает текст постранично (`unpdf`, pdfjs внутри);
 *  2. отказывается работать со сканами — если в среднем меньше 400 символов
 *     на страницу, текстового слоя нет и нужен OCR;
 *  3. убирает повторяющиеся колонтитулы и склеивает переносы слов;
 *  4. режет текст на разделы по заголовкам («ГЛАВА 3», «3.2. Алкены»);
 *  5. пишет лекции в public/content/portals/lectures-chem-organic.json.
 *
 * Запуск:
 *   node scripts/build-organic-lectures.mjs scripts/organic-lectures.config.json
 *
 * Конфиг: [{ "file": "...", "id": "org-travень-alkany", "title": "...", "book": "travень" }]
 */
import fs from "node:fs";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";

const CFG = process.argv[2];
if (!CFG) {
  console.error("usage: node build-organic-lectures.mjs <config.json>");
  process.exit(2);
}

const TARGET = "public/content/portals/lectures-chem-organic.json";
const MIN_CHARS_PER_PAGE = 400;

const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Колонтитулы: строки, повторяющиеся почти на каждой странице. */
function stripRunningHeads(pages) {
  const counts = new Map();
  for (const page of pages) {
    const lines = page.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of new Set(lines)) {
      if (line.length > 80) continue;
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, Math.floor(pages.length * 0.3));
  const noise = new Set([...counts].filter(([, count]) => count >= threshold).map(([line]) => line));
  return pages.map((page) =>
    page
      .split("\n")
      .filter((line) => !noise.has(line.trim()))
      .join("\n"),
  );
}

/** Переносы и «рваные» строки сканированного текста. */
function tidy(text) {
  return text
    .replace(/-\n(?=[а-яёa-z])/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Заголовок раздела: «ГЛАВА 4», «4.2. Алкены», «Тема 7. Спирты». */
function headingOf(line) {
  const trimmed = line.trim();
  if (trimmed.length > 90) return null;
  if (/^ГЛАВА\s+\d+/i.test(trimmed)) return { level: 2, text: trimmed };
  if (/^\d+\.\d+\.\s+\S/.test(trimmed) && !/[.;]$/.test(trimmed)) return { level: 3, text: trimmed };
  if (/^(Тема|Раздел)\s+\d+/i.test(trimmed)) return { level: 2, text: trimmed };
  return null;
}

function toHtml(text) {
  const out = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = headingOf(line);
    if (heading) {
      out.push(`<h${heading.level}>${escapeHtml(heading.text)}</h${heading.level}>`);
    } else if (line.length < 80 && /^[-–—•]\s+/.test(line)) {
      out.push(`<li>${escapeHtml(line.replace(/^[-–—•]\s+/, ""))}</li>`);
    } else {
      out.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  return out
    .join("\n")
    .replace(/(<\/li>\n?)(?!<li>)/g, "$1")
    .replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`);
}

const config = JSON.parse(fs.readFileSync(CFG, "utf8"));
const lectures = fs.existsSync(TARGET)
  ? JSON.parse(fs.readFileSync(TARGET, "utf8"))
  : { subject: "Органическая химия", items: [], stats: {} };
lectures.items ??= [];

let failed = 0;
for (const entry of config) {
  if (!fs.existsSync(entry.file)) {
    console.log(`пропуск (нет файла): ${entry.file}`);
    failed += 1;
    continue;
  }
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(entry.file)));
  const { text: pages } = await extractText(pdf, { mergePages: false });
  const average = pages.reduce((sum, page) => sum + page.trim().length, 0) / Math.max(pages.length, 1);
  if (average < MIN_CHARS_PER_PAGE) {
    console.log(
      `СТОП «${path.basename(entry.file)}»: ${pages.length} страниц, в среднем ${Math.round(average)} символов — это скан без текстового слоя, нужен OCR`,
    );
    failed += 1;
    continue;
  }

  const body = tidy(stripRunningHeads(pages).join("\n\n"));
  const html = toHtml(body);
  const item = { id: entry.id, title: entry.title, html, source: path.basename(entry.file) };
  const index = lectures.items.findIndex((existing) => existing.id === entry.id);
  if (index >= 0) lectures.items[index] = item;
  else lectures.items.push(item);
  console.log(`${entry.id}: ${pages.length} стр., ${html.length} символов HTML`);
}

lectures.stats = { ...(lectures.stats ?? {}), lectures: lectures.items.length };
if (lectures.items.length) {
  fs.writeFileSync(TARGET, `${JSON.stringify(lectures, null, 1)}\n`);
  console.log(`записано: ${TARGET} (${lectures.items.length} лекций)`);
}
if (failed) {
  console.log(`\nНе собрано источников: ${failed}. Для сканов нужен OCR (Tesseract + rus), иначе текста нет.`);
  process.exitCode = 1;
}
