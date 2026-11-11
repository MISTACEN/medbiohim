// Применение восстановленных эталонов к таблице questions в Supabase.
//
// Источник — JSON методичек (public/content/physiology/*.json): ответ хранится
// номером варианта (1-базный, несколько — через запятую). В БД эталон пишется
// читаемой строкой «Верный ответ: 2) текст; 4) текст» — её разбирает
// question-format.js при проверке ответа.
//
// Запуск: node tools/physiology/apply_recovered_answers.mjs [--dry]
//         node tools/physiology/apply_recovered_answers.mjs --only=sensornye
//
// Идемпотентно: обновляются только строки, где эталон отличается.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(REPO, "public", "content", "physiology");
const DRY = process.argv.includes("--dry");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice("--only=".length);

function loadEnv() {
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function readable(answer, options) {
  const idx = String(answer || "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= options.length);
  if (!idx.length) return null;
  return "Верный ответ: " + idx.map((n) => `${n}) ${String(options[n - 1] || "").trim()}`).join("; ");
}

function collect() {
  const rows = new Map();
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json")) {
    if (ONLY && !file.includes(ONLY)) continue;
    const manual = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    const groups = manual.banks?.length
      ? manual.banks.map((b) => b.questions || [])
      : (manual.lessons || []).flatMap((l) => (l.tests || []).map((t) => t.questions || []));
    for (const qs of groups) {
      for (const q of qs) {
        const text = String(q.text || "").trim();
        const answer = readable(q.answer, q.options || []);
        if (!text || !answer) continue;
        const key = "phys_mcq:" + crypto.createHash("sha1").update(`mcq:${text}`).digest("hex").slice(0, 12);
        rows.set(key, answer);
      }
    }
  }
  return rows;
}

(async () => {
  const rows = collect();
  console.log(`эталонов к применению: ${rows.size}${ONLY ? ` (только ${ONLY})` : ""}`);
  if (DRY) {
    for (const [k, v] of [...rows].slice(0, 3)) console.log("  ", k, "|", v.slice(0, 70));
    return;
  }
  loadEnv();
  if (!process.env.DB_URL) throw new Error("нет DB_URL в .env.local");
  const client = new pg.Client({
    connectionString: process.env.DB_URL.replace(/\?sslmode=\w+/, ""),
    ssl: { rejectUnauthorized: false },
  });
  client.on("error", () => {});
  await client.connect();
  let updated = 0;
  const entries = [...rows];
  const CHUNK = 200;
  try {
    for (let i = 0; i < entries.length; i += CHUNK) {
      const part = entries.slice(i, i + CHUNK);
      const values = part.map(([key, answer], j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(", ");
      const params = part.flatMap(([key, answer]) => [key, answer]);
      const res = await client.query(
        `update questions q set answer = v.answer
           from (values ${values}) as v(source_key, answer)
          where q.source_key = v.source_key and q.type = 'mcq'
            and (q.answer is null or q.answer <> v.answer)`,
        params,
      );
      updated += res.rowCount;
      process.stdout.write(`\r  обновлено ${updated}/${entries.length}`);
    }
    process.stdout.write("\n");
  } finally {
    const stats = await client
      .query(
        `select count(*) filter (where answer is not null and answer <> '')::int as with_answer, count(*)::int as total
         from questions where subject_id = '6957e370-029e-4a9d-a6d2-fedf645328a9' and type = 'mcq'`,
      )
      .catch(() => null);
    await client.end().catch(() => {});
    console.log(`обновлено в БД: ${updated}`);
    if (stats) console.log(`mcq физиологии: ${stats.rows[0].with_answer} из ${stats.rows[0].total} с эталоном`);
  }
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
