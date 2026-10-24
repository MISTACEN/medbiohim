// Этап 2: импорт архивных билетных банков (public/content/portals/ticket-banks)
// в Supabase questions. Дедупликация через source_key = legacy_qbs:<slug>:<id>
// и уникальный индекс questions_subject_source_key_uq.
//
// Запуск: node tools/portals/import_questions_to_supabase.mjs [--dry]
// Требует .env.local с DB_URL (session pooler). Драйвер pg: npm i --no-save pg

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = process.argv.includes("--dry");

// slug банка → целевой subject_id в Supabase (проверено по существующим вопросам)
const SUBJECT_IDS = {
  biology: "1be32569-f151-45a4-8b41-b39698888416",
  inorganic_chemistry: "11dd4339-8328-4c9c-b70f-f5818356ef4b",
  physics: "95a82e82-42a7-4bdb-8694-9dddd0d7b4c1",
  math: "d4094aa8-0c3a-48a7-965e-8c89585248bf",
  математический_анализ: "9ae0d620-1673-496e-9d35-5be5936fc2b7",
  history: "a8fb6e4f-cdc4-45a5-842f-41d5c71bcc9e",
  physiology: "6957e370-029e-4a9d-a6d2-fedf645328a9",
  // histology и chemistry_organic_physical в БД уже полнее (673/182) — не трогаем
};

function loadEnv() {
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const TYPE_MAP = { mc: "mcq", mcq: "mcq", open: "open", theory: "theory" };

async function connectWithRetry(retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const client = new pg.Client({
        connectionString: process.env.DB_URL.replace(/\?sslmode=\w+/, ""),
        ssl: { rejectUnauthorized: false },
      });
      client.on("error", () => {}); // обрывы пула лечим переподключением, не крэшем
      await client.connect();
      return client;
    } catch (e) {
      console.log(`  подключение ${attempt}/${retries} не удалось: ${e.message}`);
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

(async () => {
  loadEnv();
  const dir = path.join(REPO, "public", "content", "portals", "ticket-banks");

  // Пулы Supabase иногда рвут соединение: повторяем идемпотентный проход,
  // пока вставляется хотя бы одна строка.
  let totalInserted = 0;
  for (let pass = 1; pass <= 5; pass += 1) {
    const client = await connectWithRetry();
    console.log(`проход ${pass}: connected`);
    let inserted = 0;
    try {
      for (const fname of fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json").sort()) {
        const bank = JSON.parse(fs.readFileSync(path.join(dir, fname), "utf8"));
        for (const item of bank.items) {
          const slug = item.subject_slug === "математический_анализ" ? "математический_анализ" : bank.subject_slug;
          const subjectId = SUBJECT_IDS[slug];
          if (!subjectId) continue;
          const sourceKey = `legacy_qbs:${slug}:${item.id}`;
          const type = TYPE_MAP[String(item.type || "open").toLowerCase()] || "open";
          if (DRY) continue;
          const res = await client.query(
            `insert into questions (subject_id, type, text, answer, options, is_published, source_key)
             values ($1, $2, $3, $4, $5, true, $6)
             on conflict (subject_id, source_key) where source_key is not null do nothing`,
            [subjectId, type, item.text, item.answer || null, JSON.stringify(item.options || []), sourceKey],
          );
          inserted += res.rowCount;
        }
        console.log(`  ${fname}: ok`);
      }
    } catch (e) {
      console.log(`  обрыв на проходе ${pass}: ${e.message}`);
    } finally {
      await client.end().catch(() => {});
    }
    totalInserted += inserted;
    if (DRY || inserted === 0) break;
    console.log(`  проход вставил ${inserted}, продолжаем`);
  }

  if (DRY) {
    console.log("dry-run: вставка не выполнялась");
  } else {
    console.log(`всего вставлено новых вопросов: ${totalInserted}`);
    const client = await connectWithRetry();
    const check = await client.query(
      `select s.slug, count(*) filter (where q.source_key like 'legacy_qbs:%')::int legacy, count(*)::int total
       from questions q join subjects s on s.id = q.subject_id group by 1 order by total desc`,
    );
    for (const row of check.rows) console.log(`  ${row.slug}: legacy=${row.legacy}, всего=${row.total}`);
    await client.end();
  }
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
