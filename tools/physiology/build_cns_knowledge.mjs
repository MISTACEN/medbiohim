// Генератор корпуса знаний «Подготовка к ЦНС» для RAG тьютора.
//
// Читает md-файлы подготовки к коллоквиуму по физиологии ЦНС (шпаргалка,
// конспекты занятий, ситуационные задачи, банк тестов), режет их по заголовкам
// «## » на записи и складывает бандл integrations/cloudflare-api/src/knowledge/
// cns-knowledge.json. Корпус подмешивается в RAG тьютора (buildLectureContext)
// только для предмета physiology и НЕ попадает в таблицу лекций / на /lectures.
//
// Запуск: node tools/physiology/build_cns_knowledge.mjs [--dir=<путь к папке>]
// По умолчанию — папка подготовки ЦНС на рабочем столе.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(REPO, "integrations", "cloudflare-api", "src", "knowledge", "cns-knowledge.json");

const DEFAULT_DIR = path.join(os.homedir(), "Desktop", "физиологии", "подготовка_ЦНС");
const DIR = (process.argv.find((a) => a.startsWith("--dir=")) || "").slice("--dir=".length) || DEFAULT_DIR;

// Порядок и человекочитаемые названия источников — они попадают в заголовки
// записей и в «Источники» ответа тьютора.
const SOURCES = [
  { file: "00_ШПАРГАЛКА_главное_и_ловушки.md", title: "Шпаргалка ЦНС" },
  { file: "01_Конспект_Занятие1_нейрон_синапс_рефлекс_торможение.md", title: "Конспект ЦНС 1: нейрон, синапс, рефлекс, торможение" },
  { file: "02_Конспект_Занятие2_спинной_и_головной_мозг.md", title: "Конспект ЦНС 2: спинной и головной мозг" },
  { file: "03_Конспект_Занятие3_ВНС.md", title: "Конспект ЦНС 3: ВНС" },
  { file: "04_Ситуационные_задачи_с_ответами.md", title: "Ситуационные задачи ЦНС" },
  { file: "05_Банк_тестов_294_с_ответами_и_пояснениями.md", title: "Банк тестов ЦНС" },
];

// Крупные разделы (банк тестов) режем ещё и по длине, чтобы фрагменты RAG
// оставались адресными: 3500 знаков ≈ 5–6 фрагментов по 600.
const MAX_SECTION_CHARS = 3500;

function slugifyText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "x";
}

function splitSections(raw) {
  // Первая строка «# …» — название файла, тело после неё — материал.
  const body = raw.replace(/\r\n/g, "\n").replace(/^#[^\n]*\n/, "").trim();
  const parts = body.split(/^## /m).map((s) => s.trim()).filter(Boolean);
  return parts;
}

function sectionTitle(part, fallbackIndex) {
  const first = part.split("\n", 1)[0].replace(/[*_`#]/g, "").trim();
  return first || `Раздел ${fallbackIndex}`;
}

function chunkBody(text) {
  if (text.length <= MAX_SECTION_CHARS) return [text];
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_SECTION_CHARS) {
    chunks.push((i > 0 ? "… " : "") + text.slice(i, i + MAX_SECTION_CHARS).trim() + (i + MAX_SECTION_CHARS < text.length ? " …" : ""));
  }
  return chunks;
}

const entries = [];
const stats = [];

for (const src of SOURCES) {
  const filePath = path.join(DIR, src.file);
  if (!fs.existsSync(filePath)) {
    console.error(`! пропущен (нет файла): ${filePath}`);
    continue;
  }
  const sections = splitSections(fs.readFileSync(filePath, "utf8"));
  let count = 0;
  sections.forEach((part, index) => {
    const heading = sectionTitle(part, index + 1);
    // Тело — сам раздел; заголовок дублируем внутрь, чтобы скоринг RAG
    // находил слова и в тексте записи.
    const body = `## ${heading}\n\n${part.replace(/^[^\n]*\n/, "").trim()}`;
    chunkBody(body).forEach((chunk, chunkIndex) => {
      const chunkSuffix = chunkIndex > 0 ? ` (часть ${chunkIndex + 1})` : "";
      entries.push({
        id: `cns-${slugifyText(src.title)}-${slugifyText(heading)}${chunkIndex || ""}`,
        title: `${src.title} — ${heading}${chunkSuffix}`,
        body: chunk,
      });
      count += 1;
    });
  });
  stats.push(`${src.title}: ${count} записей`);
}

if (!entries.length) {
  console.error("! корпус пуст — проверьте папку: " + DIR);
  process.exit(1);
}

const bundle = {
  generated_at: new Date().toISOString(),
  source_dir: DIR,
  subject_slug: "physiology",
  topic: "Физиология ЦНС",
  entries,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(bundle, null, 1), "utf8");

const chars = entries.reduce((sum, e) => sum + e.body.length, 0);
console.log(stats.join("\n"));
console.log(`итого записей: ${entries.length}, знаков: ${chars}`);
console.log(`записано: ${OUT}`);
