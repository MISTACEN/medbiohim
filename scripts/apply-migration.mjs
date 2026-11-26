/**
 * Применение одной SQL-миграции к базе из .env.local (DB_URL).
 *
 * Запуск:  node scripts/apply-migration.mjs database/migrations/<file>.sql --yes
 *
 * Скрипт намеренно требует `--yes`: это запись в боевую базу. Он выполняет файл
 * как единый батч (миграции в репозитории оборачивают себя в BEGIN/COMMIT),
 * печатает итог и завершается с кодом 1 на ошибке. Read-only проверки схемы —
 * в scripts/audit-schema.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const [, , file, flag] = process.argv;
if (!file || flag !== "--yes") {
  console.error("usage: node scripts/apply-migration.mjs <file.sql> --yes");
  process.exit(2);
}

const repo = path.resolve(import.meta.dirname, "..");
const envPath = path.join(repo, ".env.local");
if (!fs.existsSync(envPath)) throw new Error(".env.local not found");

for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
  if (!m) continue;
  let value = m[2].trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  if (!process.env[m[1]]) process.env[m[1]] = value;
}

const rawUrl = process.env.DB_URL;
if (!rawUrl) throw new Error("DB_URL is missing");
// Локальная сеть перехватывает TLS, поэтому режим проверки задаём явно.
const parsed = new URL(rawUrl);
parsed.searchParams.delete("sslmode");

const sqlPath = path.isAbsolute(file) ? file : path.join(repo, file);
const sql = fs.readFileSync(sqlPath, "utf8");
console.log(`applying ${path.relative(repo, sqlPath)} (${sql.length} bytes)`);

const client = new pg.Client({ connectionString: parsed.toString(), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const started = Date.now();
  await client.query(sql);
  console.log(`ok in ${Date.now() - started} ms`);
} finally {
  await client.end();
}