/**
 * Read-only introspection of the MEDBIOHIM Supabase schema.
 * Prints columns, constraints, indexes and RLS state for the given tables.
 * Never writes. Credentials come from the repo .env.local (DB_URL).
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const repo = "C:\\Users\\MISTACEN\\Documents\\deepseek-harness\\default-workspace\\medbiohim-main";
const envPath = path.join(repo, ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
  if (!m) continue;
  let value = m[2].trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  if (!process.env[m[1]]) process.env[m[1]] = value;
}

const tables = process.argv.slice(2);

const rawUrl = process.env.DB_URL;
if (!rawUrl) throw new Error("DB_URL is missing");
// Локальная сеть перехватывает TLS: `sslmode` в URL заставляет pg проверять
// цепочку сертификатов, поэтому режим задаём явно, а параметр из URL убираем.
const parsed = new URL(rawUrl);
parsed.searchParams.delete("sslmode");
const connectionString = parsed.toString();

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const q = async (text, params = []) => (await client.query(text, params)).rows;

// `--sql "<select ...>"` — произвольный read-only запрос (миграции не пишем).
const sqlIndex = tables.indexOf("--sql");
if (sqlIndex >= 0) {
  const statement = tables.slice(sqlIndex + 1).join(" ");
  if (!/^\s*(select|with)\b/i.test(statement)) throw new Error("only SELECT/WITH is allowed");
  const rows = await q(statement);
  console.log(JSON.stringify(rows, null, 2));
  await client.end();
  process.exit(0);
}

if (!tables.length) {
  console.log("usage: node scripts/audit-schema.mjs <table> [table...] | --sql \"select ...\"");
  process.exit(1);
}

for (const name of tables) {
  const cols = await q(
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema='public' and table_name=$1
      order by ordinal_position`,
    [name],
  );
  console.log(`\n===== ${name} (${cols.length} columns) =====`);
  for (const c of cols) console.log(`${c.column_name} | ${c.data_type} | null=${c.is_nullable} | def=${c.column_default ?? ""}`);

  const cons = await q(
    `select conname, contype, pg_get_constraintdef(oid) as def
       from pg_constraint
      where conrelid = ($1)::regclass
      order by contype, conname`,
    [`public.${name}`],
  );
  console.log(`--- constraints (${cons.length}) ---`);
  for (const c of cons) console.log(`${c.conname} [${c.contype}] ${c.def}`);

  const idx = await q(
    `select indexname, indexdef from pg_indexes where schemaname='public' and tablename=$1 order by indexname`,
    [name],
  );
  console.log(`--- indexes (${idx.length}) ---`);
  for (const i of idx) console.log(i.indexdef);

  const rls = await q(`select relrowsecurity from pg_class where oid = ($1)::regclass`, [`public.${name}`]);
  console.log(`--- rls enabled: ${rls[0]?.relrowsecurity} ---`);
  const pol = await q(
    `select policyname, cmd, roles::text as roles, qual, with_check from pg_policies where schemaname='public' and tablename=$1`,
    [name],
  );
  for (const p of pol) console.log(`policy ${p.policyname} [${p.cmd}] roles=${p.roles} using=${p.qual ?? "-"} check=${p.with_check ?? "-"}`);

  const grants = await q(
    `select grantee, string_agg(privilege_type, ',') as privs
       from information_schema.role_table_grants
      where table_schema='public' and table_name=$1
      group by grantee order by grantee`,
    [name],
  );
  for (const g of grants) console.log(`grant ${g.grantee}: ${g.privs}`);

  const count = await q(`select count(*)::int as n from public.${name}`);
  console.log(`--- rows: ${count[0].n} ---`);
}

const views = await q(
  `select table_name from information_schema.views where table_schema='public' and table_name like 'trainer%' order by table_name`,
);
console.log("\n===== trainer* views =====", views.map((v) => v.table_name).join(", "));

await client.end();