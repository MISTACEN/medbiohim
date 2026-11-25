/**
 * Разбор «Органическая и физическая химия. Сборник тестовых заданий. Часть I».
 *
 * Вход — текстовый слой PDF (unpdf), уже собранный в tmp/chem-part1.txt.
 * Выход — JSON «тема → вопросы → варианты → ключ» и отчёт о покрытии.
 *
 * Ничего не пишет в БД: результат просматривается человеком и только потом
 * превращается в XLSX для /admin/content-import.
 *
 * Запуск: node tools/chem/parse_part1_collection.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const input = resolve(root, "tmp/chem-part1.txt");
const outJson = resolve(root, "data/chemistry/part1-collection-2026-11.json");
const outReport = resolve(root, "docs/CHEMISTRY-PART1-IMPORT-2026-11-25.md");

const FOOTER = [
  /^Органическая и физическая химия\. Сборник тестовых заданий.*$/i,
  /^Page \d+ of \d+$/i,
  /^\s*$/,
];

function cleanLines(raw) {
  return raw
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => !FOOTER.some((re) => re.test(line)))
    .map((line) => line.trim())
    .filter(Boolean);
}

const THEME_RE = /^Тема\s+(\d+\.\d+)\.\s*(.+)$/i;
const QUESTION_RE = /^(\d{1,3})(?:-(\d{1,3}))?\.\s+/;

function stripStructureNotes(text) {
  return text
    .replace(/\[структура на стр\.\s*\d+\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Варианты ответа: «1. …; 2) …». Цифры в формулах (2-этокси) не считаются. */
function splitOptions(text) {
  const marks = [...text.matchAll(/(?:^|[\s;])([1-5])[.)]\s+/g)];
  if (marks.length < 2) return { stem: text.trim(), options: [] };
  const first = marks[0];
  const options = marks.map((mark, index) => {
    const start = mark.index + mark[0].length;
    const end = index + 1 < marks.length ? marks[index + 1].index : text.length;
    return text.slice(start, end).replace(/[;\s]+$/, "").trim();
  });
  return { stem: text.slice(0, first.index).trim(), options };
}

/** Варианты-соответствия буквенные: «А. амин», «Б — кетон», «В) альдегид». */
function splitLetterOptions(text) {
  const marks = [...text.matchAll(/(?:^|[\s;(])([А-ЯЁ])\s*(?:[.)]|[—–])\s+/g)];
  if (marks.length < 2) return [];
  return marks.map((mark, index) => {
    const start = mark.index + mark[0].length;
    const end = index + 1 < marks.length ? marks[index + 1].index : text.length;
    return `${mark[1]}. ${text.slice(start, end).replace(/[;\s]+$/, "").trim()}`;
  });
}

/** Левая часть соответствия: «6) -аль; 7) -оат». */
function splitNumberedLeft(text) {
  const marks = [...text.matchAll(/(?:^|[\s;])(\d{1,3})\)\s+/g)];
  if (!marks.length) return [];
  return marks.map((mark, index) => {
    const start = mark.index + mark[0].length;
    const end = index + 1 < marks.length ? marks[index + 1].index : text.length;
    return { n: Number(mark[1]), text: text.slice(start, end).replace(/[;\s]+$/, "").trim() };
  });
}

const ANSWER_NOTE_RE = /\s*(Структурные формулы к заданиям|Структурные формулы|Примечание|Примечания|Рисунок|Схема|Таблица)\b/i;

/** Ключ + служебная сноска со страницы («Структурные формулы к заданиям 2, 4»). */
function splitAnswerNote(raw) {
  const value = String(raw || "").replace(/\s+/g, " ").trim();
  const match = value.match(ANSWER_NOTE_RE);
  if (!match) return { value, note: "" };
  return {
    value: value.slice(0, match.index).trim(),
    note: value.slice(match.index).trim(),
  };
}

function parseAnswer(raw) {
  const { value, note } = splitAnswerNote(raw);
  if (!value) return { answer: "", answerIndexes: [], pairs: [], answerKind: "none", note };

  const pairMatches = [...value.matchAll(/(\d{1,3})\s*[—–-]\s*([А-ЯЁA-Z])/g)];
  if (pairMatches.length >= 1 && /[А-ЯЁA-Z]/.test(value)) {
    return {
      answer: value,
      answerIndexes: [],
      pairs: pairMatches.map((m) => ({ n: Number(m[1]), key: m[2] })),
      answerKind: "pairs",
      note,
    };
  }

  // «1 2 3» — это порядок вариантов (ранжирование), а не три верных ответа.
  const sequence = /^\d(?:\s+\d)+$/.test(value);
  const numbers = /^\d(?:\s*[,;]\s*\d)*$/.test(value);
  if (sequence || numbers) {
    const answerIndexes = value.split(/[\s,;]+/).map(Number).filter(Number.isFinite);
    return {
      answer: value,
      answerIndexes,
      pairs: [],
      answerKind: sequence ? "sequence" : answerIndexes.length > 1 ? "multi" : "single",
      note,
    };
  }

  return { answer: value, answerIndexes: [], pairs: [], answerKind: "text", note };
}

const lines = cleanLines(readFileSync(input, "utf8"));
const themes = [];
let theme = null;
let current = null;
const orphans = [];

function pushCurrent() {
  if (!current) return;
  current.text = stripStructureNotes(current.text);
  // Варианты отделяем от формулировки: они всегда идут после основы.
  const answerSplit = current.text.split(/\s*Ответ:\s*/i);
  const body = answerSplit[0] || "";
  const answerRaw = answerSplit.slice(1).join(" Ответ: ");
  const isMatch = Boolean(current.numberTo && current.numberTo > current.number);
  const { stem, options } = splitOptions(body);
  current.stem = stem;
  current.options = isMatch ? splitLetterOptions(body) : options;
  current.left = isMatch ? splitNumberedLeft(body) : [];
  Object.assign(current, parseAnswer(answerRaw));
  current.answerRaw = answerRaw.trim();
  current.kind = isMatch ? "match" : options.length >= 2 ? "mcq" : "open";
  current.theme = theme?.id || "unclassified";
  delete current.text;
  current.issues = [];
  if (!current.answer) current.issues.push("нет ключа");
  if (current.kind === "mcq" && current.answerKind === "text") current.issues.push("ключ словами");
  if (current.kind === "match" && current.options.length === 0) current.issues.push("нет вариантов соответствия");
  theme?.questions.push(current);
  current = null;
}

for (const line of lines) {
  const themeMatch = line.match(THEME_RE);
  if (themeMatch) {
    pushCurrent();
    theme = { id: themeMatch[1], title: themeMatch[2].replace(/\s+/g, " ").trim(), questions: [] };
    themes.push(theme);
    continue;
  }
  const questionMatch = line.match(QUESTION_RE);
  if (questionMatch && theme) {
    const nextNumber = Number(questionMatch[1]);
    // Строка вариантов тоже начинается с «1.», поэтому новый вопрос заводим
    // только если у текущего уже есть ключ или это не похоже на список
    // вариантов. Иначе первый же вопрос терял свои варианты и ответ.
    const hasAnswer = /Ответ:/i.test(current?.text || "");
    const looksLikeOptions = /(?:^|\s)[2-5][.)]\s/.test(line) && line.includes(";");
    const continuation = current && !hasAnswer && (looksLikeOptions || nextNumber <= current.number);
    if (!continuation) {
      pushCurrent();
      current = {
        number: nextNumber,
        numberTo: questionMatch[2] ? Number(questionMatch[2]) : null,
        text: line.slice(questionMatch[0].length),
      };
      continue;
    }
  }
  if (current) current.text += " " + line;
  else if (line.length > 40) orphans.push(line);
}
pushCurrent();

// Оглавление даёт те же «Тема X.Y» без вопросов: склеиваем по id, оставляя
// содержательную версию и её (полное) название.
const byId = new Map();
for (const item of themes) {
  const existing = byId.get(item.id);
  if (!existing) byId.set(item.id, { ...item, questions: [...item.questions] });
  else if (item.questions.length > existing.questions.length) {
    byId.set(item.id, { ...item, questions: [...item.questions] });
  }
}
const merged = [...byId.values()];
themes.length = 0;
themes.push(...merged);

const totalQuestions = themes.reduce((sum, item) => sum + item.questions.length, 0);
const all = themes.flatMap((item) => item.questions);
const withAnswer = all.filter((q) => q.answer).length;
const mcq = all.filter((q) => q.kind === "mcq").length;
const match = all.filter((q) => q.kind === "match").length;
const open = all.filter((q) => q.kind === "open").length;
const issues = all.filter((q) => q.issues.length > 0);

writeFileSync(outJson, JSON.stringify({ source: "Часть I (ДВГМУ, 2016)", themes }, null, 2));

const rows = themes.map((item) => `| ${item.id} | ${item.title} | ${item.questions.length} |`).join("\n");
const kinds = all.reduce((acc, q) => ({ ...acc, [q.answerKind]: (acc[q.answerKind] || 0) + 1 }), {});
const notes = all.filter((q) => q.note).length;
const duplicateNumbers = all.length - new Set(all.map((q) => `${q.theme}:${q.number}`)).size;
const problemRows = issues
  .slice(0, 40)
  .map((q) => `| ${q.theme} | ${q.number}${q.numberTo ? "-" + q.numberTo : ""} | ${q.kind} | ${q.issues.join(", ")} |`)
  .join("\n");

const report = `# Химия · Часть I: разбор сборника (черновик)

Источник: \`Органическая и физическая химия. Сборник тестовых заданий. Часть I.pdf\`
(ДВГМУ, 2016; 97 страниц текстового слоя). Дата: 2026-11-25.
Статус: **черновик для проверки, в базу не загружено.**

## Итог

- тем: **${themes.length}**
- вопросов: **${totalQuestions}**
- с ключом: **${withAnswer}**
- типов: mcq — ${mcq}, соответствия — ${match}, открытые — ${open}
- формат ключа: одиночный — ${kinds.single || 0}, несколько — ${kinds.multi || 0},
  последовательность — ${kinds.sequence || 0}, пары — ${kinds.pairs || 0},
  текстом — ${kinds.text || 0}
- со служебной сноской со страницы: ${notes}
- вопросов с замечаниями: **${issues.length}**, повторяющихся номеров внутри темы: ${duplicateNumbers}

## По темам

| Тема | Название | Вопросов |
|---|---|---|
${rows}

## Замечания (первые 40)

| Тема | № | Тип | Что не так |
|---|---|---|---|
${problemRows || "| — | — | — | — |"}

## Что нужно решить перед импортом

1. Сверить ключи: в сборнике ответы даны по таблице учебника, часть
   сформулирована словами («по ключу учебника»), а не номером варианта.
2. Сопоставить темы сборника с темами банка в БД (в текущем банке другая
   нарезка), иначе появятся дубли.
3. Вопросы-соответствия (N-M) нельзя лить как обычный mcq: в импорте XLSX для
   них нужен тип \`match\` и пары в ответе.
4. Проверить вопросы, где структура описана словами: в банке нужен рисунок
   или явная пометка «структура на стр. N».

## Файлы

- парсер: \`tools/chem/parse_part1_collection.mjs\`
- промежуточный текст: \`tmp/chem-part1.txt\` (не коммитится)
- структура: \`data/chemistry/part1-collection-2026-11.json\`
- проверка: \`npm run test:chemistry\`
`;

writeFileSync(outReport, report);

console.log(JSON.stringify({ themes: themes.length, totalQuestions, withAnswer, mcq, match, open, issues: issues.length, orphans: orphans.length }, null, 2));
