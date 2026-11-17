#!/usr/bin/env node
/**
 * Полный порт тем 1.1–1.4 «Сборника тестов. Часть I» (органическая химия)
 * в MC-банки портала — включая match- и text-вопросы, которые раньше отбрасывались.
 *
 * single → kind:"choice" (correct — номер варианта, 0-based)
 * text   → kind:"text" (answer + acceptedAnswers)
 * match  → kind:"text" (полный парный ответ строкой, как в ключе)
 * figure → пропуск (нужны изображения структур)
 *
 * Заменяет существующие 4 банка mc-chemistry-organic-part1-* целиком
 * (детерминированная сборка из источника, дублей нет).
 *
 *   node scripts/build-chemistry-mc-part1-full.mjs "<путь>/tests.json"
 */
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
if (!SRC) {
  console.error('usage: node build-chemistry-mc-part1-full.mjs "<path>/tests.json"');
  process.exit(2);
}

const OUT_DIR = "public/content/portals";
const INDEX_PATH = path.join(OUT_DIR, "mc-index.json");
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
    .slice(0, 32)
    .replace(/-+$/g, "");

const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
const stats = { choice: 0, text: 0, skippedFigure: 0, skippedOther: 0 };

for (const theme of src.themes ?? []) {
  const questions = [];
  for (const question of theme.questions ?? []) {
    const stem = String(question.stem ?? "").trim();
    const n = question.n;
    if (!stem) { stats.skippedOther += 1; continue; }
    const id = Number.isInteger(n) ? n : questions.length + 1;
    const topic = theme.title.trim();

    if (question.kind === "single") {
      const options = (question.options ?? []).map((o) => String(o).trim()).filter(Boolean);
      const answer = Number(question.answer);
      if (options.length < 2 || !Number.isInteger(answer) || answer < 1 || answer > options.length) {
        stats.skippedOther += 1;
        continue;
      }
      questions.push({ id, kind: "choice", text: stem, options, correct: answer - 1, topic });
      stats.choice += 1;
    } else if (question.kind === "text") {
      const answer = String(question.answer ?? "").trim();
      if (!answer) { stats.skippedOther += 1; continue; }
      questions.push({
        id,
        kind: "text",
        text: stem,
        options: [],
        answer,
        acceptedAnswers: [answer],
        note: `№${n} сборника, ответ из ключей.`,
        topic,
      });
      stats.text += 1;
    } else if (question.kind === "match") {
      const answer = String(question.answer ?? "").trim();
      if (!answer || answer.startsWith("см.")) { stats.skippedOther += 1; continue; }
      questions.push({
        id,
        kind: "text",
        text: stem,
        options: [],
        answer,
        acceptedAnswers: [answer.replace(/\s+/g, ""), answer.replace(/[—–-]/g, "-").replace(/\s+/g, "")],
        note: `№${n} сборника, соответствие: введите пары как в ключе (${answer}).`,
        topic,
      });
      stats.text += 1;
    } else {
      stats.skippedFigure += 1;
    }
  }

  if (!questions.length) continue;
  const id = `organic-part1-${slugify(theme.title)}`;
  const bank = {
    id,
    title: `${theme.title.trim()} — тесты (сборник, часть I)`,
    subject: "Органическая и физическая химия",
    subjectId: "chemistry",
    topic: `Сборник часть I · ${theme.id}`,
    count: questions.length,
    questions,
  };
  fs.writeFileSync(path.join(OUT_DIR, `mc-${id}.json`), `${JSON.stringify(bank, null, 1)}\n`);

  const entry = {
    id,
    title: bank.title,
    subject: bank.subject,
    subjectId: "chemistry",
    topic: bank.topic,
    count: questions.length,
  };
  const i = index.tests.findIndex((t) => t.id === id);
  if (i >= 0) index.tests[i] = entry;
  else index.tests.push(entry);
  console.log(`${id}: ${questions.length} вопросов`);
}

index.tests.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 1)}\n`);
console.log(`choice: ${stats.choice}, text: ${stats.text}, пропущено figure: ${stats.skippedFigure}, прочее: ${stats.skippedOther}`);
