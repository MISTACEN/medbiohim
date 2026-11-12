// Зеркалирование статического контента public/content на серверы.
//
// - Supabase Storage, бакет content-mirror (public): content/<путь в репо>
//   — полная копия файлов, включая те, что не разобраны в таблицы.
// - Supabase Postgres, site_content: ключ static_content:<путь без .json>
//   — JSON-контент в БД, чтобы его можно было читать серверным маршрутом
//   без статики и без деплоя.
//
// Идемпотентно: storage сверяется по sha1, БД — по тексту payload.
// Манифест (что / где / когда) пишется в бакет и в tools/content/content-manifest.json.
//
// Запуск: node tools/content/mirror_static_content.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.resolve(REPO, (process.argv.find((a) => a.startsWith("--src=")) || "--src=public/content").slice(6));
/** Префиксы внутри SRC, которые не зеркалим: картинки лекций уже в бакете lecture-media. */
const SKIP = ((process.argv.find((a) => a.startsWith("--skip=")) || "").slice(7) || "")
  .split(",")
  .filter(Boolean);

const BUCKET = (process.argv.find((a) => a.startsWith("--bucket=")) || "--bucket=content-mirror").slice(9);
const DRY = process.argv.includes("--dry");

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) env[m[1]] = m[2];
  }
  return env;
}

const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).replace(/\\/g, "/"));
  }
  return out.sort();
}

const contentKey = (rel) => `static_content:${rel.replace(/\.json$/i, "")}`;

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("нет SUPABASE_URL / SUPABASE_SERVICE_KEY в .env.local");
  if (!env.DB_URL) throw new Error("нет DB_URL в .env.local");
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  if (!DRY) {
    const res = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: BUCKET, public: true }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (!(res.status === 409 || String(err.message || "").includes("already exists"))) {
        throw new Error(`создание бакета: ${res.status} ${JSON.stringify(err)}`);
      }
    }
  }

  const base = path.relative(path.join(REPO, "public"), SRC).replace(/\\/g, "/");
  const manifestName = `${base.replace(/\//g, "-")}-manifest.json`;
  const manifestLocal = path.join(REPO, "tools", "content", manifestName);
  let manifest = { files: [] };
  if (fs.existsSync(manifestLocal)) manifest = JSON.parse(fs.readFileSync(manifestLocal, "utf8"));
  const byPath = new Map((manifest.files || []).map((f) => [f.path, f]));

  const files = listFiles(SRC).filter((rel) => !SKIP.some((p) => rel === p || rel.startsWith(`${p}/`)));
  console.log(`файлов в public/${base}: ${files.length}${SKIP.length ? ` (пропущено: ${SKIP.join(", ")})` : ""}`);

  const client = new pg.Client({ connectionString: env.DB_URL.replace(/\?sslmode=\w+/, ""), ssl: { rejectUnauthorized: false } });
  client.on("error", () => {});
  if (!DRY) await client.connect();

  const now = new Date().toISOString();
  const result = [];
  let uploaded = 0, uploadedBytes = 0, dbWritten = 0, dbSame = 0, skipped = 0, jsonFiles = 0;

  for (const rel of files) {
    const buf = fs.readFileSync(path.join(SRC, rel));
    const hash = sha1(buf);
    const prev = byPath.get(rel);
    const storage_path = `${base}/${rel}`;
    const entry = {
      path: `public/${base}/${rel}`,
      storage_path,
      url: `${url}/storage/v1/object/public/${BUCKET}/${storage_path}`,
      size: buf.length,
      sha1: hash,
      uploaded_at: prev?.sha1 === hash ? prev.uploaded_at : now,
    };

    if (prev?.sha1 === hash) skipped += 1;
    else if (!DRY) {
      const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${storage_path}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/octet-stream", "x-upsert": "true" },
        body: buf,
      });
      if (!up.ok) {
        console.error(`  !! ${rel}: ${up.status} ${(await up.text()).slice(0, 140)}`);
        continue;
      }
      uploaded += 1;
      uploadedBytes += buf.length;
    }

    if (rel.toLowerCase().endsWith(".json")) {
      jsonFiles += 1;
      let payload;
      try {
        payload = JSON.parse(buf.toString("utf8"));
      } catch {
        console.error(`  !! ${rel}: невалидный JSON, только storage`);
        result.push(entry);
        continue;
      }
      if (!DRY) {
        const prevRow = await client.query("select payload::text as text from public.site_content where key = $1", [contentKey(rel)]);
        if (prevRow.rows[0]?.text === JSON.stringify(payload)) {
          dbSame += 1;
        } else {
          await client.query(
            `insert into public.site_content (key, payload, updated_at)
             values ($1, $2::jsonb, now())
             on conflict (key) do update set payload = excluded.payload, updated_at = now()`,
            [contentKey(rel), JSON.stringify(payload)],
          );
          dbWritten += 1;
        }
      }
    }

    result.push(entry);
  }

  if (!DRY) await client.end();

  console.log(`storage: залито ${uploaded} (${(uploadedBytes / 1e6).toFixed(1)} MB), без изменений ${skipped}${DRY ? " (dry)" : ""}`);
  console.log(`site_content: json ${jsonFiles}, записано ${dbWritten}, без изменений ${dbSame}${DRY ? " (dry)" : ""}`);

  if (DRY) return;

  manifest = {
    generated_at: now,
    bucket: BUCKET,
    base_url: `${url}/storage/v1/object/public/${BUCKET}`,
    note: "Зеркало статики из public: path — путь в репо, storage_path — ключ в бакете. JSON из public/content дополнительно лежит в site_content под ключом static_content:<путь без .json>.",
    files: result,
  };
  fs.mkdirSync(path.dirname(manifestLocal), { recursive: true });
  fs.writeFileSync(manifestLocal, JSON.stringify(manifest, null, 1) + "\n");
  const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${manifestName}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", "x-upsert": "true" },
    body: JSON.stringify(manifest),
  });
  if (!up.ok) throw new Error(`манифест: ${up.status} ${await up.text()}`);
  console.log(`манифест: ${result.length} записей → ${BUCKET}/${manifestName} и tools/content/${manifestName}`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
