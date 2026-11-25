/**
 * Обработка фото «препараты бонус» → файлы для карточек препаратов.
 *
 *   node tools/preparations/process_bonus_photos.mjs
 *
 * Что делает с кадрами «в окуляр»:
 * 1. находит светлое круглое поле (порог по яркости на уменьшенной копии);
 * 2. обрезает квадрат по bounding box поля с небольшим запасом;
 * 3. вырезает круг с мягким краем и кладёт на белый фон — углы не мешают;
 * 4. нормализует яркость/контраст и жмёт до 1200 px.
 *
 * Фото этикеток не обрезаются по кругу: они остаются снимком стекла.
 * Ничего не загружает в storage и не пишет в БД.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "../..");
const MAPPING = resolve(ROOT, "data/preparations-bonus-2026-11.json");
const OUT_ROOT = resolve(ROOT, "public/library/lectures/gistologiya/preparaty-bonus");
const TARGET = 1200;

const mapping = JSON.parse(readFileSync(MAPPING, "utf8"));

/**
 * Квадрат по центру кадра: окулярное поле снято примерно по центру, а
 * автоматическое определение круга на смазанных кадрах промахивается.
 */
function centerSquare(meta) {
  const side = Math.min(meta.width, meta.height);
  return {
    left: Math.round((meta.width - side) / 2),
    top: Math.round((meta.height - side) / 2),
    width: side,
    height: side,
  };
}

async function processShot(source, target) {
  const meta = await sharp(source).metadata();
  const crop = centerSquare(meta);
  const square = crop.width;

  // Круг не вырезаем: окулярное поле на тёмном фоне — это честный вид препарата.
  await sharp(source)
    .extract({ left: crop.left, top: crop.top, width: square, height: square })
    .resize(TARGET, TARGET, { fit: "cover" })
    .normalise({ lower: 1, upper: 99 })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(target);

  const stats = await sharp(target).stats();
  const brightness = Math.round(
    stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3,
  );
  return { cropped: true, brightness, size: await sharp(target).metadata() };
}

async function processLabel(source, target) {
  await sharp(source)
    .resize({ width: TARGET, withoutEnlargement: true })
    .normalise({ lower: 1, upper: 99 })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(target);
  return { cropped: false, brightness: null, size: await sharp(target).metadata() };
}

const processed = [];
for (const item of mapping.mapped) {
  const dir = resolve(OUT_ROOT, item.slug);
  mkdirSync(dir, { recursive: true });
  const images = [];

  const labelTarget = resolve(dir, "label.jpg");
  const label = await processLabel(resolve(mapping.source, item.labelPhoto), labelTarget);
  images.push({ role: "label", file: `${item.slug}/label.jpg`, ...label });

  for (const [index, shot] of item.shots.entries()) {
    const name = `shot-${String(index + 1).padStart(2, "0")}.jpg`;
    const target = resolve(dir, name);
    const result = await processShot(resolve(mapping.source, shot), target);
    images.push({ role: "micro", file: `${item.slug}/${name}`, source: shot, ...result });
  }

  processed.push({
    exam: item.exam,
    slug: item.slug,
    name: item.name,
    stain: item.stain,
    images,
  });
  console.log(`${item.slug}: ${images.length} файлов`);
}

const manifest = {
  source: mapping.source,
  generated: new Date().toISOString().slice(0, 10),
  outRoot: "public/library/lectures/gistologiya/preparaty-bonus",
  targetSize: TARGET,
  preparations: processed,
  totals: {
    preparations: processed.length,
    files: processed.reduce((sum, item) => sum + item.images.length, 0),
    micro: processed.reduce((sum, item) => sum + item.images.filter((i) => i.role === "micro").length, 0),
  },
};
writeFileSync(resolve(ROOT, "data/preparations-bonus-2026-11.processed.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`итого: препаратов ${manifest.totals.preparations}, файлов ${manifest.totals.files}`);
void dirname;
