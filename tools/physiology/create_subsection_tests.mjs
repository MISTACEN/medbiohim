/**
 * Создаёт отдельные тесты для разделов и подразделов методичек физиологии.
 *
 * Зачем: подраздел нельзя запускать как срез внутри полного теста — у пары
 * (user_id, test_id) один незавершённый прогресс, и «подраздел» подхватывал бы
 * полный тест. Отдельный тест на подраздел даёт свой прогресс, возобновление и
 * статистику, при этом вопросы берутся из уже собранного полного теста.
 *
 * Запуск: node tools/physiology/create_subsection_tests.mjs [--apply]
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();
const SUBJECT_ID = "6957e370-029e-4a9d-a6d2-fedf645328a9";

function readEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const contentDir = path.join(ROOT, "public", "content", "physiology");
const files = fs.readdirSync(contentDir).filter((f) => f.endsWith(".json") && f !== "index.json");

function rangesFor(bank) {
  const subs = Array.isArray(bank?.subsections) ? bank.subsections : [];
  const out = [];
  const nums = (Array.isArray(bank?.questions) ? bank.questions : []).map((q) => Number(q?.number)).filter(Number.isFinite);
  for (const sub of subs) {
    const from = Number(sub?.from);
    const to = Number(sub?.to);
    if (Number.isFinite(from) && Number.isFinite(to) && to >= from) {
      out.push({ title: String(sub.title || ""), from, to, count: nums.filter((n) => n >= from && n <= to).length });
    }
  }
  // «Весь раздел» не генерируем: такой банк уже есть в каталоге под своим
  // названием, второй экземпляр давал дубль с отдельным прогрессом.
  return out;
}

const env = readEnv();
const client = new pg.Client({ connectionString: env.DB_URL.replace(/\?sslmode=\w+/, ""), ssl: { rejectUnauthorized: false } });
await client.connect();

let created = 0;
let updated = 0;
let skipped = 0;

for (const file of files) {
  const slug = file.replace(/\.json$/, "");
  const json = JSON.parse(fs.readFileSync(path.join(contentDir, file), "utf8"));
  const parent = await client.query("select id from tests where source_key = $1 limit 1", [`phys_full:${slug}`]);
  if (!parent.rows[0]) {
    console.log(`${slug}: нет полного теста phys_full:${slug} — пропуск`);
    continue;
  }
  const parentId = parent.rows[0].id;
  const links = await client.query("select question_id from test_questions where test_id = $1 order by order_index asc, question_id asc", [parentId]);
  const parentIds = links.rows.map((r) => String(r.question_id));
  if (!parentIds.length) {
    console.log(`${slug}: полный тест без вопросов — пропуск`);
    continue;
  }

  for (const bank of Array.isArray(json?.banks) ? json.banks : []) {
    for (const range of rangesFor(bank)) {
      const key = `phys_sub:${slug}:${range.from}-${range.to}`;
      const title = `${range.whole ? "Раздел" : "Подраздел"} · ${range.title} · вопросы ${range.from}–${range.to}`.slice(0, 200);
      const slice = parentIds.slice(range.from - 1, range.to);
      if (!slice.length) {
        console.log(`${slug} ${range.from}-${range.to}: пусто в полном тесте — пропуск`);
        skipped++;
        continue;
      }
      const existing = await client.query("select id from tests where source_key = $1 limit 1", [key]);
      let testId = existing.rows[0]?.id;
      if (!APPLY) {
        console.log(`${existing.rows[0] ? "обновит" : "создаст"}: ${key} · ${slice.length} вопр.`);
        continue;
      }
      if (!testId) {
        const inserted = await client.query(
          "insert into tests (subject_id, title, source_key, is_published, order_index) values ($1,$2,$3,true,$4) returning id",
          [SUBJECT_ID, title, key, 900 + range.from]
        );
        testId = inserted.rows[0].id;
        created++;
      } else {
        await client.query("update tests set title = $2 where id = $1", [testId, title]);
        await client.query("delete from test_questions where test_id = $1", [testId]);
        updated++;
      }
      for (let i = 0; i < slice.length; i++) {
        await client.query(
          "insert into test_questions (test_id, question_id, order_index) values ($1,$2,$3) on conflict do nothing",
          [testId, slice[i], i]
        );
      }
      console.log(`${existing.rows[0] ? "обновлён" : "создан"}: ${key} · ${slice.length} вопр.`);
    }
  }
}

console.log(`\nИтого: создано ${created}, обновлено ${updated}, пропущено ${skipped}${APPLY ? "" : " (dry-run, добавьте --apply)"}`);
await client.end();
