#!/usr/bin/env node
/**
 * Чинит формулы в портальных лекциях: переносит LaTeX внутрь блоков .lec-math.
 *
 * LectureRenderer рендерит KaTeX только для элементов `.lec-math`. Импорт из
 * DOCX/HTML оставил формулы в тексте — `\(x\)`, `\[…\]` или вовсе `[ 2H_2 … ]`,
 * поэтому студент видел «\rightarrow» вместо уравнения.
 *
 * Скрипт работает сканером, а не регулярками:
 *   - уже размеченные `<div|span class="lec-math">` не трогаются;
 *   - `\(…\)` → `<span class="lec-math">\(…\)</span>`,
 *     `\[…\]` → `<div class="lec-math">\[…\]</div>`;
 *   - голые `[ … ]` / `( … )` конвертируются только с LaTeX-командой внутри,
 *     с учётом вложенных скобок и только если KaTeX разбирает формулу без ошибки;
 *   - формула не должна пересекать HTML-тег;
 *   - если после правок разметка стала несбалансированной, лекция откатывается;
 *   - убирается случайно вставленная просьба в начале лекции («можешь расписать…»).
 *
 * Использование:
 *   node scripts/fix-portal-latex.mjs --check
 *   node scripts/fix-portal-latex.mjs
 */
import fs from "node:fs";
import path from "node:path";
import katex from "katex";

const CHECK = process.argv.includes("--check");
const PORTALS = "public/content/portals";
const FILES = [
  "lectures-chem.json",
  "lectures-chem-organic.json",
  "lectures-math.json",
  "lectures-phys.json",
  "lectures-bio.json",
];
const BS = String.fromCharCode(92);
// Двойной BS в строке — это литеральный обратный слэш в регулярке.
const CMD = new RegExp(BS + BS + "[a-zA-Z]{2,}");
const MATH_BLOCK = /<(div|span) class="lec-math">[\s\S]*?<\/\1>/g;

function renders(tex, display) {
  try {
    katex.renderToString(tex, { throwOnError: true, displayMode: display, strict: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Индекс закрывающей скобки с учётом вложенности; -1 если не нашлась. */
function findClose(text, start, open, close) {
  let depth = 0;
  for (let index = start; index < text.length && index - start < 500; index += 1) {
    if (text[index] === open) depth += 1;
    else if (text[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

const STATS = () => ({ inline: 0, display: 0, bare: 0 });

function convertChunk(text, stats) {
  const pairs = [
    { open: BS + "(", close: BS + ")", display: false, kind: "inline", nested: false },
    { open: BS + "[", close: BS + "]", display: true, kind: "display", nested: false },
    { open: "(", close: ")", display: false, kind: "bare", nested: true },
    { open: "[", close: "]", display: true, kind: "bare", nested: true },
  ];
  let out = "";
  let index = 0;
  while (index < text.length) {
    let matched = false;
    for (const pair of pairs) {
      if (!text.startsWith(pair.open, index)) continue;
      const from = index + pair.open.length;
      const end = pair.nested ? findClose(text, index, pair.open, pair.close) : text.indexOf(pair.close, from);
      if (end < 0) continue;
      const inner = text.slice(from, end);
      if (!inner || inner.length > 400) continue;
      if (inner.includes("<") || inner.includes(">")) continue;
      if (pair.kind === "bare" && !CMD.test(inner)) continue;
      if (!renders(inner, pair.display)) continue;
      out += pair.display
        ? `<div class="lec-math">${BS}[${inner}${BS}]</div>`
        : `<span class="lec-math">${BS}(${inner}${BS})</span>`;
      stats[pair.kind] += 1;
      index = end + pair.close.length;
      matched = true;
      break;
    }
    if (!matched) {
      out += text[index];
      index += 1;
    }
  }
  return out;
}

function stripPromptArtifact(html) {
  return html.replace(/<p>\s*(?:<strong>)?\s*можешь[\s\S]{0,400}?(?:<\/strong>)?\s*<\/p>\s*/i, "");
}

function maskMath(html) {
  const blocks = [];
  const masked = html.replace(MATH_BLOCK, (block) => {
    blocks.push(block);
    return `@@MATH${blocks.length - 1}@@`;
  });
  return { masked, blocks };
}
const unmaskMath = (text, blocks) =>
  text.replace(/@@MATH(\d+)@@/g, (_match, index) => blocks[Number(index)] ?? "");

/** Баланс разметки: добавленные формулы не должны его менять. */
function markupBalance(html) {
  const count = (needle) => html.split(needle).length - 1;
  const noMath = html.replace(MATH_BLOCK, " ");
  return {
    span: count("<span") - count("</span>"),
    div: count("<div") - count("</div>"),
    p: count("<p>") + count("<p ") - count("</p>"),
    li: count("<li>") - count("</li>"),
    ul: count("<ul") - count("</ul>"),
    noMathOpen: noMath.split("<span").length - 1,
    noMathClose: noMath.split("</span>").length - 1,
  };
}

let changedFiles = 0;
let reverted = 0;
for (const name of FILES) {
  const file = path.join(PORTALS, name);
  if (!fs.existsSync(file)) continue;
  const set = JSON.parse(fs.readFileSync(file, "utf8"));
  let changed = false;
  for (const item of set.items || []) {
    const original = item.html || "";
    const before = markupBalance(original);
    const { masked, blocks } = maskMath(original);
    const stats = STATS();
    let next = unmaskMath(convertChunk(masked, stats), blocks);
    next = stripPromptArtifact(next);
    const total = stats.inline + stats.display + stats.bare;
    if (next === original) continue;

    const after = markupBalance(next);
    const broke =
      after.span !== before.span ||
      after.div !== before.div ||
      after.p !== before.p ||
      after.li !== before.li ||
      after.ul !== before.ul ||
      after.noMathOpen !== after.noMathClose;
    if (broke) {
      console.log(`ОТКАТ ${name} · ${item.id}: правка нарушила баланс разметки`);
      reverted += 1;
      continue;
    }

    changed = true;
    const artifact = original.length - stripPromptArtifact(original).length;
    console.log(
      `${name} · ${item.id}: формул ${total} (inline ${stats.inline}, display ${stats.display}, голых ${stats.bare})` +
        (artifact ? ", убран текст-артефакт" : ""),
    );
    if (!CHECK) item.html = next;
  }
  if (changed && !CHECK) fs.writeFileSync(file, `${JSON.stringify(set, null, 1)}\n`);
  if (changed) changedFiles += 1;
}

console.log(
  (CHECK ? "Проверка: изменились бы " : "Обновлено файлов: ") + changedFiles + (reverted ? `, откатов: ${reverted}` : ""),
);
