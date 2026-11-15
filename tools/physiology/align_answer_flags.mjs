// Сверка «поле ответа ↔ флаги вариантов» по всей базе физиологии.
//
// У вопроса есть текстовый эталон «Верный ответ: 1) снижается» и массив
// вариантов с флагами correct. Они рассинхронизированы: флаг может стоять на
// соседнем варианте (вопрос 83: эталон «1) снижается», а флаг — на «снижается,
// а потом повышается»). Студент отвечает верно и получает «не засчитано».
//
// Скрипт парсит номер(а) из эталона, сверяет их с вариантами по номеру и тексту
// и переставляет флаги. Если номер и текст расходятся или вариантов меньше,
// чем номер, — вопрос не трогаем и печатаем в отчёт (не угадываем).
//
// Несколько номеров в эталоне («1) натрия; 4) кальция») трактуются как
// вопрос с несколькими верными вариантами: выставляются оба флага, и раннер
// автоматически покажет выбор нескольких ответов.
//
// Запуск:
//   node tools/physiology/align_answer_flags.mjs --dry
//   node tools/physiology/align_answer_flags.mjs --apply [--snapshots]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const APPLY = process.argv.includes("--apply");
const SNAPSHOTS = process.argv.includes("--snapshots");
// По умолчанию — вся база; можно ограничить: --subject=<uuid>
const SUBJECT = (process.argv.find((a) => a.startsWith("--subject=")) || "").slice("--subject=".length) || null;

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
    .replace(/[–—]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function similarity(a, b) {
  const A = new Set(norm(a).split(" ").filter((w) => w.length > 2));
  const B = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit += 1;
  return hit / Math.max(A.size, B.size);
}

/** «Верный ответ: 1) снижается;; 4) кальция;» → [{n:1,text:"снижается"}, {n:4,…}] */
function parseAnswer(answer) {
  const raw = String(answer || "").replace(/^верный ответ:\s*/i, "").trim();
  if (!raw) return [];
  const re = /(\d{1,2})\)\s*([^;]*)/g;
  const out = [];
  let m;
  while ((m = re.exec(raw))) {
    const text = m[2].replace(/^[*\s]+/, "").trim();
    if (text) out.push({ n: Number(m[1]), text });
  }
  return out;
}

const { Client } = await import("pg");
loadEnv();
const client = new Client({
  connectionString: String(process.env.DB_URL || "").replace(/\?sslmode=\w+/, ""),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const rows = SUBJECT
  ? (await client.query(
      "select id, text, options, answer from questions where subject_id = $1 and options is not null order by text",
      [SUBJECT],
    )).rows
  : (await client.query(
      "select id, text, options, answer from questions where options is not null order by text",
    )).rows;

const fixes = [];
const manual = [];
let scanned = 0, alreadyOk = 0, noKey = 0;

for (const row of rows) {
  const opts = (Array.isArray(row.options) ? row.options : []).map((o) =>
    (typeof o === "string" ? { label: o, correct: false } : o));
  if (opts.length < 2) continue;
  const keys = parseAnswer(row.answer);
  if (!keys.length) { noKey += 1; continue; }
  scanned += 1;
  // Битые импорты, где в варианты попал текст других вопросов, не трогаем.
  // Больше трёх ключей в одной строке — почти всегда слипшийся текст, а не
  // вопрос с четырьмя верными вариантами.
  if (keys.length > 3 || opts.length > 8 || opts.some((o) => String(o.label || "").length > 180)) {
    manual.push({ row, reason: "подозрительные варианты" });
    continue;
  }

  const indexes = [];
  let unresolved = null;
  for (const key of keys) {
    const byIndex = opts[key.n - 1];
    const byIndexScore = byIndex ? similarity(byIndex.label, key.text) : 0;
    if (byIndex && byIndexScore >= 0.45) { indexes.push(key.n - 1); continue; }
    const scored = opts.map((o) => similarity(o.label, key.text));
    const best = scored.indexOf(Math.max(...scored));
    if (scored[best] >= 0.6 && scored.filter((s) => s >= 0.6).length === 1) { indexes.push(best); continue; }
    unresolved = key;
    break;
  }
  if (unresolved) { manual.push({ row, reason: `эталон «${unresolved.n}) ${unresolved.text}» не найден` }); continue; }

  const uniq = [...new Set(indexes)];
  const current = opts.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
  if (uniq.length === current.length && uniq.every((i) => current.includes(i))) { alreadyOk += 1; continue; }
  fixes.push({ row, opts, indexes: uniq, current });
}

console.log(`вопросов с эталоном: ${scanned}, без ключа: ${noKey}`);
console.log(`флаги уже совпадают: ${alreadyOk}`);
console.log(`расходится: ${fixes.length}`);
for (const f of fixes.slice(0, 40)) {
  console.log(`\n• ${f.row.text.slice(0, 78)}`);
  console.log(`  эталон: ${f.row.answer}`);
  console.log(`  было: ${f.opts.filter((o) => o.correct).map((o) => o.label).join(" | ") || "—"}`);
  console.log(`  станет: ${f.indexes.map((i) => f.opts[i].label).join(" | ")}`);
}
console.log(`\nна ручной разбор: ${manual.length}`);
for (const m of manual.slice(0, 30)) console.log(`  ? ${m.row.text.slice(0, 70)} — ${m.reason}`);

if (APPLY) {
  let changed = 0;
  for (const f of fixes) {
    const next = f.opts.map((o, i) => ({ ...o, correct: f.indexes.includes(i) }));
    await client.query("update questions set options = $1::jsonb where id = $2", [JSON.stringify(next), f.row.id]);
    changed += 1;
  }
  console.log(`\nобновлено в БД: ${changed}`);

  if (SNAPSHOTS) {
    const fixedById = new Map(fixes.map((f) => [f.row.id, f]));
    const sessions = (await client.query(
      "select id, question_snapshot from test_preparation_sessions where question_snapshot is not null",
    )).rows;
    let patched = 0;
    for (const session of sessions) {
      let snapshot;
      try { snapshot = JSON.parse(String(session.question_snapshot)); } catch { continue; }
      if (!Array.isArray(snapshot)) continue;
      let touched = false;
      for (const item of snapshot) {
        const fix = item?.id ? fixedById.get(String(item.id)) : null;
        if (!fix) continue;
        item.options = fix.opts.map((o, i) => ({ label: o.label, correct: fix.indexes.includes(i) }));
        touched = true;
      }
      if (!touched) continue;
      await client.query("update test_preparation_sessions set question_snapshot = $1::jsonb where id = $2", [
        JSON.stringify(snapshot), session.id,
      ]);
      patched += 1;
    }
    console.log(`сессий со снимком исправлено: ${patched}`);
  }
} else {
  console.log("\n--dry: БД не изменена");
}

await client.end();
