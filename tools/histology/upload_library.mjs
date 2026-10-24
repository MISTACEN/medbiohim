// Загрузка библиотеки гистологии (атласы PDF + видеолекции) в Supabase Storage
// (публичный бакет "histology") и регистрация в materials (subject: histology).
//
// Файлы >50 МБ льются через TUS (resumable), остальные — простой POST.
// Запуск: node tools/histology/upload_library.mjs [--skip-upload]
// Требует .env.local (SUPABASE_URL, SUPABASE_SECRET_KEY/SERVICE_KEY, DB_URL).
// Идемпотентно: аплоад с x-upsert, materials ищутся по source_key.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(path.dirname(REPO), "на сайт");
const SKIP_UPLOAD = process.argv.includes("--skip-upload");
const CHUNK = 16 * 1024 * 1024; // 16 МБ чанк для TUS

const FILES = [
  {
    key: "library/atlas-kuznecov.part1.pdf",
    file: "public/library/histology/atlas-kuznecov.part1.pdf",
    local: true,
    title: "Атлас по гистологии (Кузнецов С.Л.) — часть 1 из 2",
    type: "pdf",
    mime: "application/pdf",
  },
  {
    key: "library/atlas-kuznecov.part2.pdf",
    file: "public/library/histology/atlas-kuznecov.part2.pdf",
    local: true,
    title: "Атлас по гистологии (Кузнецов С.Л.) — часть 2 из 2",
    type: "pdf",
    mime: "application/pdf",
  },
  {
    key: "library/atlas-yushkanceva-bykov.pdf",
    file: "Атлас-Юшканцева, Быков.pdf",
    title: "Атлас по гистологии (Юшканцева Н.Ю., Быков В.Л.)",
    type: "pdf",
    mime: "application/pdf",
  },
  {
    key: "library/uchebnik-afanasev.part1.pdf",
    file: "public/library/histology/uchebnik-afanasev.part1.pdf",
    local: true,
    title: "Гистология, цитология и эмбриология — учебник (Афанасьев Ю.И.), часть 1 из 3",
    type: "pdf",
    mime: "application/pdf",
  },
  {
    key: "library/uchebnik-afanasev.part2.pdf",
    file: "public/library/histology/uchebnik-afanasev.part2.pdf",
    local: true,
    title: "Гистология, цитология и эмбриология — учебник (Афанасьев Ю.И.), часть 2 из 3",
    type: "pdf",
    mime: "application/pdf",
  },
  {
    key: "library/uchebnik-afanasev.part3.pdf",
    file: "public/library/histology/uchebnik-afanasev.part3.pdf",
    local: true,
    title: "Гистология, цитология и эмбриология — учебник (Афанасьев Ю.И.), часть 3 из 3",
    type: "pdf",
    mime: "application/pdf",
  },
  {
    key: "library/kurs-lekciy-kuznecov.pdf",
    file: "Kurs-lektsiy Кузнецов.pdf",
    title: "Курс лекций по гистологии (Кузнецов С.Л.)",
    type: "pdf",
    mime: "application/pdf",
  },
  {
    key: "library/video-vvodnaya-citologiya.mp4",
    file: "Гистология. Вводная. Цитология..mp4",
    title: "Видеолекция: Гистология. Вводная. Цитология",
    type: "video",
    mime: "video/mp4",
  },
  {
    key: "library/video-soedinitelnye-tkani-krov.mp4",
    file: "Гистология. Соединительные ткани. Кровь..mp4",
    title: "Видеолекция: Гистология. Соединительные ткани. Кровь",
    type: "video",
    mime: "video/mp4",
  },
];

const env = {};
for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}
const SUPABASE = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_KEY;
const BUCKET = "histology";
const SOURCE_PREFIX = "histology-library:";

if (!SUPABASE || !SERVICE_KEY) {
  console.error("Нет SUPABASE_URL/ключа в .env.local");
  process.exit(1);
}

function b64(s) {
  return Buffer.from(s, "utf8").toString("base64");
}

async function simpleUpload(filePath, key, mime) {
  const body = fs.readFileSync(filePath);
  const res = await fetch(`${SUPABASE}/storage/v1/object/${BUCKET}/${key}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": mime,
      "x-upsert": "true",
    },
    body,
  });
  if (!res.ok) throw new Error(`simple upload ${res.status}: ${await res.text()}`);
  console.log(`  OK (simple) ${key}`);
}

async function tusUpload(filePath, key, mime) {
  const size = fs.statSync(filePath).size;
  const handle = fs.openSync(filePath, "r");
  const createRes = await fetch(`${SUPABASE}/storage/v1/upload/resumable`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(size),
      "Upload-Metadata": `bucketName ${b64(BUCKET)},objectName ${b64(key)},contentType ${b64(mime)},upsert ${b64("true")}`,
    },
  });
  if (!createRes.ok) throw new Error(`tus create ${createRes.status}: ${await createRes.text()}`);
  const uploadUrl = createRes.headers.get("location") || createRes.headers.get("Location");
  if (!uploadUrl) throw new Error("tus: нет location в ответе");

  let offset = 0;
  while (offset < size) {
    const len = Math.min(CHUNK, size - offset);
    const buf = Buffer.alloc(len);
    fs.readSync(handle, buf, 0, len, offset);
    const patch = await fetch(uploadUrl, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": String(offset),
        "Content-Type": "application/offset+octet-stream",
        "Content-Length": String(len),
      },
      body: buf,
      duplex: "half",
    });
    if (!patch.ok) throw new Error(`tus patch ${patch.status}: ${await patch.text()}`);
    offset = Number(patch.headers.get("upload-offset"));
    const pct = ((offset / size) * 100).toFixed(0);
    process.stdout.write(`\r  TUS ${key}: ${pct}% (${(offset / 1048576).toFixed(0)} МБ)`);
  }
  fs.closeSync(handle);
  console.log(`\n  OK (tus) ${key}`);
}

const HISTOLOGY_SUBJECT = "977d78ca-7a58-4b0a-9e93-29d8e03f6946";

async function registerMaterials() {
  const client = new pg.Client({
    connectionString: env.DB_URL.replace(/\?sslmode=\w+/, ""),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  // Заменяем цельные атласы (не прошли лимит 50 МБ) на части
  await client.query(
    "delete from materials where source_key = any($1)",
    [[SOURCE_PREFIX + "library/atlas-kuznecov.pdf", SOURCE_PREFIX + "library/uchebnik-afanasev.pdf"]],
  );
  for (const item of FILES) {
    const sourceKey = SOURCE_PREFIX + item.key;
    const existing = await client.query("select id from materials where source_key = $1", [sourceKey]);
    if (existing.rowCount > 0) {
      console.log(`  materials: уже есть (${item.key})`);
      continue;
    }
    const publicUrl = `${SUPABASE}/storage/v1/object/public/${BUCKET}/${item.key}`;
    await client.query(
      `insert into materials (subject_id, type, title, external_url, order_index, is_published, source_key)
       values ($1, $2, $3, $4, 900, true, $5)`,
      [HISTOLOGY_SUBJECT, item.type, item.title, publicUrl, sourceKey],
    );
    console.log(`  materials: добавлен «${item.title}»`);
  }
  await client.end();
}

(async () => {
  for (const item of FILES) {
    const filePath = item.local ? path.join(REPO, item.file) : path.join(SRC, item.file);
    if (!fs.existsSync(filePath)) {
      console.log(`!! файл не найден, пропуск: ${item.file}`);
      continue;
    }
    const size = fs.statSync(filePath).size;
    console.log(`${item.file} → ${item.key} (${(size / 1048576).toFixed(1)} МБ)`);
    if (SKIP_UPLOAD) continue;
    try {
      if (size > 50 * 1024 * 1024) await tusUpload(filePath, item.key, item.mime);
      else await simpleUpload(filePath, item.key, item.mime);
    } catch (e) {
      console.error(`  FAIL ${item.key}: ${e.message}`);
    }
  }
  console.log("Регистрация в materials:");
  await registerMaterials();
  console.log("Готово.");
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
