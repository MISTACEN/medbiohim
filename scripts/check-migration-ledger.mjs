const fs = require('fs'); const path = require('path');
const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => { const m = env.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.+)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; };
let raw = get('DB_URL'); try { const u = new URL(raw); u.searchParams.delete('sslmode'); raw = u.toString(); } catch {}
const { Client } = require('pg');
const dir = 'database/migrations';
const local = new Map();
for (const f of fs.readdirSync(dir)) { const m = f.match(/^(\d{14})/); if (m) local.set(m[1], f); }
(async () => {
  const client = new Client({ connectionString: raw, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const r = await client.query('select version from supabase_migrations.schema_migrations order by version');
    const remote = r.rows.map((x) => String(x.version));
    const remoteset = new Set(remote);
    const remoteOnly = remote.filter((v) => !local.has(v));
    const localOnly = [...local.keys()].filter((v) => !remoteset.has(v));
    console.log(JSON.stringify({ remote: remote.length, local: local.size, remote_only: remoteOnly.length, local_only: localOnly.length, remote_only_sample: remoteOnly.slice(0, 10), local_only_sample: localOnly.slice(0, 10) }, null, 2));
    fs.writeFileSync(path.join(process.env.TEMP || '.', 'ledger-diff.json'), JSON.stringify({ remoteOnly, localOnly }, null, 2));
  } catch (e) { console.log('ERR', String(e.message).slice(0, 160)); }
  finally { await client.end().catch(() => {}); }
})();
