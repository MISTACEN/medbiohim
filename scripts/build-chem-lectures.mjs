#!/usr/bin/env node
/**
 * DOCX → HTML-лекции химии для портала (без Word/PDF в браузере).
 *
 * Разбирает word/document.xml через jszip (новых зависимостей не нужно) и
 * собирает фрагменты, которые рендерит LectureRenderer:
 * заголовки → h2/h3, абзацы, маркированные и нумерованные списки, таблицы,
 * жирный/курсив, верхние и нижние индексы (химические формулы вроде H₂SO₄).
 *
 * Использование:
 *   node scripts/build-chem-lectures.mjs <config.json> [target.json]
 *
 * Второй аргумент — целевой лекционный JSON (по умолчанию
 * public/content/portals/lectures-chem.json). Конфиг — массив
 * { file, id, title }: файл существует → лекция добавляется/заменяется.
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const CFG_PATH = process.argv[2];
if (!CFG_PATH) {
  console.error("usage: node build-chem-lectures.mjs <config.json>");
  process.exit(2);
}
const TARGET = process.argv[3] ?? "public/content/portals/lectures-chem.json";

const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Уровень заголовка по тексту: в этих docx стили не проставлены — заголовки
 * отличаются только нумерацией («1.2. Расчёт скорости») и капсом («ШПАРГАЛКА»).
 */
function headingLevel(text) {
  const numbered = text.match(/^(\d+(?:\.\d+)*)\.?\s+\S/);
  // точка в конце разрешена (конспекты биологии: «1. Первое правило Менделя.»),
  // но «;» и «:» — признак контентной строки
  if (numbered && text.length <= 110 && !/[;:]$/.test(text)) {
    return Math.min(numbered[1].split(".").length + 1, 4);
  }
  const letters = text.replace(/[^A-Za-zА-Яа-яЁё]/g, "");
  const upper = text.replace(/[^A-ZА-ЯЁ]/g, "");
  if (text.length <= 90 && letters.length > 6 && upper.length / letters.length > 0.85) return 3;
  if (/^(глава|раздел|тема|модуль)\b/i.test(text) && text.length <= 100) return 2;
  // экзаменационные конспекты: «Вопрос 1: Онтогенез и его этапы»
  if (/^вопрос\s+\d+/i.test(text) && text.length <= 100) return 2;
  return 0;
}

/** Один абзац Word → HTML-блок. */
function paragraphToHtml(xml, options = {}) {
  const isList = /<w:numPr>/i.test(xml);
  const runs = [...xml.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)].map((m) => m[0]);
  let text = "";
  for (const run of runs) {
    const parts = [...run.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
    if (!parts.length) {
      if (/<w:(br|tab)\b/.test(run)) text += " ";
      continue;
    }
    let chunk = escapeHtml(parts.join(""));
    if (/<w:b\b(?![^>]*w:val="(0|false)")/i.test(run)) chunk = `<strong>${chunk}</strong>`;
    if (/<w:i\b(?![^>]*w:val="(0|false)")/i.test(run)) chunk = `<em>${chunk}</em>`;
    const align = run.match(/<w:vertAlign w:val="(\w+)"/i)?.[1];
    if (align === "superscript") chunk = `<sup>${chunk}</sup>`;
    if (align === "subscript") chunk = `<sub>${chunk}</sub>`;
    text += chunk;
  }
  // Формулы Word (Office Math) живут в <m:t>, а не в <w:t> — без этого они терялись.
  const math = [...xml.matchAll(/<m:t\b[^>]*>([\s\S]*?)<\/m:t>/g)].map((m) => m[1]).join("");
  if (math.trim()) text += ` <code class="formula">${escapeHtml(math.replace(/\s+/g, " ").trim())}</code>`;

  text = text.replace(/\s+/g, " ").trim();
  if (!text) return null;

  if (!options.plain) {
    // Заголовок определяем по чистому тексту: жирные run'ы обёрнуты в <strong>,
    // иначе нумерация «1.2.» не видна регулярке.
    const plainText = text.replace(/<[^>]+>/g, "").trim();
    const level = headingLevel(plainText);
    if (level) return { kind: "block", html: `<h${level}>${plainText}</h${level}>` };
  }
  if (isList) return { kind: "li", html: text };
  return { kind: "block", html: `<p>${text}</p>` };
}

/** Таблица Word → HTML-таблица. */
function tableToHtml(xml) {
  const rows = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((rowMatch) => {
    const cells = [...rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cellMatch) => {
      const paras = [...cellMatch[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
        .map((p) => paragraphToHtml(p[0], { plain: true }))
        .filter(Boolean)
        .map((p) => p.html.replace(/<\/?(p|ul|li)>/g, ""));
      return paras.join("<br />") || "&nbsp;";
    });
    return cells;
  });
  if (!rows.length) return null;
  const [head, ...body] = rows;
  const thead = `<thead><tr>${head.map((cell) => `<th>${cell.replace(/<\/?p>/g, "")}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${body
    .map((cells) => `<tr>${cells.map((cell) => `<td>${cell.replace(/<\/?p>/g, "")}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<div class="overflow-x-auto"><table>${thead}${tbody}</table></div>`;
}

async function docxToHtml(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error(`в ${file} нет word/document.xml`);
  let xml = await entry.async("string");
  xml = xml.replace(/^[\s\S]*?<w:body>/, "").replace(/<\/w:body>[\s\S]*$/, "");

  // Таблицы вынимаем первыми: внутри них тоже есть <w:p>, иначе они попадут в абзацы.
  const tables = [];
  xml = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (match) => {
    tables.push(tableToHtml(match));
    return `\u0000TABLE${tables.length - 1}\u0000`;
  });

  // Последовательность: абзацы и маркеры таблиц.
  const out = [];
  const parts = xml.split(/(\u0000TABLE\d+\u0000)/);
  let listBuffer = [];
  const flushList = () => {
    if (!listBuffer.length) return;
    out.push(`<ul>${listBuffer.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    listBuffer = [];
  };
  for (const part of parts) {
    const tableMark = part.match(/^\u0000TABLE(\d+)\u0000$/);
    if (tableMark) {
      flushList();
      const html = tables[Number(tableMark[1])];
      if (html) out.push(html);
      continue;
    }
    for (const para of part.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
      const block = paragraphToHtml(para[0]);
      if (!block) continue;
      if (block.kind === "li") listBuffer.push(block.html);
      else {
        flushList();
        out.push(block.html);
      }
    }
  }
  flushList();
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const config = JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));
const lectures = JSON.parse(fs.readFileSync(TARGET, "utf8"));
lectures.items ??= [];

for (const entry of config) {
  if (!fs.existsSync(entry.file)) {
    console.log(`пропуск (нет файла): ${entry.file}`);
    continue;
  }
  const html = await docxToHtml(entry.file);
  const item = { id: entry.id, title: entry.title, html };
  const index = lectures.items.findIndex((existing) => existing.id === entry.id);
  if (index >= 0) lectures.items[index] = item;
  else lectures.items.push(item);
  console.log(`${entry.id}: ${entry.title} — ${html.length} символов HTML`);
}

lectures.stats = { ...(lectures.stats ?? {}), lectures: lectures.items.length };
fs.writeFileSync(TARGET, `${JSON.stringify(lectures, null, 1)}\n`);
console.log(`записано: ${TARGET} (${lectures.items.length} лекций)`);
