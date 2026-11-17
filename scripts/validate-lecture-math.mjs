#!/usr/bin/env node
/**
 * Валидация KaTeX-формул во всех лекционных JSON (lectures-chem*.json).
 * Ловит битые LaTeX-блоки до деплоя: баланс скобок, неизвестные команды.
 *
 *   node scripts/validate-lecture-math.mjs
 */
import fs from "node:fs";
import katex from "katex";

const FILES = [
  "public/content/portals/lectures-chem.json",
  "public/content/portals/lectures-chem-organic.json",
  "public/content/portals/lectures-bio.json",
  "public/content/portals/lectures-math.json",
  "public/content/portals/lectures-phys.json",
];

let total = 0;
let failed = 0;
for (const file of FILES) {
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const item of data.items ?? []) {
    // display-блоки \[...\] (lec-math) и inline \((...)\)
    const matches = [...item.html.matchAll(/\\\[((?:.|\n)*?)\\\]|\\\(((?:.|\n)*?)\\\)/g)];
    for (const match of matches) {
      const formula = (match[1] ?? match[2] ?? "").trim();
      if (!formula) continue;
      total += 1;
      try {
        katex.renderToString(formula, { displayMode: match[1] != null, throwOnError: true, strict: false });
      } catch (error) {
        failed += 1;
        console.log(`БИТая ФОРМУЛА ${item.id}: ${error.message.slice(0, 120)}\n   ${formula.slice(0, 120)}`);
      }
    }
  }
  console.log(`${file}: проверено формул`);
}
console.log(`\nитого: ${total} формул, битых ${failed}`);
if (failed) process.exitCode = 1;
