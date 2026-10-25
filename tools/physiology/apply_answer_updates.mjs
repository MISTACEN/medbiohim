// Применение эталонов из .tmp-answer-updates.tsv к Supabase questions
// (UPDATE answer по source_key). Запуск: node tools/physiology/apply_answer_updates.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TSV = path.join(REPO, ".tmp-answer-updates.tsv");

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

(async () => {
  const rows = fs.readFileSync(TSV, "utf8").split("\n").filter(Boolean).map((l) => l.split("\t"));
  console.log("обновлений к применению:", rows.length);
  let updated = 0;
  for (let pass = 1; pass <= 5; pass += 1) {
    const client = await connect();
    updated = 0;
    try {
      for (const [sourceKey, answer] of rows) {
        const res = await client.query(
          `update questions set answer = $2 where source_key = $1 and (answer is null or answer = '')`,
          [sourceKey, answer],
        );
        updated += res.rowCount;
      }
    } catch (e) {
      console.log(`  обрыв: ${e.message}`);
    } finally {
      await client.end().catch(() => {});
    }
    if (updated === rows.length) break;
    console.log(`  обновлено ${updated}/${rows.length}, повтор`);
  }
  console.log(`итого обновлено в БД: ${updated}`);

  const client = await connect();
  const check = await client.query(`
    select s.slug, count(*)::int total, count(*) filter (where q.answer is not null and q.answer <> '')::int with_answer
    from questions q join subjects s on s.id = q.subject_id
    where s.slug = 'physiology' and q.type = 'mcq'
    group by 1`);
  console.log(`физиология mcq: ${check.rows[0].total} всего, ${check.rows[0].with_answer} с эталоном`);
  await client.end();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
