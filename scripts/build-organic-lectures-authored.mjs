#!/usr/bin/env node
/**
 * Собирает авторские лекции по органической химии (курс МБХ-201) в
 * public/content/portals/lectures-chem-organic.json.
 *
 * Контент — модули scripts/organic-lectures/org-*.mjs
 * (export const LECTURE = { id, title, part, topic, blocks }).
 *
 * Базовый учебник — В.Ф. Травень «Органическая химия» (переработка),
 * дополнения — канонический курс под ред. Н.А. Тюкавкиной.
 * Блоки:
 *   h2/h3 — заголовки, p — абзац, ul — список, eq — уравнение (KaTeX \\[…\\]),
 *   note — врезка-итог, def — «как в учебнике» (оригинальная формулировка),
 *   simple — «проще говоря» (упрощённое объяснение), table — таблица.
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const DIR = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "organic-lectures");
const TARGET = "public/content/portals/lectures-chem-organic.json";
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(blocks) {
  const out = [];
  for (const block of blocks) {
    switch (block.t) {
      case "h2": out.push(`<h2>${escapeHtml(block.v)}</h2>`); break;
      case "h3": out.push(`<h3>${escapeHtml(block.v)}</h3>`); break;
      case "eq": out.push(`<div class="lec-math">\\[${block.v}\\]</div>`); break;
      case "note": out.push(`<p><strong>${escapeHtml(block.v)}</strong></p>`); break;
      case "ul":
        out.push(`<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
        break;
      case "def":
        out.push(
          `<div class="lec-def"><p><em>Как в учебнике:</em> ${escapeHtml(block.v)}</p></div>`,
        );
        break;
      case "simple":
        out.push(`<div class="lec-simple"><p>${escapeHtml(block.v)}</p></div>`);
        break;
      case "table": {
        const [head, ...rows] = block.rows;
        const th = `<tr>${head.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
        const tr = rows
          .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
          .join("");
        out.push(`<table><thead>${th}</thead><tbody>${tr}</tbody></table>`);
        break;
      }
      default: out.push(`<p>${escapeHtml(block.v)}</p>`);
    }
  }
  return out.join("\n");
}

const files = fs
  .readdirSync(DIR)
  .filter((name) => /^org-.*\.mjs$/.test(name))
  .sort();
if (!files.length) {
  console.error("нет модулей в scripts/organic-lectures/");
  process.exit(2);
}

const items = [];
for (const file of files) {
  const mod = await import(url.pathToFileURL(path.join(DIR, file)).href);
  const lecture = mod.LECTURE;
  if (!lecture?.id || !lecture?.title || !Array.isArray(lecture?.blocks)) {
    console.error(`${file}: нет LECTURE {id,title,blocks} — пропуск`);
    continue;
  }
  items.push({
    id: lecture.id,
    title: lecture.title,
    html: render(lecture.blocks),
    part: lecture.part ?? null,
    topic: lecture.topic ?? null,
  });
  console.log(`${lecture.id}: ${items.at(-1).html.length} символов HTML`);
}

const data = {
  subject: "Органическая химия · курс МБХ-201",
  sources: "В.Ф. Травень «Органическая химия» (переработка) + курс под ред. Н.А. Тюкавкиной",
  items,
  stats: { lectures: items.length },
};
fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, `${JSON.stringify(data, null, 1)}\n`);
console.log(`записано: ${TARGET} (${items.length} лекций)`);
