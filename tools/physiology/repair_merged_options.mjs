// Починка вопросов, у которых варианты ответа склеились в одну строку.
//
// Симптом (банк ЦНС, вопрос 76): вместо пяти вариантов в БД лежало два —
// «общий конечный пут» и «облегчение 3)окклюзия 4) последействие 5) тонус»,
// причём верный флаг стоял на склеенной строке. Студент видел бессмысленный
// эталон и не мог ответить правильно.
//
// Что делает:
//   1. Находит варианты с внутренней нумерацией («3)», «4)», «5)»).
//   2. Разбивает склейку по номерам, восстанавливая пропущенные номера
//      по порядку (варианты без номера получают следующий по счёту).
//   3. Берёт ключ из поля answer («Верный ответ: 5) тонус»), сверяет его
//      с восстановленным вариантом и ставит correct только если они совпали.
//   4. Всё, что не сошлось, печатает в отчёт и НЕ трогает (ручной разбор).
//
// Запуск:
//   node tools/physiology/repair_merged_options.mjs --dry
//   node tools/physiology/repair_merged_options.mjs --apply

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = !process.argv.includes("--apply");
// По умолчанию сканируем ВСЮ базу: такие склейки встречаются не только в
// физиологии. Можно ограничить предметом: --subject=<uuid>
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

/** Разбивает одну строку варианта на куски по «N)». */
function splitChunk(label) {
  const text = String(label || "").trim();
  if (!text) return [];
  const parts = [];
  const re = /(?:^|\s)(\d{1,2})\s*\)\s*/g;
  let match;
  let lastIndex = 0;
  let lastNumber = null;
  while ((match = re.exec(text))) {
    const before = text.slice(lastIndex, match.index).trim();
    if (before) parts.push({ number: lastNumber, text: before });
    lastNumber = Number(match[1]);
    lastIndex = re.lastIndex;
  }
  const tail = text.slice(lastIndex).trim();
  if (tail) parts.push({ number: lastNumber, text: tail });
  if (!parts.length) parts.push({ number: null, text });
  return parts;
}

/** Собирает нумерованный список вариантов из всех строк. */
function rebuild(labels) {
  const chunks = [];
  for (const label of labels) chunks.push(...splitChunk(label));
  // Мусорные хвосты вида «Варианты ответа:» и повтор вопроса в вариантах.
  const cleaned = chunks
    .map((c) => ({ ...c, text: c.text.replace(/^варианты ответа:?\s*/i, "").trim() }))
    .filter((c) => c.text.length > 0);
  let counter = 0;
  const numbered = cleaned.map((c) => {
    counter = c.number && c.number > counter ? c.number : counter + 1;
    return { number: counter, text: c.text };
  });
  return numbered;
}

function answerKey(answer) {
  const m = /(\d{1,2})\)\s*([^;]*)/.exec(String(answer || "").replace(/^верный ответ:\s*/i, ""));
  if (!m) return null;
  return { number: Number(m[1]) };
}

function readOptions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(String(raw)); } catch { return []; }
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

const fixed = [];
const manual = [];

for (const row of rows) {
  const opts = readOptions(row.options).map((o) => (typeof o === "string" ? { label: o } : { ...o }));
  const labels = opts.map((o) => String(o.label || ""));
  // Считаем только настоящие маркеры «N)»: «(С 2-4)» — диапазон, а не номер варианта.
  const markers = labels.reduce((sum, l) => sum + (l.match(/(?:^|\s)\d{1,2}\s*\)/g) || []).length, 0);
  const merged = markers >= 1 && labels.some((l) => /(?:^|\s)\d{1,2}\s*\)\s*\S/.test(l));
  if (!merged) continue;
  if (opts.length > 6) continue; // уже нормальный список с нумерацией в подписях

  const rebuilt = rebuild(labels);
  const key = answerKey(row.answer);
  const expected = key ? rebuilt.find((c) => c.number === key.number) : null;
  const answerText = String(row.answer || "").replace(/^верный ответ:\s*/i, "").replace(/^\d{1,2}\)\s*/, "").trim();

  // Защита от «починки» слипшихся тестов: вариант не может быть абзацем,
  // а внутри него не должно быть следующего номера вопроса («13. …»).
  const longest = Math.max(...rebuilt.map((c) => c.text.length));
  const hasNextQuestion = rebuilt.some((c) => /\b\d{1,3}\.\s+[А-ЯЁA-Z]/.test(c.text));
  const plausible =
    rebuilt.length >= 3 &&
    rebuilt.length <= 8 &&
    longest <= 140 &&
    !hasNextQuestion &&
    !!expected &&
    (similarity(expected.text, answerText) >= 0.5 || norm(expected.text).startsWith(norm(answerText).slice(0, 12)));

  if (!plausible) {
    manual.push({ id: row.id, text: row.text, labels, answer: row.answer, rebuilt });
    continue;
  }

  const nextOptions = rebuilt.map((c) => ({
    label: c.text,
    correct: c.number === key.number,
    ...(opts[0] && typeof opts[0].id === "string" ? { id: opts[0].id + "-" + c.number } : {}),
  }));
  fixed.push({ id: row.id, text: row.text, before: labels, after: nextOptions });
}

console.log(`проверено вопросов с вариантами: ${rows.length}`);
console.log(`чинится автоматически: ${fixed.length}`);
for (const f of fixed) {
  console.log("\n•", f.text.slice(0, 80));
  console.log("  было:", JSON.stringify(f.before));
  console.log("  стало:", f.after.map((o) => (o.correct ? "✅ " : "") + o.label).join(" | "));
}
console.log(`\nна ручной разбор: ${manual.length}`);
for (const m of manual.slice(0, 20)) {
  console.log("\n?", m.text.slice(0, 80));
  console.log("  варианты:", JSON.stringify(m.labels).slice(0, 220));
  console.log("  ключ:", m.answer, "| разбор:", m.rebuilt.map((c) => c.number + ") " + c.text).join(" ").slice(0, 220));
}

if (DRY) {
  console.log("\n--dry: БД не изменена. Для записи запустите с --apply");
} else {
  let updated = 0;
  for (const f of fixed) {
    await client.query("update questions set options = $1::jsonb where id = $2", [
      JSON.stringify(f.after),
      f.id,
    ]);
    updated += 1;
  }
  console.log(`\nобновлено в БД: ${updated}`);

  // Уже начатые сессии хранят свою копию вопроса в question_snapshot —
  // без этого студент продолжал бы видеть склеенные варианты до конца попытки.
  if (process.argv.includes("--snapshots")) {
    const fixedById = new Map(fixed.map((f) => [f.id, f.after]));
    const sessions = (
      await client.query(
        "select id, question_snapshot from test_preparation_sessions where question_snapshot is not null",
      )
    ).rows;
    let patched = 0;
    for (const session of sessions) {
      let snapshot;
      try { snapshot = JSON.parse(String(session.question_snapshot)); } catch { continue; }
      if (!Array.isArray(snapshot)) continue;
      let changed = false;
      for (const item of snapshot) {
        const fresh = item?.id ? fixedById.get(String(item.id)) : null;
        if (!fresh) continue;
        item.options = fresh.map((o) => ({ label: o.label, correct: o.correct }));
        changed = true;
      }
      if (!changed) continue;
      await client.query("update test_preparation_sessions set question_snapshot = $1::jsonb where id = $2", [
        JSON.stringify(snapshot),
        session.id,
      ]);
      patched += 1;
    }
    console.log(`сессий со снимком исправлено: ${patched}`);
  }
}

await client.end();
