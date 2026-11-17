#!/usr/bin/env node
/**
 * Собирает hoba-extra.json из старого портала химии (hoba/pages + hoba/modules):
 * «Критерии оценки» и обзоры модулей 1–5.
 *
 * Из исходного HTML берутся только содержательные блоки: навбар, кнопки,
 * счётчики прогресса, фильтры и ссылки на старые .html-страницы отбрасываются —
 * в React они всё равно мертвы (HTML вставляется через innerHTML).
 *
 * Использование:
 *   node scripts/build-hoba-extra.mjs "<путь к hoba>" [выход.json]
 */
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
const OUT = process.argv[3] || "public/content/portals/hoba-extra.json";

if (!SRC) {
  console.error('usage: node build-hoba-extra.mjs "<hoba dir>" [out.json]');
  process.exit(2);
}

/** Вырезает сбалансированный <div>…</div>, начиная с позиции открывающего тега. */
function sliceBalancedDiv(html, start) {
  const re = /<div\b|<\/div>/gi;
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].toLowerCase() === "</div>") {
      depth -= 1;
      if (depth === 0) return html.slice(start, m.index + m[0].length);
    } else {
      depth += 1;
    }
  }
  return html.slice(start);
}

function clean(html) {
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // иконки FontAwesome: шрифт не подключён, остались бы пустые квадраты
    .replace(/<i\b[^>]*class="[^"]*\bfa[asrb]?\b[^"]*"[^>]*>\s*<\/i>/gi, "")
    .replace(/<i\b[^>]*>\s*<\/i>/gi, "")
    // кнопки и поля — без обработчиков бесполезны
    .replace(/<button\b[\s\S]*?<\/button>/gi, "")
    .replace(/<input\b[^>]*>/gi, "")
    .replace(/<select\b[\s\S]*?<\/select>/gi, "");
  // ссылки на старые страницы: оставляем текст, href убираем
  out = out.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");
  out = out
    .replace(/\s+style="[^"]*"/gi, "")
    .replace(/\s+id="[^"]*"/gi, "")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out;
}

function textOf(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const criteriaPath = path.join(SRC, "pages", "criteria.html");
const criteriaHtml = fs.readFileSync(criteriaPath, "utf8");
// в исходном файле нет закрывающего </main> — режем до </body>
const mainStart = criteriaHtml.search(/<main\b/i);
if (mainStart < 0) throw new Error("в criteria.html не найден <main>");
const mainOpenEnd = criteriaHtml.indexOf(">", mainStart) + 1;
const lower = criteriaHtml.toLowerCase();
const closeIdx = lower.indexOf("</main>", mainStart);
const bodyEnd = closeIdx >= 0 ? closeIdx : lower.indexOf("</body>", mainStart);
const criteriaBody = criteriaHtml
  .slice(mainOpenEnd, bodyEnd >= 0 ? bodyEnd : undefined)
  .replace(/<a\b[^>]*class="back-button"[^>]*>[\s\S]*?<\/a>/gi, "");
const criteria = {
  title: "Критерии оценки",
  html: clean(criteriaBody),
};

const modules = [];
for (let n = 1; n <= 5; n += 1) {
  const file = path.join(SRC, "modules", `module${n}.html`);
  const html = fs.readFileSync(file, "utf8");
  const titleRaw = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || `Модуль ${n}`).split("|")[0].trim();

  const marker = html.indexOf('id="info-tab"');
  if (marker < 0) throw new Error(`в module${n}.html не найдена секция info-tab`);
  const divStart = html.lastIndexOf("<div", marker);
  let body = sliceBalancedDiv(html, divStart);
  // внутренний заголовок «Информация о модуле N» дублирует заголовок аккордеона
  body = body.replace(/<h2\b[^>]*>[\s\S]*?<\/h2>/i, "");

  modules.push({ module: n, title: titleRaw, html: clean(body) });
}

const payload = {
  subject: "Неорганическая химия",
  kind: "extra",
  version: 1,
  source: "hoba/pages/criteria.html + hoba/modules/module1..5.html",
  criteria,
  modules,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 1)}\n`);

console.log(`критерии: ${textOf(criteria.html).length} символов текста`);
for (const m of modules) console.log(`  модуль ${m.module}: ${m.title} — ${textOf(m.html).length} символов`);
console.log(`записано: ${OUT}`);
