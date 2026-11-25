/**
 * Сборка XLSX для /admin/content-import из разобранного сборника по химии.
 *
 *   node tools/chem/build_import_xlsx.mjs
 *
 * Правила:
 * - один тест на тему сборника, is_published=false (черновик до проверки);
 * - mcq → type=mcq, options как JSON [{label, correct}], answer — текст ответа;
 * - open → type=open, options [];
 * - match (соответствия) не импортируются: шаблон не умеет пары, а
 *   разложение по одному пункту искажает формулировку. Они перечислены в отчёте;
 * - API принимает не больше 500 строк за раз, поэтому файлы нарезаны по темам.
 */
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";

const ROOT = resolve(import.meta.dirname, "../..");
const SOURCE = resolve(ROOT, "data/chemistry/part1-collection-2026-11.json");
const OUT_DIR = resolve(ROOT, "data/chemistry/import");
const MAX_ROWS = 500;

const SUBJECT_KEY = "chemistry_organic_physical";

const collection = JSON.parse(readFileSync(SOURCE, "utf8"));

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function questionKey(theme, number) {
  return `chem-part1-${theme.replace(".", "_")}-${String(number).padStart(3, "0")}`;
}

function toOptions(question) {
  const answers = new Set(question.answerIndexes || []);
  return question.options.map((label, index) => ({
    label,
    correct: answers.has(index + 1),
  }));
}

function answerText(question) {
  if (!question.options.length) return String(question.answer || "");
  const picked = (question.answerIndexes || []).map((n) => question.options[n - 1]).filter(Boolean);
  if (picked.length === 1) return picked[0];
  if (question.answerKind === "sequence" && picked.length > 1) return picked.join(" → ");
  if (picked.length > 1) return picked.join("; ");
  return String(question.answer || "");
}

const tests = [];
const questions = [];
const links = [];
const skippedMatch = [];
const skippedUnkeyed = [];

for (const theme of collection.themes) {
  tests.push({
    test_key: `chem-part1-theme-${theme.id.replace(".", "_")}`,
    title: `Химия · Часть I · Тема ${theme.id}. ${theme.title}`,
    subject_key: SUBJECT_KEY,
    module_key: "",
    topic_key: "",
    time_limit_sec: "",
    max_attempts: 3,
    is_published: false,
  });

  let order = 0;
  for (const question of theme.questions) {
    if (question.kind === "match") {
      skippedMatch.push({ theme: theme.id, number: question.number, stem: question.stem });
      continue;
    }
    // У 29 mcq ключ распознан как текст-сноска («2 Структурные формулы…»):
    // верный вариант неизвестен, такой вопрос нельзя импортировать как mcq.
    if (question.kind === "mcq" && !(question.answerIndexes || []).length) {
      skippedUnkeyed.push({
        theme: theme.id,
        number: question.number,
        stem: question.stem,
        answerRaw: question.answerRaw,
      });
      continue;
    }
    order += 1;
    const key = questionKey(theme.id, question.number);
    questions.push({
      question_key: key,
      text: question.stem,
      subject_key: SUBJECT_KEY,
      module_key: "",
      topic_key: "",
      type: question.kind === "open" ? "open" : "mcq",
      answer: answerText(question),
      options: question.kind === "open" ? "[]" : JSON.stringify(toOptions(question)),
      difficulty: "",
      is_published: false,
    });
    links.push({
      test_key: `chem-part1-theme-${theme.id.replace(".", "_")}`,
      question_key: key,
      order_index: order,
    });
  }
}

// Нарезка: тесты кладём в тот файл, где начинается их тема, связи — вместе с вопросами.
const chunks = [];
let current = { themes: new Set(), tests: [], questions: [], links: [] };
const linkByKey = new Map(links.map((l) => [l.question_key, l]));

for (const theme of collection.themes) {
  const themeQuestions = questions.filter((q) => q.question_key.startsWith(`chem-part1-${theme.id.replace(".", "_")}-`));
  // Строк в файле: тесты + вопросы + связи (по одной на вопрос).
  const nextRows =
    current.tests.length + 1 + 2 * (current.questions.length + themeQuestions.length);
  if (nextRows > MAX_ROWS && current.questions.length > 0) {
    chunks.push(current);
    current = { themes: new Set(), tests: [], questions: [], links: [] };
  }
  current.themes.add(theme.id);
  current.tests.push(tests.find((t) => t.test_key === `chem-part1-theme-${theme.id.replace(".", "_")}`));
  for (const question of themeQuestions) {
    current.questions.push(question);
    current.links.push(linkByKey.get(question.question_key));
  }
}
chunks.push(current);

mkdirSync(OUT_DIR, { recursive: true });
const files = [];
for (const [index, chunk] of chunks.entries()) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of [
    ["tests", chunk.tests],
    ["questions", chunk.questions],
    ["test_questions", chunk.links],
  ]) {
    const columns = Object.keys(rows[0] || {});
    const sheet = XLSX.utils.json_to_sheet(rows, { header: columns });
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  const name = `chem-part1-${String(index + 1).padStart(2, "0")}.xlsx`;
  const path = resolve(OUT_DIR, name);
  XLSX.writeFile(workbook, path);
  files.push({
    name,
    themes: [...chunk.themes],
    tests: chunk.tests.length,
    questions: chunk.questions.length,
    rows: chunk.tests.length + chunk.questions.length + chunk.links.length,
  });
}

const byKind = collection.themes
  .flatMap((t) => t.questions)
  .reduce((acc, q) => ({ ...acc, [q.kind]: (acc[q.kind] || 0) + 1 }), {});

writeFileSync(
  resolve(OUT_DIR, "manifest.json"),
  JSON.stringify(
    {
      source: "data/chemistry/part1-collection-2026-11.json",
      subject_key: SUBJECT_KEY,
      is_published: false,
      totals: {
        themes: collection.themes.length,
        questionsInSource: Object.values(byKind).reduce((a, b) => a + b, 0),
        byKind,
        exported: { tests: tests.length, questions: questions.length, links: links.length },
        skippedMatch: skippedMatch.length,
        skippedUnkeyed: skippedUnkeyed.length,
      },
      files,
    },
    null,
    2,
  ) + "\n",
);

// Пересечения с локальными источниками: живой банк в Supabase отсюда не виден.
const localTexts = new Map();
function addLocal(text, where) {
  const key = normalizeText(text);
  if (!key) return;
  if (!localTexts.has(key)) localTexts.set(key, where);
}
function tokens(text) {
  return new Set(normalizeText(text).split(" ").filter((w) => w.length > 3));
}
function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

const ticketBank = resolve(ROOT, "public/content/portals/ticket-banks/organic_chemistry.json");
if (existsSync(ticketBank)) {
  const bank = JSON.parse(readFileSync(ticketBank, "utf8"));
  for (const item of bank.items || bank.questions || []) addLocal(item.text, "ticket-bank");
}
const microDir = resolve(ROOT, "docs/orgchem-import/micro");
if (existsSync(microDir)) {
  for (const file of readdirSync(microDir).filter((f) => f.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(resolve(microDir, file), "utf8"));
    for (const item of Array.isArray(data) ? data : data.questions || []) addLocal(item.text, `orgchem-import/${file}`);
  }
}

const exact = [];
const near = [];
for (const question of questions) {
  const key = normalizeText(question.text);
  if (localTexts.has(key)) {
    exact.push({ key: question.question_key, where: localTexts.get(key) });
    continue;
  }
  const a = tokens(question.text);
  for (const [text, where] of localTexts) {
    if (similarity(a, tokens(text)) >= 0.8) {
      near.push({ key: question.question_key, where });
      break;
    }
  }
}

writeFileSync(
  resolve(OUT_DIR, "dedupe.json"),
  JSON.stringify(
    { localSources: localTexts.size, exact, near, skippedMatch, skippedUnkeyed },
    null,
    2,
  ) + "\n",
);

console.log(`файлов: ${files.length}`);
for (const file of files) {
  console.log(`${file.name}: темы ${file.themes.join(", ")} · строк ${file.rows}`);
}
console.log(
  `вопросов выгружено: ${questions.length} (match пропущено: ${skippedMatch.length}, без ключа: ${skippedUnkeyed.length})`,
);
console.log(`совпадений с локальными источниками: точных ${exact.length}, похожих ${near.length}`);
