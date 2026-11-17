#!/usr/bin/env node
/**
 * Полный порт набранных тем 3.1 «Алканы. Циклоалканы» и 3.6 «Амины»
 * части II сборника (tests.json → part2.typed) в MC-банки портала.
 *
 * Берутся вопросы с однозначным ответом из ключей. Вопросы с фрагментами
 * скана (fig) пропускаются — их нельзя решить без изображения.
 *
 *   node scripts/build-chemistry-mc-part2-full.mjs "<путь>/tests.json"
 */
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
if (!SRC) {
  console.error('usage: node build-chemistry-mc-part2-full.mjs "<path>/tests.json"');
  process.exit(2);
}

const OUT_DIR = "public/content/portals";
const INDEX_PATH = path.join(OUT_DIR, "mc-index.json");
const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));

const THEMES = [
  { id: "3.1", bankId: "chemistry-organic-part2-alkany-cikloalkany", topic: "Алканы. Циклоалканы" },
  { id: "3.6", bankId: "chemistry-organic-part2-aminy", topic: "Амины" },
];

let total = 0;
let skippedFig = 0;
for (const theme of THEMES) {
  const typed = src.part2?.typed?.[theme.id];
  if (!typed) {
    console.error(`нет part2.typed[${theme.id}]`);
    continue;
  }
  const questions = [];
  for (const q of typed.questions ?? []) {
    const answer = typeof q.answer === "string" ? q.answer.trim() : "";
    if (!answer || answer.startsWith("см.")) continue;
    // вопросы со сканом-фрагментом без картинки не решить
    if (q.fig) { skippedFig += 1; continue; }
    const stem = String(q.stem ?? "").trim();
    if (!stem) continue;
    const id = Number.isInteger(q.n) ? q.n : questions.length + 1;
    if (q.kind === "single") {
      const options = (q.options ?? []).map((o) => String(o).trim()).filter(Boolean);
      const numeric = Number(answer);
      if (options.length < 2 || !Number.isInteger(numeric) || numeric < 1 || numeric > options.length) continue;
      questions.push({ id, kind: "choice", text: stem, options, correct: numeric - 1, topic: theme.topic });
    } else if (q.kind === "text") {
      questions.push({
        id,
        kind: "text",
        text: stem,
        options: [],
        answer,
        acceptedAnswers: [answer],
        note: `№${q.n} сборника (часть II), ответ из ключей.`,
        topic: theme.topic,
      });
    } else if (q.kind === "match") {
      questions.push({
        id,
        kind: "text",
        text: stem,
        options: [],
        answer,
        acceptedAnswers: [answer.replace(/\s+/g, "")],
        note: `№${q.n} сборника (часть II), соответствие: введите пары как в ключе (${answer}).`,
        topic: theme.topic,
      });
    }
  }
  const bank = {
    id: theme.bankId,
    title: `${theme.topic} — тесты (сборник, часть II)`,
    subject: "Органическая и физическая химия",
    subjectId: "chemistry",
    topic: `Сборник часть II · ${theme.id}`,
    count: questions.length,
    questions,
  };
  fs.writeFileSync(path.join(OUT_DIR, `mc-${theme.bankId}.json`), `${JSON.stringify(bank, null, 1)}\n`);
  const entry = {
    id: theme.bankId,
    title: bank.title,
    subject: bank.subject,
    subjectId: "chemistry",
    topic: bank.topic,
    count: questions.length,
  };
  const i = index.tests.findIndex((t) => t.id === theme.bankId);
  if (i >= 0) index.tests[i] = entry;
  else index.tests.push(entry);
  total += questions.length;
  console.log(`${theme.bankId}: ${questions.length} вопросов`);
}

index.tests.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 1)}\n`);
console.log(`итого вопросов: ${total}, пропущено со сканом (fig): ${skippedFig}`);
