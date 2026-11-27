/**
 * Repair ledger миграций Supabase: отмечает локальные файлы как применённые.
 *
 * Зачем: 58 файлов `database/migrations/*.sql` применялись вручную и не попали
 * в `supabase_migrations.schema_migrations`. Из-за этого сверка миграций ругается,
 * хотя схема в базе есть.
 *
 * Безопасность:
 *   - по умолчанию только показывает, что будет сделано (`--dry-run` по факту);
 *   - запись только с `--apply`;
 *   - перед записью сохраняет текущий ledger в `data/ledger-backup.json`;
 *   - всё в одной транзакции: либо все строки, либо ни одной;
 *   - `ON CONFLICT (version) DO NOTHING` — повторный запуск безопасен.
 *
 *   node scripts/repair-migration-ledger.mjs           # план
 *   node scripts/repair-migration-ledger.mjs --apply   # записать
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const env = fs.readFileSync(".env.local", "utf8");
const get = (key) => {
  const match = env.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, "m"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
};

let connection = get("DB_URL");
try {
  const url = new URL(connection);
  url.searchParams.delete("sslmode");
  connection = url.toString();
} catch {
  /* оставляем как есть */
}

const apply = process.argv.includes("--apply");
const dir = "database/migrations";
const local = [...fs.readdirSync(dir)]
  .map((file) => (file.match(/^(\d{14})/) || [])[1])
  .filter(Boolean)
  .sort();

const client = new Client({ connectionString: connection, ssl: { rejectUnauthorized: false } });
await client.connect();

const columns = await client.query(
  "select column_name, is_nullable, column_default from information_schema.columns where table_schema = 'supabase_migrations' and table_name = 'schema_migrations' order by ordinal_position",
);
const columnNames = columns.rows.map((row) => row.column_name);
const requiredWithoutDefault = columns.rows
  .filter((row) => row.is_nullable === "NO" && !row.column_default)
  .map((row) => row.column_name)
  .filter((name) => name !== "version" && name !== "name");

const existing = await client.query("select version, name from supabase_migrations.schema_migrations");
const known = new Set(existing.rows.map((row) => String(row.version)));
const missing = local.filter((version) => !known.has(version));

console.log(
  JSON.stringify(
    {
      ledger_columns: columnNames,
      required_extra_columns: requiredWithoutDefault,
      local_files: local.length,
      already_in_ledger: existing.rows.length,
      to_mark_applied: missing.length,
      sample: missing.slice(0, 8),
    },
    null,
    2,
  ),
);

if (!apply || !missing.length) {
  console.log(apply ? "нечего записывать" : "план готов; запись: --apply");
  await client.end();
  process.exit(0);
}

if (requiredWithoutDefault.length) {
  console.error(`ledger требует колонки без default: ${requiredWithoutDefault.join(", ")} — пиши через supabase CLI`);
  await client.end();
  process.exit(2);
}

const hasName = columnNames.includes("name");
fs.writeFileSync(
  "data/ledger-backup.json",
  JSON.stringify({ saved_at: new Date().toISOString(), rows: existing.rows }, null, 2) + "\n",
  "utf8",
);

const hasNameColumn = hasName && !requiredWithoutDefault.includes("name");
const values = missing.map((version, index) => {
  const name = `historical_marker_${version}`;
  return hasNameColumn ? `($${index * 2 + 1}, $${index * 2 + 2})` : `($${index + 1})`;
});
const params = hasNameColumn ? missing.flatMap((version) => [version, `historical_marker_${version}`]) : missing;

const sql = hasNameColumn
  ? `insert into supabase_migrations.schema_migrations (version, name) values ${values.join(", ")} on conflict (version) do nothing`
  : `insert into supabase_migrations.schema_migrations (version) values ${values.join(", ")} on conflict (version) do nothing`;

try {
  await client.query("begin");
  const result = await client.query(sql, params);
  await client.query("commit");
  console.log(`отмечено применёнными: ${result.rowCount}. Бэкап: data/ledger-backup.json`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error("repair отклонён, ничего не записано:", String(error.message).slice(0, 160));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
