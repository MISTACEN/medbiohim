// Сверка эталонов банка ЦНС с методичкой.
//
// В методичке ответ записан как «✅ **5) тонус**» — то есть вместе с номером
// варианта. Варианты в БД хранятся в исходном порядке импорта, поэтому номер
// из эталона можно сверить с вариантом по индексу, а текст — по сходству.
// Это надёжнее «похожести строк»: раньше 35 вопросов оставались в отчёте
// «проверить руками» только потому, что формулировки не совпадали дословно.
//
// Запуск:
//   node tools/physiology/check_cns_answers.mjs --dir=<папка> --dry
//   node tools/physiology/check_cns_answers.mjs --dir=<папка> --apply

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const APPLY = process.argv.includes("--apply");
const DIR = (process.argv.find((a) => a.startsWith("--dir=")) || "").slice("--dir=".length)
  || path.join(os.homedir(), "Desktop", "физиологии", "подготовка_ЦНС");
const MD = path.join(DIR, "05_Банк_тестов_294_с_ответами_и_пояснениями.md");
const TEST_ID = "f1d135e9-dddb-4ecd-a2e3-7dc36d02ce14"; // Банк ЦНС (279 вопросов)

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
    .replace(/\s*-\s*/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(text) {
  return new Set(norm(text).split(" ").filter((w) => w.length > 2));
}

function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit += 1;
  return hit / Math.max(A.size, B.size);
}

/** «**76. Вопрос…**» + «✅ **5) тонус**» → { n, text, keyNumber, keyLabel }. */
function parseBank(raw) {
  const lines = raw.split(/\r?\n/);
  const items = [];
  let current = null;
  for (const line of lines) {
    const head = /^\*\*(\d{1,3})\.\s*(.+?)\*\*\s*$/.exec(line.trim());
    if (head) {
      current = { n: Number(head[1]), text: head[2], keyNumber: null, keyLabel: "" };
      continue;
    }
    const key = /^✅\s*\*\*(\d{1,2})\)\s*(.+?)\*\*\s*$/.exec(line.trim());
    if (key && current) {
      current.keyNumber = Number(key[1]);
      current.keyLabel = key[2].trim();
      items.push(current);
      current = null;
    }
  }
  return items;
}

loadEnv();
const { Client } = await import("pg");
const client = new Client({
  connectionString: String(process.env.DB_URL || "").replace(/\?sslmode=\w+/, ""),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const rows = (await client.query(
  `select q.id, q.text, q.options
   from questions q
   join test_questions tq on tq.question_id = q.id
   where tq.test_id = $1`,
  [TEST_ID],
)).rows;

const bank = parseBank(fs.readFileSync(MD, "utf8"));
console.log(`вопросов в методичке: ${bank.length}, в тесте: ${rows.length}`);

const fixes = [];
const ok = [];
const manual = [];

for (const item of bank) {
  let best = null, bestScore = 0;
  for (const row of rows) {
    const score = similarity(item.text, row.text);
    if (score > bestScore) { bestScore = score; best = row; }
  }
  if (!best || bestScore < 0.55) { manual.push({ ...item, reason: "вопрос не сопоставлен" }); continue; }
  const opts = (Array.isArray(best.options) ? best.options : []).map((o) => (typeof o === "string" ? { label: o, correct: false } : o));
  if (!opts.length) { manual.push({ ...item, reason: "нет вариантов в БД", question: best }); continue; }
  const correctIndex = item.keyNumber - 1;
  const byIndex = opts[correctIndex];
  const byIndexScore = byIndex ? similarity(byIndex.label, item.keyLabel) : 0;
  const scored = opts.map((o) => similarity(o.label, item.keyLabel));
  const bestIdx = scored.indexOf(Math.max(...scored));
  const bestScoreLabel = scored[bestIdx];

  if (byIndex && byIndex.label && byIndexScore >= 0.45) {
    // Номер и текст совпали → эталон по этому варианту.
    if (opts[correctIndex].correct === true && opts.filter((o) => o.correct).length === 1) ok.push(item);
    else fixes.push({ question: best, item, index: correctIndex, score: byIndexScore, why: "номер+текст" });
  } else if (bestScoreLabel >= 0.6 && scored.filter((s) => s >= 0.6).length === 1) {
    // Номер не совпал, но текст однозначно указывает на один вариант.
    fixes.push({ question: best, item, index: bestIdx, score: bestScoreLabel, why: "текст" });
  } else {
    manual.push({ ...item, reason: "вариант не найден", question: best, opts });
  }
}

console.log(`эталон уже верный: ${ok.length}`);
console.log(`чинится по методичке: ${fixes.length}`);
for (const f of fixes) {
  console.log(`\n• #${f.item.n} ${f.item.text.slice(0, 70)}`);
  console.log(`  методичка: ${f.item.keyNumber}) ${f.item.keyLabel}`);
  console.log(`  в БД сейчас: ${f.question.options.filter((o) => o.correct).map((o) => o.label).join(" | ") || "—"}`);
  console.log(`  станет: ${f.question.options[f.index].label} (${f.why}, ${f.score.toFixed(2)})`);
}
console.log(`\nна ручной разбор: ${manual.length}`);
for (const m of manual.slice(0, 40)) {
  console.log(`  ? #${m.n} ${m.text.slice(0, 65)} — ${m.reason}`);
}

if (APPLY) {
  let changed = 0;
  for (const f of fixes) {
    if (!f.question.options?.[f.index]?.label) continue;
    const next = f.question.options.map((o, i) => ({ ...o, correct: i === f.index }));
    await client.query("update questions set options = $1::jsonb where id = $2", [JSON.stringify(next), f.question.id]);
    changed += 1;
  }
  console.log(`\nобновлено в БД: ${changed}`);
} else {
  console.log("\n--dry: БД не изменена");
}

await client.end();
