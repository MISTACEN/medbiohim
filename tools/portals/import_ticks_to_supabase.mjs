// Импорт банка вопросов по клещам и кровососущим (вопросы.txt) в Supabase
// questions (subject: biology). source_key = legacy_ticks:<sha1(text)>, идемпотентно.
//
// Файл содержит два формата:
//   часть 1: "Вопрос 1.1. …" + "Правильный ответ: Б"  — с эталонами
//   часть 2: "1.1. …" без пометок ответов             — без эталона
//
// Запуск: node tools/portals/import_ticks_to_supabase.mjs [--dry]
// Источник: <workspace>/на сайт/вопросы.txt

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(path.dirname(REPO), "на сайт", "вопросы.txt");
const DRY = process.argv.includes("--dry");
const BIOLOGY_SUBJECT = "1be32569-f151-45a4-8b41-b39698888416";

const LETTERS = { "А": 0, "Б": 1, "В": 2, "Г": 3, "Д": 4, "Е": 5 };

function parse(srcText) {
  const lines = srcText.split("\n").map((l) => l.trim());
  const questions = [];
  let topic = "";
  let current = null;
  const flush = () => {
    if (current && current.options.length >= 2 && current.text.length > 10) questions.push(current);
    current = null;
  };
  for (const line of lines) {
    if (!line) continue;
    // Заголовок раздела — вид клеща: "1. Ixodes persulcatus (…)", но не вопрос "1.1. …"
    if (/^\d+\.\s+\S/.test(line) && !/^\d+\.\d+\./.test(line) && !line.startsWith("Вопрос")) {
      flush();
      topic = line.replace(/^\d+\.\s*/, "");
      continue;
    }
    // Два формата вопроса: "Вопрос 1.1. Текст" (часть 1, с ответами) и "1.1. Текст" (часть 2)
    const isQuestion = /^Вопрос\s/.test(line) || /^\d+\.\d+\./.test(line);
    if (isQuestion) {
      flush();
      const qm = /^(?:Вопрос\s+)?[\d.]+\.\s*(.+)$/.exec(line);
      current = { text: qm ? qm[1] : line, options: [], correct: null, topic };
      continue;
    }
    if (!current) continue;
    const om = /^([АБВГДЕ])\)\s*(.+)$/.exec(line);
    if (om) {
      current.options.push(om[2]);
      continue;
    }
    const am = /^Правильный ответ:\s*([АБВГДЕ])/.exec(line);
    if (am) {
      current.correct = LETTERS[am[1]];
      continue;
    }
    // продолжение текста вопроса/варианта — дописываем в последний элемент
    if (current.options.length === 0) current.text += " " + line;
    else current.options[current.options.length - 1] += " " + line;
  }
  flush();
  return questions;
}

(async () => {
  const text = fs.readFileSync(SRC, "utf8");
  const questions = parse(text);
  const withAnswer = questions.filter((q) => q.correct != null).length;
  const topics = new Set(questions.map((q) => q.topic)).size;
  console.log(`распознано вопросов: ${questions.length} (с эталоном: ${withAnswer}), тем: ${topics}`);

  const env = {};
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }

  async function connect() {
    const client = new pg.Client({ connectionString: env.DB_URL.replace(/\?sslmode=\w+/, ""), ssl: { rejectUnauthorized: false } });
    client.on("error", () => {});
    await client.connect();
    return client;
  }

  if (DRY) {
    for (const q of questions.slice(0, 3)) {
      console.log("  пример:", q.topic, "|", q.text.slice(0, 60), "| варианты:", q.options.length, "| верный:", q.correct);
    }
    return;
  }

  let inserted = 0;
  for (let pass = 1; pass <= 5; pass += 1) {
    const client = await connect();
    console.log(`проход ${pass}: connected`);
    inserted = 0;
    try {
      for (const q of questions) {
        const key = crypto.createHash("sha1").update(q.text).digest("hex").slice(0, 12);
        const res = await client.query(
          `insert into questions (subject_id, type, text, answer, options, is_published, source_key)
           values ($1, 'mcq', $2, $3, $4, true, $5)
           on conflict (subject_id, source_key) where source_key is not null do nothing`,
          [BIOLOGY_SUBJECT, q.text, q.correct != null ? String(q.correct) : null, JSON.stringify(q.options), `legacy_ticks:${key}`],
        );
        inserted += res.rowCount;
      }
    } catch (e) {
      console.log(`  обрыв: ${e.message}`);
    } finally {
      await client.end().catch(() => {});
    }
    if (inserted === 0) break;
    console.log(`  вставлено ${inserted}, повторяем`);
  }
  console.log(`всего новых: ${inserted}`);

  const client = await connect();
  const check = await client.query(`select count(*)::int n from questions where source_key like 'legacy_ticks:%'`);
  console.log("legacy_ticks в БД:", check.rows[0].n);
  await client.end();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
