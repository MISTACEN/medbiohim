#!/usr/bin/env node
/**
 * PPTX → HTML-лекции для портала: слайды → секции (заголовок + текст + картинки).
 *
 * Картинки из ppt/media копируются в public/content/lectures-assets/<id>/ и
 * вставляются после текста слайда. Форматы EMF/WMF браузер не показывает — пропускаются.
 *
 *   node scripts/build-pptx-lectures.mjs <config.json> <target.json>
 *
 * Конфиг — массив { file, id, title }.
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const CFG_PATH = process.argv[2];
const TARGET = process.argv[3];
if (!CFG_PATH || !TARGET) {
  console.error("usage: node build-pptx-lectures.mjs <config.json> <target.json>");
  process.exit(2);
}
const ASSETS_DIR = "public/content/lectures-assets";
const BAD_IMAGE_EXT = new Set([".emf", ".wmf"]);

const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const lectures = fs.existsSync(TARGET)
  ? JSON.parse(fs.readFileSync(TARGET, "utf8"))
  : { subject: "Лекции", items: [], stats: {} };
lectures.items ??= [];

const config = JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));

for (const entry of config) {
  if (!fs.existsSync(entry.file)) {
    console.log(`пропуск (нет файла): ${entry.file}`);
    continue;
  }
  const zip = await JSZip.loadAsync(fs.readFileSync(entry.file));
  const slideNames = [...Object.keys(zip.files)]
    .map((name) => name.match(/^ppt\/slides\/slide(\d+)\.xml$/))
    .filter(Boolean)
    .sort((a, b) => Number(a[1]) - Number(b[1]));

  const out = [];
  let imageCount = 0;
  for (const [, name] of slideNames.entries()) {
    const slideXml = await zip.file(name[0]).async("string");
    const slideNum = Number(name[1]);

    // текст слайда: параграфы (a:p) в порядке следования
    const paragraphs = [...slideXml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)].map((m) =>
      [...m[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)]
        .map((t) => t[1])
        .join("")
        .replace(/\s+/g, " ")
        .trim(),
    ).filter(Boolean);

    const heading = paragraphs[0]?.replace(/^\d+[.\s]*/, "").slice(0, 100) || `Слайд ${slideNum}`;
    const body = paragraphs.slice(1);
    out.push(`<h2>${escapeHtml(heading)}</h2>`);
    for (const line of body) out.push(`<p>${escapeHtml(line)}</p>`);

    // картинки слайда через rels
    const relPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    const rels = zip.file(relPath);
    if (rels) {
      const relXml = await rels.async("string");
      for (const rel of relXml.matchAll(/Target="\.\.\/media\/([^"]+)"/g)) {
        const mediaName = rel[1];
        const ext = path.extname(mediaName).toLowerCase();
        if (BAD_IMAGE_EXT.has(ext)) continue;
        const mediaFile = zip.file(`ppt/media/${mediaName}`);
        if (!mediaFile) continue;
        const assetId = `${entry.id}/slide${slideNum}-${mediaName}`;
        const assetPath = path.join(ASSETS_DIR, assetId);
        fs.mkdirSync(path.dirname(assetPath), { recursive: true });
        fs.writeFileSync(assetPath, await mediaFile.async("nodebuffer"));
        out.push(`<p><img src="/content/lectures-assets/${assetId}" alt="Слайд ${slideNum}: ${escapeHtml(heading)}" loading="lazy" style="max-width:100%" /></p>`);
        imageCount += 1;
      }
    }
  }

  const html = out.join("\n");
  const item = { id: entry.id, title: entry.title, html };
  const index = lectures.items.findIndex((existing) => existing.id === entry.id);
  if (index >= 0) lectures.items[index] = item;
  else lectures.items.push(item);
  console.log(`${entry.id}: ${slideNames.length} слайдов, ${imageCount} картинок, ${html.length} символов HTML`);
}

lectures.stats = { ...(lectures.stats ?? {}), lectures: lectures.items.length };
fs.writeFileSync(TARGET, `${JSON.stringify(lectures, null, 1)}\n`);
console.log(`записано: ${TARGET} (${lectures.items.length} лекций)`);
