// Загрузка ЧИСТЫХ оригиналов электронограмм (без подписей) в Upstash Blob:
// путь histology/electronograms/images/clean/<basename>. Запуск с --dry
// показывает план, без — загружает. После загрузки запусти match_clean_em --sql
// и примени UPDATE'ы (imageCleanPath + has_clean_image).
//
// Запуск: node tools/histology/upload_clean_em.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = process.argv.includes("--dry");

// Тот же маппинг, что в match_clean_em.mjs: банк basename → чистый локальный файл.
const MAPPING = {
  "endoplazmaticheskaya-set-eps.png": "01-eps.jpg",
  "diktiosoma-kompleksa-goldzhi.png": "02-golgi-diktiosoma.png",
  "lizosomy-i-mitohondrii.png": "03-lizosomy-mitohondrii.jpg",
  "ostatochnoe-telce-i-vklyucheniya-lipidov.png": "04-ostatochnoe-telce-lipidy.jpg",
  "mitohondrii.png": "05-mitohondrii.png",
  "mikrovorsinki-epiteliocitov-kishechnika.png": "06-mikrovorsinki.png",
  "resnichka-zhgutik.png": "07-resnichka-zgutik.png",
  "fagocitoz-nejtrofilnym-lejkocitom-krovi.png": "08-fagocitoz-neytrofil.png",
  "pinocitoz-v-endotelialnyh-kletkah-kapillyara.png": "09-pinocitoz-endotelij.jpg",
  "yadro.png": "10-yadro.jpg",
  "apoptoz.png": "11-apoptoz.png",
  "yajcekletka.png": "12-yajcekletka.jpg",
  "spermatozoid.png": "13-spermatozoid.jpg",
  "eozinofilnyj-granulocit.png": "14-eozinofilnyj-granulocit.jpg",
  "sarkomer-i-sarkolemma.png": "15-sarkomer-sarkolemma.png",
  "vstavochnyj-disk-mezhdu-kardiomiocitami.png": "16-vstavochnyj-disk.png",
  "miokard-zheludochka-serdca.png": "17-miokard-skan.jpg",
  "uzlovoj-perehvat-ranve-v-nervnom-volokne-sedalischnogo-nerva.png": "19-uzlovoj-perehvat-ranve.png",
  "nervno-myshechnyj-sinaps.png": "em-nervno-myshechnyy-sinaps.jpg",
  "poperechnyj-srez-mielinovogo-nervnogo-volokna.png": "em-mielinovoe-volokno-poperechnyy.jpg",
};

const CLEAN_DIRS = [
  "public/library/lectures/gistologiya/elektronogrammy",
  "public/library/lectures/histology/hist-09-nervnaya-tkan/figs",
];

const env = {};
for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}
const token = env.UPSTASH_BLOB_TOKEN;
if (!token) throw new Error("нет UPSTASH_BLOB_TOKEN в .env.local");

const localIndex = new Map();
for (const dir of CLEAN_DIRS) {
  const full = path.join(REPO, dir);
  if (!fs.existsSync(full)) continue;
  for (const file of fs.readdirSync(full)) {
    if (!/\.(png|jpe?g)$/i.test(file)) continue;
    localIndex.set(file.toLowerCase(), path.join(REPO, dir, file));
  }
}

// MIME по расширению
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

// Файл-кандидаты для загрузки (путь в бакете → локальный путь)
const uploadPlan = [];
for (const [dbBase, localName] of Object.entries(MAPPING)) {
  const localPath = localIndex.get(localName.toLowerCase());
  if (!localPath || !fs.existsSync(localPath)) {
    console.log(`✗ локальный файл не найден: ${localName}`);
    continue;
  }
  // В бакете файлы электронограмм лежат под базовым именем без префикса папки.
  // В blob path: histology/electronograms/images/clean/<original .png name>
  const cleanExt = path.extname(localPath).toLowerCase();
  const blobKey = `histology/electronograms/images/clean/${dbBase.replace(/\.[a-z]+$/i, cleanExt)}`;
  uploadPlan.push({ blobKey, localPath, mime: MIME[path.extname(localPath).toLowerCase()] || "application/octet-stream" });
}

console.log(`к загрузке: ${uploadPlan.length} файлов`);
if (DRY) {
  for (const u of uploadPlan) console.log(`  [dry] ${u.blobKey} ← ${u.localPath}`);
  process.exit(0);
}

// Загрузка через Upstash Blob REST API (токен тот же, что у воркера).
let uploaded = 0, failed = 0;
for (const u of uploadPlan) {
  const body = fs.readFileSync(u.localPath);
  const url = `https://b8a4f9f853fa.blob.upstash.io/${u.blobKey}`;
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": u.mime,
      },
      body,
    });
    if (!response.ok) {
      console.log(`✗ ${u.blobKey}: ${response.status}`);
      failed += 1;
      continue;
    }
    uploaded += 1;
    console.log(`✓ ${u.blobKey} (${Math.round(body.length / 1024)} КБ)`);
  } catch (e) {
    console.log(`✗ ${u.blobKey}: ${e.message}`);
    failed += 1;
  }
}
console.log(`\nзагружено ${uploaded}, ошибок ${failed}`);
