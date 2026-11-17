#!/usr/bin/env node
/**
 * Аудит архивного контента порталов (public/content/portals/*.json).
 *
 * Ищет то, что уже ломалось при интеграции старого портала course/:
 *   - легаси-разметку (navbar, модалки входа, кнопки, <script>, inline-обработчики);
 *   - интерактив без скриптов — он не работает, т.к. HTML вставляется через innerHTML;
 *   - ссылки на старые .html-страницы, которых на новом сайте нет.
 *
 * Только читает. Использование: node scripts/audit-portal-content.mjs
 * Код выхода 1, если найдены проблемы.
 */
import fs from "node:fs";
import path from "node:path";

const DIR = "public/content/portals";
const NEEDLES = [
  ["<script", "встроенный скрипт (не исполняется через innerHTML)"],
  ['class="navbar"', "легаси-навбар"],
  ['id="navToggle"', "кнопка меню легаси-навбара"],
  ['id="registerModal"', "модалка регистрации"],
  ['id="loginModal"', "модалка входа"],
  ['id="fileModal"', "модалка просмотра файла"],
  ["<button", "кнопка без обработчика"],
  ["onclick=", "inline-обработчик"],
];

const HREF = /href="([^"]+)"/g;
const problems = [];
const htmlLinks = new Map();

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const raw = fs.readFileSync(path.join(DIR, file), "utf8");

  for (const [needle, label] of NEEDLES) {
    const count = raw.split(needle).length - 1;
    if (count > 0) problems.push({ file, what: label, count });
  }

  for (const m of raw.matchAll(HREF)) {
    const href = m[1].replace(/\\+$/, "");
    if (!/\.html?$/i.test(href)) continue;
    htmlLinks.set(href, (htmlLinks.get(href) ?? 0) + 1);
  }
}

if (problems.length) {
  console.log("Легаси-разметка в контенте:");
  for (const p of problems) console.log(`  ${p.file}: ${p.what} ×${p.count}`);
} else {
  console.log("Легаси-разметка: не найдена");
}

if (htmlLinks.size) {
  console.log(`Ссылки на старые .html (${htmlLinks.size}):`);
  for (const [href, count] of [...htmlLinks].sort((a, b) => b[1] - a[1])) {
    console.log(`  ×${count} ${href}`);
  }
} else {
  console.log("Ссылки на .html: не найдены");
}

process.exit(problems.length || htmlLinks.size ? 1 : 0);
