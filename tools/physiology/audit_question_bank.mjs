// Аудит всей базы вопросов: ищем дефекты данных, которые ломают прохождение.
//
// Категории:
//   1. склейка вариантов («3)окклюзия 4) последействие»);
//   2. одинаковые варианты внутри вопроса;
//   3. вопрос-текст попал в вариант (хвост следующего вопроса);
//   4. нет верного варианта / больше одного верного;
//   5. один вариант (закрытый вопрос нечем проверить);
//   6. дубли текста вопроса в пределах предмета;
//   7. один и тот же вопрос дважды внутри теста;
//   8. тесты-близнецы (одинаковое название и объём в предмете).
//
// Запуск: node tools/physiology/audit_question_bank.mjs [--json=<файл>]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const JSON_OUT = (process.argv.find((a) => a.startsWith("--json=")) || "").slice("--json=".length);

function loadEnv() {
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function norm(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[«»„“”]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const { Client } = await import("pg");
loadEnv();
const client = new Client({
  connectionString: String(process.env.DB_URL || "").replace(/\?sslmode=\w+/, ""),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const rows = (await client.query(
  "select id, subject_id, text, options, answer from questions order by subject_id, text",
)).rows;

const opts = (raw) => (Array.isArray(raw) ? raw : []).map((o) => (typeof o === "string" ? { label: o, correct: false } : o));

const report = {
  total: rows.length,
  merged: [],
  duplicateOption: [],
  stemInOption: [],
  noCorrect: [],
  manyCorrect: [],
  singleOption: [],
  duplicateText: [],
  duplicateInTest: [],
  twinTests: [],
};

const byText = new Map();
for (const row of rows) {
  const options = opts(row.options);
  const labels = options.map((o) => String(o.label || "").trim());
  const markers = labels.reduce((sum, l) => sum + (l.match(/(?:^|\s)\d{1,2}\s*\)/g) || []).length, 0);
  if (markers >= 1 && labels.some((l) => /(?:^|\s)\d{1,2}\s*\)\s*\S/.test(l))) {
    report.merged.push({ id: row.id, text: row.text.slice(0, 70), labels: labels.map((l) => l.slice(0, 60)) });
  }
  const seen = new Set();
  for (const l of labels) {
    const key = norm(l);
    if (key && seen.has(key)) report.duplicateOption.push({ id: row.id, text: row.text.slice(0, 70), label: l.slice(0, 60) });
    if (key) seen.add(key);
  }
  if (labels.some((l) => norm(row.text).length > 25 && norm(l).includes(norm(row.text).slice(0, 40)))) {
    report.stemInOption.push({ id: row.id, text: row.text.slice(0, 70) });
  }
  const corrects = options.filter((o) => o.correct).length;
  if (options.length >= 2 && corrects === 0) report.noCorrect.push({ id: row.id, text: row.text.slice(0, 70), n: options.length });
  if (corrects > 1) report.manyCorrect.push({ id: row.id, text: row.text.slice(0, 70), corrects });
  if (options.length === 1) report.singleOption.push({ id: row.id, text: row.text.slice(0, 70), label: labels[0]?.slice(0, 50) });

  const key = String(row.subject_id || "") + "|" + norm(row.text);
  if (byText.has(key)) byText.get(key).push(row.id);
  else byText.set(key, [row.id]);
}
for (const [, ids] of byText) if (ids.length > 1) report.duplicateText.push({ ids, n: ids.length });

const inTest = (await client.query(
  `select tq.test_id, tq.question_id, count(*)::int n
   from test_questions tq group by tq.test_id, tq.question_id having count(*) > 1`,
)).rows;
report.duplicateInTest = inTest;

const twins = (await client.query(
  `select subject_id, title, coalesce(time_limit_sec, 0) tl, count(*)::int n,
          array_agg(id) ids
   from tests
   where coalesce(is_published, true) = true
   group by subject_id, title, tl having count(*) > 1`,
)).rows;
report.twinTests = twins.map((t) => ({ subject_id: t.subject_id, title: String(t.title).slice(0, 70), n: t.n, ids: t.ids }));

const summary = {
  total: report.total,
  merged: report.merged.length,
  duplicateOption: report.duplicateOption.length,
  stemInOption: report.stemInOption.length,
  noCorrect: report.noCorrect.length,
  manyCorrect: report.manyCorrect.length,
  singleOption: report.singleOption.length,
  duplicateTextGroups: report.duplicateText.length,
  duplicateInTest: report.duplicateInTest.length,
  twinTests: report.twinTests.length,
};
console.log(JSON.stringify(summary, null, 1));

for (const name of ["merged", "duplicateOption", "stemInOption", "manyCorrect", "singleOption"]) {
  if (!report[name].length) continue;
  console.log(`\n=== ${name} (${report[name].length}) ===`);
  for (const item of report[name].slice(0, 15)) console.log(" ", JSON.stringify(item).slice(0, 240));
}

if (report.noCorrect.length) {
  console.log(`\n=== noCorrect: ${report.noCorrect.length} (по предметам) ===`);
  const bySubject = new Map();
  for (const item of report.noCorrect) {
    const row = rows.find((r) => r.id === item.id);
    const key = String(row?.subject_id || "—");
    bySubject.set(key, (bySubject.get(key) || 0) + 1);
  }
  for (const [subject, count] of bySubject) console.log(`  ${subject}: ${count}`);
}

if (report.duplicateText.length) {
  console.log(`\n=== duplicateText groups: ${report.duplicateText.length} ===`);
  for (const group of report.duplicateText.slice(0, 10)) {
    const row = rows.find((r) => r.id === group.ids[0]);
    console.log("  ", group.ids.length, "×", String(row?.text || "").slice(0, 80));
  }
}

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
  console.log(`\nполный отчёт: ${JSON_OUT}`);
}

await client.end();
