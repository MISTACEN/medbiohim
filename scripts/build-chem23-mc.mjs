#!/usr/bin/env node
/**
 * Сборка MC-банков из распознанных тестов chem2/chem3 (химия.zip) с верифицированными
 * ответами. Ответы — scripts/chem23-answers.mjs (проверены по учебнику/канону курса),
 * вопросы — tmp/chem-tests/chem2_тесты.json и chem3_тесты.json.
 *
 * Формат ответов: export const ANSWERS = { "<file>|<themeId>": { "<n>": { c?: номер (1-based), a?: текст, note? } } }.
 * Вопросы без записи в ANSWERS в банк не попадают (нельзя гарантировать ответ).
 *
 *   node scripts/build-chem23-mc.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { ANSWERS } from "./chem23-answers.mjs";

const SOURCES = [
  { file: "tmp/chem-tests/chem2_тесты.json", tag: "chem2", subject: "Органическая и физическая химия" },
  { file: "tmp/chem-tests/chem3_тесты.json", tag: "chem3", subject: "Органическая и физическая химия" },
];
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
    .slice(0, 28)
    .replace(/-+$/g, "");

const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
let total = 0;

for (const source of SOURCES) {
  const data = JSON.parse(fs.readFileSync(source.file, "utf8"));
  for (const [themeId, theme] of Object.entries(data.themes)) {
    const key = `${source.tag}|${themeId}`;
    const answers = ANSWERS[key] ?? {};
    const title = (theme.title ?? "").trim() || `Тема ${themeId || "без номера"} (chem${source.tag === "chem2" ? "2" : "3"})`;
    const questions = [];
    for (const q of theme.questions ?? []) {
      const verdict = answers[String(q.num)];
      if (!verdict) continue; // нет верифицированного ответа — вопрос не включаем
      const stem = String(q.text ?? "").trim();
      const options = (q.options ?? []).map((o) => String(o).trim()).filter(Boolean);
      const id = Number.isInteger(q.num) ? q.num : questions.length + 1;
      if (verdict.a != null) {
        questions.push({
          id,
          kind: "text",
          text: stem,
          options: [],
          answer: String(verdict.a),
          acceptedAnswers: [String(verdict.a)],
          note: verdict.note ?? "Ответ проверен по учебнику (Травень/Тюкавкина).",
          topic: title,
        });
      } else if (verdict.c != null && Number.isInteger(verdict.c) && verdict.c >= 1 && verdict.c <= options.length) {
        questions.push({
          id,
          kind: "choice",
          text: stem,
          options,
          correct: verdict.c - 1,
          note: verdict.note,
          topic: title,
        });
      }
    }
    if (!questions.length) continue;
    const bankId = `chem${source.tag === "chem2" ? "2" : "3"}-${themeId ? slugify(themeId + " " + title) : slugify(title)}`;
    const bank = {
      id: bankId,
      title: `${title} — тесты (сборник, ${source.tag})`,
      subject: source.subject,
      subjectId: "chemistry",
      topic: `Сборник ${source.tag} · ${themeId || "—"}`,
      count: questions.length,
      questions,
    };
    fs.writeFileSync(path.join(OUT_DIR, `mc-${bankId}.json`), `${JSON.stringify(bank, null, 1)}\n`);
    const entry = {
      id: bankId,
      title: bank.title,
      subject: bank.subject,
      subjectId: "chemistry",
      topic: bank.topic,
      count: questions.length,
    };
    const i = index.tests.findIndex((t) => t.id === bankId);
    if (i >= 0) index.tests[i] = entry;
    else index.tests.push(entry);
    total += questions.length;
    console.log(`${bankId}: ${questions.length} вопросов`);
  }
}

index.tests.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 1)}\n`);
console.log(`итого вопросов: ${total}`);
