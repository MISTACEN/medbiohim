// Генерирует SQL для проставления imageCleanUrl в preparation JSONB
// (электронограммы: чистые сканы без подписей для вопросов тренажёра).
// Запуск: node tools/histology/set_clean_urls.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = process.argv.includes("--dry");
const BASE = "https://medbiohim.vercel.app";

const MAPPING = {
  "endoplazmaticheskaya-set-eps.png": ["01-eps"],
  "diktiosoma-kompleksa-goldzhi.png": ["02-golgi-diktiosoma"],
  "lizosomy-i-mitohondrii.png": ["03-lizosomy-mitohondrii"],
  "ostatochnoe-telce-i-vklyucheniya-lipidov.png": ["04-ostatochnoe-telce-lipidy"],
  "mitohondrii.png": ["05-mitohondrii"],
  "mikrovorsinki-epiteliocitov-kishechnika.png": ["06-mikrovorsinki"],
  "resnichka-zhgutik.png": ["07-resnichka-zgutik"],
  "fagocitoz-nejtrofilnym-lejkocitom-krovi.png": ["08-fagocitoz-neytrofil"],
  "pinocitoz-v-endotelialnyh-kletkah-kapillyara.png": ["09-pinocitoz-endotelij"],
  "yadro.png": ["10-yadro"],
  "apoptoz.png": ["11-apoptoz"],
  "yajcekletka.png": ["12-yajcekletka"],
  "spermatozoid.png": ["13-spermatozoid"],
  "eozinofilnyj-granulocit.png": ["14-eozinofilnyj-granulocit"],
  "sarkomer-i-sarkolemma.png": ["15-sarkomer-sarkolemma"],
  "vstavochnyj-disk-mezhdu-kardiomiocitami.png": ["16-vstavochnyj-disk"],
  "miokard-zheludochka-serdca.png": ["17-miokard-skan"],
  "uzlovoj-perehvat-ranve-v-nervnom-volokne-sedalischnogo-nerva.png": ["19-uzlovoj-perehvat-ranve"],
  "nervno-myshechnyj-sinaps.png": ["em-nervno-myshechnyy-sinaps"],
  "poperechnyj-srez-mielinovogo-nervnogo-volokna.png": ["em-mielinovoe-volokno-poperechnyy"],
};

const CLEAN_DIRS = [
  "public/library/lectures/gistologiya/elektronogrammy",
  "public/library/lectures/histology/hist-09-nervnaya-tkan/figs",
];

// Найти фактический чистый файл (может быть .jpg или .png)
const found = new Map();
for (const dir of CLEAN_DIRS) {
  const full = path.join(REPO, dir);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full)) {
    if (!/\.(png|jpe?g)$/i.test(f)) continue;
    found.set(f.toLowerCase().replace(/\.[^.]+$/, ""), `${dir}/${f}`);
  }
}

const stmts = [];
let matched = 0;
for (const [dbBase, names] of Object.entries(MAPPING)) {
  const localName = names[0];
  const localPath = found.get(localName.toLowerCase());
  if (!localPath) {
    console.log(`✗ чистый файл не найден: ${localName}`);
    continue;
  }
  matched += 1;
  const cleanUrl = `${BASE}/${localPath.replace(/^public\//, "")}`;
  const dbBaseNoExt = dbBase.replace(/\.[^.]+$/, "");
  stmts.push(
    `UPDATE trainer_feed_cards SET preparation = jsonb_set(jsonb_set(preparation, '{imageCleanUrl}', to_jsonb('${cleanUrl}'::text), true), '{has_clean_image}', 'true'::jsonb, true) WHERE mode_set = 'electronogram' AND (preparation->>'imagePath') LIKE '%${dbBaseNoExt}%' AND is_published;`,
  );
}

const sqlFile = path.join(REPO, "database", "migrations", "20261115_clean_em_urls.sql");
fs.writeFileSync(sqlFile, stmts.join("\n\n") + "\n", "utf8");
console.log(`совпадений: ${matched}, SQL записан в ${sqlFile}`);

if (!DRY) {
  console.log("\nПрименяю через MCP apply_migration (или вручную).");
}
