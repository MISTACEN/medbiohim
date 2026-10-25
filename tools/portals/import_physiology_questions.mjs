// Импорт ВСЕГО содержимого методичек физиологии (public/content/physiology)
// в Supabase questions (subject: physiology):
//   тесты           → type 'mcq'  (+ текст верного варианта как эталон, где известен)
//   контрольные     → type 'open'
//   ситуационные    → type 'open'
//   задачи/практика → type 'open'
// source_key = phys_<kind>:<sha1(text)[:12]> — дедупликация и идемпотентность.
//
// Запуск: node tools/portals/import_physiology_questions.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(REPO, "public", "content", "physiology");
const DRY = process.argv.includes("--dry");
const PHYSIOLOGY_SUBJECT = "6957e370-029e-4a9d-a6d2-fedf645328a9";

function readableAnswer(answer, options) {
  // В JSON ответ — номера вариантов через запятую (1-базные), либо пусто.
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
    for (const lesson of manual.lessons) {
      const topicNote = `${manual.title} · ${lesson.title}`;
      for (const group of lesson.tests || []) {
        for (const q of group.questions || []) {
          const text = String(q.text || "").trim();
          if (text.length < 8) continue;
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
        const text = String(q).trim();
        if (text.length < 8) continue;
        rows.push({ kind: "open", text, options: [], answer: null, note: `Контрольный вопрос · ${topicNote}` });
      }
      for (const s of lesson.situational || []) {
        const text = String(s).trim();
        if (text.length < 8) continue;
        rows.push({ kind: "open", text, options: [], answer: null, note: `Ситуационная задача · ${topicNote}` });
      }
      for (const t of lesson.tasks || []) {
        const text = String(t).trim();
        if (text.length < 8) continue;
        rows.push({ kind: "open", text, options: [], answer: null, note: `Задача · ${topicNote}` });
      }
    }
    for (const bank of manual.banks || []) {
      for (const q of bank.questions || []) {
        const text = String(q.text || "").trim();
        if (text.length < 8) continue;
        rows.push({
          kind: "mcq",
          text,
          options: (q.options || []).map(String),
          answer: readableAnswer(q.answer, q.options || []),
          note: `Тест · ${bank.title} (${manual.title})`,
        });
      }
    }
  }
  // Дедуп по тексту+типу: одинаковые вопросы из разных занятий схлопываем
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

  let inserted = 0;
  for (let pass = 1; pass <= 8; pass += 1) {
    const client = await connect();
    console.log(`проход ${pass}: connected`);
    inserted = 0;
    try {
      for (const row of rows) {
        const res = await client.query(
          `insert into questions (subject_id, type, text, answer, options, is_published, source_key)
           values ($1, $2, $3, $4, $5, true, $6)
           on conflict (subject_id, source_key) where source_key is not null do nothing`,
          [
            PHYSIOLOGY_SUBJECT,
            row.kind,
            row.note ? `${row.text}\n\n[${row.note}]` : row.text,
            row.answer,
            JSON.stringify(row.options || []),
            `phys_${row.kind}:${row.key}`,
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
    `select case when source_key like 'phys_mcq:%' then 'mcq' when source_key like 'phys_open:%' then 'open' else 'другие' end k, count(*)::int n
     from questions where source_key like 'phys_%' group by 1`,
  );
  console.log("phys_* в БД:", check.rows.map((r) => `${r.k}=${r.n}`).join(", "));
  await client.end();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
