/**
 * Диагностика ledger миграций Supabase (только чтение).
 *
 * Сверяет `supabase_migrations.schema_migrations` с файлами `database/migrations`
 * и печатает, каких версий нет с той или другой стороны. Ничего не пишет в базу:
 * нужен `DB_URL` в `.env.local` и пакет `pg` (ставится `--no-save`).
 *
 *   node scripts/check-migration-ledger.mjs
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
  // Supabase в этом проекте отдаёт самоподписанный сертификат в цепочке;
  // sslmode из строки перебивает явный ssl-конфиг, поэтому убираем его.
  url.searchParams.delete("sslmode");
  connection = url.toString();
} catch {
  /* оставляем строку как есть */
}

const local = new Map();
for (const file of fs.readdirSync("database/migrations")) {
  const match = file.match(/^(\d{14})/);
  if (match) local.set(match[1], file);
}

const client = new Client({ connectionString: connection, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const result = await client.query(
    "select version from supabase_migrations.schema_migrations order by version",
  );
  const remote = result.rows.map((row) => String(row.version));
  const remoteSet = new Set(remote);
  const remoteOnly = remote.filter((version) => !local.has(version));
  const localOnly = [...local.keys()].filter((version) => !remoteSet.has(version));
  console.log(
    JSON.stringify(
      {
        remote: remote.length,
        local: local.size,
        remote_only: remoteOnly.length,
        local_only: localOnly.length,
        remote_only_sample: remoteOnly.slice(0, 10),
        local_only_sample: localOnly.slice(0, 10),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("ledger check failed:", String(error.message).slice(0, 160));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
