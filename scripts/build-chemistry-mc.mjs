#!/usr/bin/env node
/**
 * «Сборник тестов Часть I» (органическая химия) → MC-банк портала.
 *
 * Источник: tests.json из папки сборника, структура
 *   { themes: [{ id, title, questions: [{ n, kind, stem, options[5], answer }] }] }
 * где `answer` — номер верного варианта, начиная с 1.
 *
 * На каждый раздел пишется отдельный файл public/content/portals/<id>-mc.json
 * и запись в mc-index.json (идемпотентно: повторный запуск обновляет запись).
 *
 *   node scripts/build-chemistry-mc.mjs "<путь к tests.json>"
 */
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
if (!SRC) {
  console.error('usage: node build-chemistry-mc.mjs "<path>/tests.json"');
  process.exit(2);
}

const OUT_DIR = "public/content/portals";
const INDEX_PATH = path.join(OUT_DIR, "mc-index.json");
const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));

// id попадает в URL файла, поэтому только латиница: кириллица в именах файлов
// ломается в части окружений и нечитаема в адресе.
const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};
const slugify = (text) =>
  text
    .toLowerCase()
    .split("")
    .map((char) => TRANSLIT[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");

let totalImported = 0;
let totalSkipped = 0;

for (const theme of src.themes ?? []) {
  const questions = [];
  let skipped = 0;

  for (const question of theme.questions ?? []) {
    const options = (question.options ?? []).map((option) => String(option).trim()).filter(Boolean);
    const answer = Number(question.answer);
    const stem = String(question.stem ?? "").trim();
    if (!stem || options.length < 2 || !Number.isInteger(answer) || answer < 1 || answer > options.length) {
      skipped += 1;
      continue;
    }
    questions.push({
      id: questions.length + 1,
      text: stem,
      options,
      correct: answer - 1,
      topic: theme.title,
    });
  }

  totalSkipped += skipped;
  if (!questions.length) {
    console.log(`пропуск темы «${theme.title}»: нет вопросов с ответами`);
    continue;
  }

  const slug = slugify(theme.title) || `theme-${theme.id}`;
  const id = `chemistry-organic-part1-${slug}`;
  // Загрузчик портала читает /content/portals/mc-<id>.json — имя должно быть именно таким.
  const file = path.join(OUT_DIR, `mc-${id}.json`);
  const bank = {
    id,
    title: `${theme.title} — тесты (сборник, часть I)`,
    subject: "Органическая и физическая химия",
    subjectId: "chemistry",
    topic: `Сборник часть I · ${theme.id}`,
    questions,
  };
  fs.writeFileSync(file, `${JSON.stringify(bank, null, 1)}\n`);

  const entry = {
    id,
    title: bank.title,
    subject: bank.subject,
    subjectId: bank.subjectId,
    topic: bank.topic,
    count: questions.length,
  };
  const existing = index.tests.findIndex((test) => test.id === id);
  if (existing >= 0) index.tests[existing] = entry;
  else index.tests.push(entry);

  totalImported += questions.length;
  console.log(`${id}: ${questions.length} вопросов${skipped ? ` (пропущено ${skipped})` : ""}`);
}

// Записи других банков не трогаем: часть из них ссылается не на файлы в portals,
// а на другие хранилища — фильтрация по наличию файла удаляла бы живые тесты.

fs.writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 1)}\n`);
console.log(`итого: ${totalImported} вопросов, пропущено ${totalSkipped}; тестов в индексе: ${index.tests.length}`);
