/**
 * Генерация PWA/apple-иконок из исходного src/app/apple-icon.svg.
 *
 * Запускается вручную: `node scripts/make-icons.mjs`.
 * Зависимость sharp берётся из workers/api (уже в node_modules проекта),
 * поэтому отдельная установка не нужна.
 *
 * Почему PNG: Apple не рендерит SVG в apple-touch-icon, а Chrome требует
 * растровые PNG в манифесте (ошибка «resource isn't a valid image» из консоли).
 * ICO собирается вручную (заголовок + PNG-полотно внутри) — sharp ICO не пишет.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromWorkers = createRequire(path.join(root, "workers", "api", "package.json"));
const sharp = requireFromWorkers("sharp");

const SVG = path.join(root, "src", "app", "apple-icon.svg");
const PUBLIC = path.join(root, "public");
const SIZES = [180, 192, 512];

await mkdir(PUBLIC, { recursive: true });
const source = await readFile(SVG);

for (const size of SIZES) {
  await sharp(source)
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, `apple-icon-${size}.png`));
  await sharp(source)
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, `icon-${size}.png`));
  console.log(`icon ${size}×${size}: apple-icon-${size}.png + icon-${size}.png`);
}

// favicon.ico: контейнер ICO с PNG-полотном 32×32 (поддерживается всеми
// современными браузерами и не создаёт 404 /favicon.ico в консоли).
const png = await sharp(source).resize(32, 32).png().toBuffer();
const header = Buffer.alloc(6 + 16);
header.writeUInt16LE(0, 0); // резерв
header.writeUInt16LE(1, 2); // тип: ICO
header.writeUInt16LE(1, 4); // количество изображений
header.writeUInt8(32, 6); // ширина
header.writeUInt8(32, 7); // высота
header.writeUInt8(0, 8); // палитра
header.writeUInt8(0, 9); // резерв
header.writeUInt16LE(1, 10); // цветовые плоскости
header.writeUInt16LE(32, 12); // бит на пиксель
header.writeUInt32LE(png.length, 14); // размер полотна
header.writeUInt32LE(22, 18); // смещение полотна
await writeFile(path.join(PUBLIC, "favicon.ico"), Buffer.concat([header, png]));
console.log("favicon.ico 32×32");

// Статическая копия SVG для манифестов уже установленных PWA и ссылок,
// которые продолжают указывать на /apple-icon.svg.
await writeFile(path.join(PUBLIC, "apple-icon.svg"), source);
await writeFile(path.join(PUBLIC, "icon.svg"), source);
console.log("static copies: apple-icon.svg + icon.svg");
