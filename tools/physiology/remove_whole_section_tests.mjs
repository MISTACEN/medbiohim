/**
 * Удаляет сгенерированные тесты «весь раздел» (phys_sub:slug:N-M на целый банк):
 * такие банки уже есть в каталоге под своим названием, второй экземпляр давал
 * дубль с отдельным прогрессом. Подразделы внутри банка остаются.
 *
 * Запуск: node tools/physiology/remove_whole_section_tests.mjs [--apply]
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}
const client = new pg.Client({ connectionString: env.DB_URL.replace(/\?sslmode=\w+/, ""), ssl: { rejectUnauthorized: false } });
await client.connect();

// Ключ phys_sub:<slug>:<from>-<to> считается «целым разделом», если он совпадает
// с полным диапазоном банка из content-файла.
const contentDir = path.join(process.cwd(), "public", "content", "physiology");
const whole = [];
for (const file of fs.readdirSync(contentDir).filter((f) => f.endsWith(".json"))) {
  const slug = file.replace(/\.json$/, "");
  const json = JSON.parse(fs.readFileSync(path.join(contentDir, file), "utf8"));
  for (const bank of Array.isArray(json?.banks) ? json.banks : []) {
    const nums = (Array.isArray(bank?.questions) ? bank.questions : []).map((q) => Number(q?.number)).filter(Number.isFinite);
    if (!nums.length) continue;
    whole.push(`phys_sub:${slug}:${Math.min(...nums)}-${Math.max(...nums)}`);
  }
}

const keys = [...new Set(whole)];
const found = (await client.query("select id, source_key, title from tests where source_key = any($1)", [keys])).rows;
console.log(APPLY ? "удаляю:" : "будет удалено:", found.map((r) => `${r.source_key} (${r.title.slice(0, 50)})`).join("\n") || "нет");
if (APPLY) {
  for (const row of found) {
    await client.query("delete from test_preparation_results where session_id in (select id from test_preparation_sessions where test_id = $1)", [row.id]);
    await client.query("delete from test_preparation_sessions where test_id = $1", [row.id]);
    await client.query("delete from test_questions where test_id = $1", [row.id]);
    await client.query("delete from tests where id = $1", [row.id]);
  }
  const left = await client.query("select count(*)::int n from tests where source_key like 'phys_sub:%'");
  console.log("осталось phys_sub тестов:", left.rows[0].n);
}
await client.end();
