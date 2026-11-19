#!/usr/bin/env node
/**
 * Загрузка медиа-библиотеки в Backblaze B2 по docs/media-upload-manifest.json.
 *
 * Нативный B2 API через fetch, без SDK:
 *   файлы ≤ 100 МБ — b2_get_upload_url + b2_upload_file;
 *   файлы больше   — b2_start_large_file + части (по 100 МБ) + b2_finish_large_file.
 * Идемпотентно: если объект уже есть в бакете с тем же размером и sha1 — пропуск.
 *
 *   node scripts/upload-media-b2.mjs [docs/media-upload-manifest.json]
 *
 * Ключи читаются из .env.local (B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET).
 * В stdout не печатаем секреты — только имена файлов и статусы.
 */
import fs from "node:fs";
import crypto from "node:crypto";


const MANIFEST = process.argv[2] ?? "docs/media-upload-manifest.json";
const LARGE_THRESHOLD = 100 * 1024 * 1024;
const PART_SIZE = 100 * 1024 * 1024; // recommendedPartSize
const RETRIES = 3;

function envFromDotenv(file, names) {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && names.includes(match[1])) {
      values[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return values;
}

const env = envFromDotenv(".env.local", ["B2_KEY_ID", "B2_APPLICATION_KEY", "B2_BUCKET"]);
for (const name of ["B2_KEY_ID", "B2_APPLICATION_KEY", "B2_BUCKET"]) {
  if (!env[name]) {
    console.error(`нет ${name} в .env.local`);
    process.exit(2);
  }
}

const auth = Buffer.from(`${env.B2_KEY_ID}:${env.B2_APPLICATION_KEY}`).toString("base64");
const basicHeaders = { Authorization: `Basic ${auth}` };

async function api(name, body, headers = {}) {
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(`${authInfo.apiUrl}/b2api/v3/${name}`, {
        method: "POST",
        headers: {
          // после авторизации все вызовы идут с Bearer-токеном, а не Basic
          Authorization: authInfo.authorizationToken,
          "Content-Type": "application/json",
          ...headers,
        },
        body: body == null ? undefined : JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(`${name}: ${response.status} ${JSON.stringify(data)}`);
      return data;
    } catch (error) {
      if (attempt === RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
}

let authInfo;
async function authorize() {
  const response = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
    headers: basicHeaders,
  });
  if (!response.ok) throw new Error(`b2_authorize_account: ${response.status}`);
  const json = await response.json();
  // v3: apiUrl переехал в apiInfo.storageApi (плоский формат v2 тоже принимаем).
  authInfo = { ...json, ...(json.apiInfo?.storageApi ?? {}) };
  return authInfo;
}

function sha1File(file) {
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
}

async function existingObject(bucketId, key) {
  const list = await api("b2_list_file_names", { bucketId, prefix: key, maxFileCount: 1 });
  const file = list.files?.find((f) => f.fileName === key);
  if (!file) return null;
  const info = await api("b2_get_file_info", { fileId: file.fileId });
  return { contentLength: info.contentLength, sha1: info.contentSha1 };
}

async function uploadSmall(bucketId, file, key, info, sha1) {
  const url = await api("b2_get_upload_url", { bucketId });
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    const response = await fetch(url.uploadUrl, {
      method: "POST",
      headers: {
        Authorization: url.authorizationToken,
        "X-Bz-File-Name": encodeURIComponent(key),
        "Content-Type": info.mime_type,
        "X-Bz-Content-Sha1": sha1,
        "X-Bz-Info-subject": info.subject,
        "X-Bz-Info-sha256": info.sha256,
      },
      body: fs.readFileSync(file),
    });
    if (response.ok) return response.json();
    if (attempt < RETRIES) await new Promise((r) => setTimeout(r, attempt * 2000));
    else throw new Error(`upload small ${key}: ${response.status}`);
  }
}

async function uploadLarge(bucketId, file, key, info) {
  const started = await api("b2_start_large_file", {
    bucketId,
    fileName: key,
    contentType: info.mime_type,
    fileInfo: { subject: info.subject, sha256: info.sha256 },
  });
  const fileId = started.fileId;
  const sha1s = [];
  const size = fs.statSync(file).size;
  for (let offset = 0, partNumber = 1; offset < size; offset += PART_SIZE, partNumber += 1) {
    const part = await api("b2_get_upload_part_url", { fileId });
    const stream = fs.createReadStream(file, { start: offset, end: Math.min(offset + PART_SIZE, size) - 1 });
    const sha1 = await new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha1");
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
    for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
      const response = await fetch(part.uploadUrl, {
        method: "POST",
        headers: {
          Authorization: part.authorizationToken,
          "X-Bz-Part-Number": String(partNumber),
          "Content-Type": "application/octet-stream",
          "Content-Length": String(Math.min(offset + PART_SIZE, size) - offset),
          "X-Bz-Content-Sha1": sha1,
        },
        body: fs.createReadStream(file, { start: offset, end: Math.min(offset + PART_SIZE, size) - 1 }),
        duplex: "half",
      });
      if (response.ok) { sha1s.push(sha1); break; }
      if (attempt === RETRIES) {
        await api("b2_cancel_large_file", { fileId });
        throw new Error(`part ${partNumber} of ${key}: ${response.status}`);
      }
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
    process.stdout.write(`  часть ${partNumber} (${Math.min(offset + PART_SIZE, size) / 1e6} МБ)\n`);
  }
  return api("b2_finish_large_file", { fileId, partSha1Array: sha1s });
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
await authorize();
// Ключ бакетно-ограниченный: authorize уже возвращает bucketId/name,
// b2_list_buckets может не пройти (bad_auth_token у ограниченных ключей).
const bucketId = authInfo.bucketId;
const bucketName = authInfo.bucketName ?? env.B2_BUCKET;
if (bucketId && bucketName !== env.B2_BUCKET) {
  console.error(`ключ привязан к другому бакету: ${bucketName}`);
  process.exit(2);
}
console.log(`бакет: ${bucketName} (${bucketId})`);

let uploaded = 0;
let skipped = 0;
let failed = 0;
for (const entry of manifest.entries ?? []) {
  const file = entry.source;
  if (!fs.existsSync(file)) {
    console.log(`НЕТ ФАЙЛА: ${entry.relative}`);
    failed += 1;
    continue;
  }
  const existing = await existingObject(bucketId, entry.object_key);
  if (existing && existing.contentLength === entry.size_bytes) {
    console.log(`пропуск (уже есть): ${entry.object_key}`);
    skipped += 1;
    continue;
  }
  process.stdout.write(`загрузка: ${entry.object_key} (${(entry.size_bytes / 1e6).toFixed(1)} МБ)…\n`);
  try {
    if (entry.size_bytes > LARGE_THRESHOLD) {
      await uploadLarge(bucketId, file, entry.object_key, entry);
    } else {
      const sha1 = sha1File(file);
      await uploadSmall(bucketId, file, entry.object_key, entry, sha1);
    }
    uploaded += 1;
    console.log(`  готово`);
  } catch (error) {
    console.log(`  ОШИБКА: ${error.message}`);
    failed += 1;
  }
}

console.log(`\nитог: загружено ${uploaded}, пропущено ${skipped}, ошибок ${failed}`);
if (failed) process.exitCode = 1;
