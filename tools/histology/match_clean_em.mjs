// Сопоставление электронограмм банка (trainer_feed_cards, mode_set=electronogram)
// с ЧИСТЫМИ оригиналами без подписей (локальные папки lectures/elektronogrammy,
// study/img, figs hist-09/hist-10).
//
// Имена файлов банка (транслит) и локальных чистых файлов (номера «01-eps»)
// не совпадают алгоритмически, поэтому соответствие — явная карта ниже
// (проверено глазами по содержимому сканов).
//
// Запуск: node tools/histology/match_clean_em.mjs [--sql]
//   --sql — напечатать UPDATE для загрузки в БД (после заливки чистых файлов
//   в бакет histology/electronograms/images/clean/ — отдельное разрешение).
//
// Отчёт: сколько карточек имеют чистый аналог, каких не хватает.

import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");
const CLEAN_DIRS = [
  "public/library/lectures/gistologiya/elektronogrammy",
  "public/study/img",
  "public/library/lectures/histology/hist-09-nervnaya-tkan/figs",
];

/** Банк (basename в бакете) → чистый локальный файл. */
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

/** Все карточки банка, для которых чистого аналога в картах нет. */
const EXTRA_DB_NAMES = [
  "poperechnyj-srez-krovenosnogo-kapillyara.jpeg",
  "aerogematicheskij-barer.png",
  "dendrity-fotoreceptornyh-palochkovyh-nejronov-setchatki-glaz.png",
  "filtracionnyj-barer.png",
  "parietalnyj-ekzokrinocit-sobstvennyh-zhelez-zheludka.png",
  "poverhnost-mnogoryadnogo-resnitchatogo-epiteliya-skaniruyusc.png",
  "sosudistyj-klubochek-pochechnogo-telca.png",
  "sustentocit-semennogo-izvitogo-kanalca.png",
];

const dbNames = [...Object.keys(MAPPING), ...EXTRA_DB_NAMES];
const localIndex = new Map();
for (const dir of CLEAN_DIRS) {
  const full = path.join(REPO, dir);
  if (!fs.existsSync(full)) continue;
  for (const file of fs.readdirSync(full)) {
    if (!/\.(png|jpe?g)$/i.test(file)) continue;
    localIndex.set(file.toLowerCase(), path.posix.join(dir, file));
  }
}

const matched = [];
const missing = [];
for (const dbBase of dbNames) {
  const cleanName = MAPPING[dbBase];
  const localPath = cleanName ? localIndex.get(cleanName.toLowerCase()) : null;
  if (localPath) matched.push({ db: dbBase, clean: localPath });
  else missing.push(dbBase);
}

console.log(`Чистых аналогов найдено: ${matched.length} из ${dbNames.length} электронограмм банка`);
for (const m of matched) console.log(`  ✓ ${m.db} → ${m.clean}`);
if (missing.length) {
  console.log(`\nНе хватает чистых оригиналов (${missing.length}) — добрать из методички:`);
  for (const m of missing) console.log(`  ✗ ${m}`);
}

if (process.argv.includes("--sql")) {
  console.log("\n-- SQL для проставления imageCleanPath (после заливки файлов в бакет clean/):");
  for (const m of matched) {
    const cleanKey = `electronograms/images/clean/${path.basename(m.clean)}`;
    const base = path.basename(m.db);
    console.log(
      `update trainer_feed_cards set preparation = jsonb_set(jsonb_set(preparation, '{imageCleanPath}', to_jsonb('${cleanKey}'::text), true), '{has_clean_image}', 'true'::jsonb, true) where mode_set='electronogram' and (preparation->>'imagePath') like '%/${base}' and is_published;`,
    );
  }
}
