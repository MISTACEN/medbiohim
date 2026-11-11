// Импорт банков тестовых заданий гистологии (public/content/histology)
// в Supabase questions (subject: histology):
//   тесты из сборников/баз → type 'mcq' (+ эталон, где известен)
//   открытые вопросы       → type 'open'
// source_key = hist_<kind>:<sha1(text)[:12]> — дедупликация и идемпотентность
// (аналог import_physiology_questions.mjs).
//
// Запуск: node tools/portals/import_histology_questions.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(REPO, "public", "content", "histology");
const DRY = process.argv.includes("--dry");
// Канонический subject гистологии: у 977d78ca… уже 600+ вопросов; подстраховка —
// если в subjects появились другие histology-строки, берём ту, где больше вопросов.
const HISTOLOGY_SUBJECT = "977d78ca-7a58-4b0a-9e93-29d8e03f6946";

function readableAnswer(answer, options) {
  const idx = String(answer || "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= options.length);
  if (!idx.length) return null;
  const parts = idx.map((n) => `${n}) ${String(options[n - 1] || "").trim()}`);
  return `Верный ответ: ${parts.join("; ")}`;
}

function collect() {
  const rows = [];
  for (const fname of fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json")) {
    const manual = JSON.parse(fs.readFileSync(path.join(DIR, fname), "utf8"));
    for (const lesson of manual.lessons || []) {
      const topicNote = `${manual.title} · ${lesson.title}`;
      for (const group of lesson.tests || []) {
        for (const q of group.questions || []) {
          const text = String(q.text || "").trim();
          if (text.length < 8 || !Array.isArray(q.options)) continue;
          rows.push({
            kind: "mcq",
            text,
            options: (q.options || []).map(String),
            answer: readableAnswer(q.answer, q.options || []),
            note: `Тест · ${group.title || topicNote}`,
          });
        }
      }
      for (const q of lesson.questions || []) {
        const text = typeof q === "string" ? q.trim() : String(q?.text || "").trim();
        if (text.length < 8) continue;
        rows.push({ kind: "open", text, options: [], answer: null, note: `Контрольный вопрос · ${topicNote}` });
      }
    }
    for (const bank of manual.banks || []) {
      for (const q of bank.questions || []) {
        const text = String(q.text || "").trim();
        if (text.length < 8) continue;
        const options = (q.options || []).map(String);
        rows.push({
          kind: options.length ? "mcq" : "open",
          text,
          options,
          answer: options.length ? readableAnswer(q.answer, options) : null,
          note: `Тест · ${bank.title} (${manual.title})`,
        });
      }
    }
  }
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const key = crypto.createHash("sha1").update(`${row.kind}:${row.text}`).digest("hex").slice(0, 12);
    if (seen.has(key)) continue;
    seen.add(key);
    row.key = key;
    unique.push(row);
  }
  return unique;
}

async function resolveSubject(client) {
  const res = await client.query(
    `select s.id, count(q.id)::int n from subjects s
     left join questions q on q.subject_id = s.id
     where s.slug = 'histology'
     group by s.id order by n desc limit 1`,
  );
  return res.rows[0]?.id || HISTOLOGY_SUBJECT;
}

(async () => {
  const rows = collect();
  const withAnswer = rows.filter((r) => r.kind === "mcq" && r.answer).length;
  console.log(`к загрузке: ${rows.length} записей (mcq с эталоном: ${withAnswer})`);
  const byKind = rows.reduce((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] || 0) + 1 }), {});
  console.log("по типам:", JSON.stringify(byKind));
  if (DRY) {
    for (const r of rows.slice(0, 3)) console.log("  пример:", r.kind, "|", r.text.slice(0, 60), "|", (r.answer || "").slice(0, 60));
    return;
  }

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

  let subjectId = null;
  let inserted = 0;
  for (let pass = 1; pass <= 8; pass += 1) {
    const client = await connect();
    subjectId = subjectId || (await resolveSubject(client));
    console.log(`проход ${pass}: connected, subject=${subjectId}`);
    inserted = 0;
    try {
      for (const row of rows) {
        const res = await client.query(
          `insert into questions (subject_id, type, text, answer, options, is_published, source_key)
           values ($1, $2, $3, $4, $5, true, $6)
           on conflict (subject_id, source_key) where source_key is not null do nothing`,
          [
            subjectId,
            row.kind,
            row.note ? `${row.text}\n\n[${row.note}]` : row.text,
            row.answer,
            JSON.stringify(row.options || []),
            `hist_${row.kind}:${row.key}`,
          ],
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
  const check = await client.query(
    `select case when source_key like 'hist_mcq:%' then 'mcq' when source_key like 'hist_open:%' then 'open' else 'другие' end k, count(*)::int n
     from questions where source_key like 'hist_%' group by 1`,
  );
  console.log("hist_* в БД:", check.rows.map((r) => `${r.k}=${r.n}`).join(", "));
  await client.end();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
