// Обновление снимков вопросов в незавершённых сессиях подготовки.
//
// question_snapshot создаётся один раз при старте и живёт до конца попытки.
// Если данные вопроса в БД потом исправлены (склеенные варианты, перепутанный
// эталон), студент в уже начатой сессии продолжает видеть старое — именно так
// вопросы 79/82/83 оставались битыми после починки базы.
//
// Скрипт переписывает в снимке текст, варианты, эталон и пояснение актуальными
// значениями из questions. Порядок/ключи вариантов восстанавливает
// normalizeQuestion при чтении, поэтому пересобирать их вручную не нужно.
//
// Запуск: node tools/physiology/refresh_session_snapshots.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = !process.argv.includes("--apply");

function loadEnv() {
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();
const { Client } = await import("pg");
const client = new Client({
  connectionString: String(process.env.DB_URL || "").replace(/\?sslmode=\w+/, ""),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const sessions = (await client.query(
  "select id, status, question_snapshot from test_preparation_sessions where question_snapshot is not null",
)).rows;

const parsed = [];
const ids = new Set();
for (const session of sessions) {
  // jsonb из pg приходит уже разобранным объектом, текст — строкой.
  let snapshot;
  try {
    snapshot = typeof session.question_snapshot === "string"
      ? JSON.parse(session.question_snapshot)
      : session.question_snapshot;
  } catch { continue; }
  if (!Array.isArray(snapshot) || !snapshot.length) continue;
  parsed.push({ session, snapshot });
  for (const item of snapshot) if (item?.id) ids.add(String(item.id));
}

if (!parsed.length) {
  console.log("сессий со снимками нет");
  await client.end();
  process.exit(0);
}

const idList = [...ids];
const fresh = new Map();
for (let i = 0; i < idList.length; i += 200) {
  const chunk = idList.slice(i, i + 200);
  const rows = (await client.query(
    "select id, text, options, answer, explanation, type from questions where id = any($1::uuid[])",
    [chunk],
  )).rows;
  for (const row of rows) fresh.set(String(row.id), row);
}

let sessionsChanged = 0;
let questionsChanged = 0;
for (const { session, snapshot } of parsed) {
  let changed = false;
  for (const item of snapshot) {
    const row = item?.id ? fresh.get(String(item.id)) : null;
    if (!row) continue;
    const options = (Array.isArray(row.options) ? row.options : []).map((o) =>
      (typeof o === "string" ? { label: o, correct: false } : { label: o.label, correct: Boolean(o.correct) }));
    const next = {
      text: row.text ?? item.text,
      options,
      answer: row.answer ?? item.answer ?? null,
      explanation: row.explanation ?? item.explanation ?? null,
    };
    const same =
      JSON.stringify(item.options) === JSON.stringify(options) &&
      String(item.answer ?? "") === String(next.answer ?? "") &&
      String(item.explanation ?? "") === String(next.explanation ?? "") &&
      String(item.text ?? "") === String(next.text ?? "");
    if (same) continue;
    Object.assign(item, next);
    changed = true;
    questionsChanged += 1;
  }
  if (!changed) continue;
  sessionsChanged += 1;
  if (!DRY) {
    await client.query("update test_preparation_sessions set question_snapshot = $1::jsonb where id = $2", [
      JSON.stringify(snapshot), session.id,
    ]);
  }
}

console.log(`сессий со снимками: ${parsed.length}`);
console.log(`вопросов обновлено: ${questionsChanged}`);
console.log(`сессий к записи: ${sessionsChanged}`);
console.log(DRY ? "--dry: БД не изменена" : "записано");
await client.end();
