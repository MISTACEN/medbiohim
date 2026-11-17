#!/usr/bin/env node
/**
 * Часть II сборника (темы 3.1 «Алканы. Циклоалканы» и 3.6 «Амины»):
 * открытые вопросы с эталонами → банки MC-формата с kind:"text".
 *
 * Вопросы с вариантами (kind:"single") и на сопоставление (kind:"match") сюда
 * не попадают: в источнике у них answer:null, эталоны только на сканах таблицы
 * ключей — без сверки ответа это были бы не тесты, а картинки.
 *
 * Запуск:
 *   node scripts/build-chemistry-mc-part2.mjs "<путь>/tests.json"
 */
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
if (!SRC) {
  console.error("usage: node build-chemistry-mc-part2.mjs <tests.json>");
  process.exit(2);
}

const OUT = "public/content/portals";
const INDEX = path.join(OUT, "mc-index.json");
const BOOK = "Сборник часть II";

const SLUG = {
  "3.1": "alkany-cikloalkany",
  "3.6": "aminy",
};

const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
const typed = data.part2?.typed ?? {};
const index = JSON.parse(fs.readFileSync(INDEX, "utf8"));
let total = 0;

for (const [themeId, theme] of Object.entries(typed)) {
  const slug = SLUG[themeId];
  if (!slug) {
    console.log(`тема ${themeId}: нет slug, пропуск`);
    continue;
  }
  const keep = (theme.questions ?? []).filter((q) => q.kind === "text" && q.answer);
  if (!keep.length) {
    console.log(`тема ${themeId}: нет вопросов с эталоном`);
    continue;
  }

  const id = `chemistry-organic-part2-${slug}`;
  const title = `${theme.title} — открытые вопросы (сборник, часть II)`;
  const topic = `${BOOK} · ${themeId}`;
  const questions = keep.map((q, i) => ({
    id: i + 1,
    kind: "text",
    text: q.stem,
    options: [],
    answer: q.answer,
    acceptedAnswers: [q.answer],
    note: `№${q.n} сборника, ответ из таблицы ключей.`,
    topic: theme.title,
  }));

  fs.writeFileSync(
    path.join(OUT, `mc-${id}.json`),
    `${JSON.stringify({ id, title, subject: "Органическая и физическая химия", subjectId: "chemistry", topic, questions }, null, 1)}\n`,
  );

  const entry = { id, title, subject: "Органическая и физическая химия", subjectId: "chemistry", topic, count: questions.length };
  const at = index.tests.findIndex((t) => t.id === id);
  if (at >= 0) index.tests[at] = entry;
  else index.tests.push(entry);

  total += questions.length;
  console.log(`${id}: ${questions.length} открытых вопросов`);
}

fs.writeFileSync(INDEX, `${JSON.stringify(index, null, 1)}\n`);
console.log(`итого: ${total} вопросов; тестов в индексе: ${index.tests.length}`);
