// Зеркалирование картинок лекций в Supabase Storage — второе хранилище
// (public бакет lecture-media) с манифестом «что / где / когда».
//
// - бакет lecture-media (public), пути зеркалят public/library/lectures/**
// - media-manifest.json внутри бакета + копия в tools/media/:
//     { generated_at, bucket, files: [{path, storage_path, url, size, sha1, uploaded_at}] }
// - идемпотентно: файлы с совпавшим sha1 не перезаливаются.
//
// Запуск: node tools/media/sync_to_supabase_storage.mjs [--dry] [--bucket=lecture-media]

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(REPO, "public", "library", "lectures");
const MANIFEST_LOCAL = path.join(REPO, "tools", "media", "media-manifest.json");
const DRY = process.argv.includes("--dry");
const BUCKET = (process.argv.find((a) => a.startsWith("--bucket=")) || "--bucket=lecture-media").slice(9);

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
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

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("нет SUPABASE_URL / SUPABASE_SERVICE_KEY в .env.local");
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  // 1. Бакет (создаём, если нет)
  if (!DRY) {
    const res = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: BUCKET, public: true }),
    });
    if (res.ok) console.log(`бакет ${BUCKET} создан (public)`);
    else {
      const err = await res.json().catch(() => ({}));
      if (String(err.message || "").includes("already exists") || res.status === 409) {
        console.log(`бакет ${BUCKET} уже существует`);
      } else throw new Error(`создание бакета: ${res.status} ${JSON.stringify(err)}`);
    }
  }

  // 2. Существующий манифест (локальный или из бакета)
  let manifest = null;
  if (fs.existsSync(MANIFEST_LOCAL)) manifest = JSON.parse(fs.readFileSync(MANIFEST_LOCAL, "utf8"));
  else {
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}/media-manifest.json`, { headers });
    if (res.ok) manifest = await res.json();
  }
  const byPath = new Map((manifest?.files || []).map((f) => [f.path, f]));
  const now = new Date().toISOString();

  // 3. Обход файлов
  const files = listFiles(SRC);
  console.log(`файлов в public/library/lectures: ${files.length}`);
  const result = [];
  let uploaded = 0, skipped = 0, bytes = 0;
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(SRC, rel));
    const hash = sha1(buf);
    const prev = byPath.get(rel);
    const storage_path = `lectures/${rel}`;
    const entry = {
      path: rel,
      storage_path,
      url: `${url}/storage/v1/object/public/${BUCKET}/${storage_path}`,
      size: buf.length,
      sha1: hash,
      uploaded_at: prev?.sha1 === hash ? prev.uploaded_at : now,
    };
    if (prev?.sha1 === hash) {
      skipped += 1;
    } else if (!DRY) {
      const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${storage_path}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/octet-stream", "x-upsert": "true" },
        body: buf,
      });
      if (!up.ok) {
        const err = await up.text();
        console.error(`  !! ${rel}: ${up.status} ${err.slice(0, 120)}`);
        continue;
      }
      uploaded += 1;
      bytes += buf.length;
    }
    result.push(entry);
  }
  console.log(`перезалито: ${uploaded} (${(bytes / 1e6).toFixed(1)} MB), без изменений: ${skipped}${DRY ? " (dry)" : ""}`);

  // 4. Манифест: в бакет + локальная копия
  manifest = {
    generated_at: now,
    bucket: BUCKET,
    base_url: `${url}/storage/v1/object/public/${BUCKET}`,
    note: "Зеркало картинок лекций из public/library/lectures — второе хранилище рядом с git/Vercel. path — путь в репо, storage_path — ключ в бакете, uploaded_at — когда файл был залит/обновлён.",
    files: result,
  };
  if (!DRY) {
    fs.mkdirSync(path.dirname(MANIFEST_LOCAL), { recursive: true });
    fs.writeFileSync(MANIFEST_LOCAL, JSON.stringify(manifest, null, 1) + "\n");
    const up = await fetch(`${url}/storage/v1/object/${BUCKET}/media-manifest.json`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", "x-upsert": "true" },
      body: JSON.stringify(manifest),
    });
    if (!up.ok) throw new Error(`манифест: ${up.status} ${await up.text()}`);
    console.log(`манифест: ${result.length} записей → ${BUCKET}/media-manifest.json и tools/media/media-manifest.json`);
  } else {
    console.log(`(dry) манифест бы содержал ${result.length} записей`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
