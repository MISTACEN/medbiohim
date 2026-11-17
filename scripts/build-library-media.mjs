#!/usr/bin/env node
/**
 * docs/media-upload-manifest.json → public/content/library-media.json
 *
 * Облачная медиа-библиотека (Backblaze B2, бакет medbiohim-files):
 * метаданные файлов для вкладки «Облако» на /library и allowlist ключей
 * для подписанных ссылок /api/media/<key>.
 *
 *   node scripts/build-library-media.mjs
 */
import fs from "node:fs";

const MANIFEST = "docs/media-upload-manifest.json";
const TARGET = "public/content/library-media.json";

const HUMAN = {
  "library/histology/gistologiya-vvodnaya-citologiya.mp4": {
    title: "Гистология. Вводная. Цитология",
    type: "Видео-лекция",
    subject: "Гистология",
    subject_slug: "histology",
  },
  "library/histology/gistologiya-soedinitelnye-tkani-krov.mp4": {
    title: "Гистология. Соединительные ткани. Кровь",
    type: "Видео-лекция",
    subject: "Гистология",
    subject_slug: "histology",
  },
  "library/histology/uchebnik-gistologiya-citologiya-i-embriologiya-yu-i-afanasev.pdf": {
    title: "Гистология, цитология и эмбриология — Ю.И. Афанасьев",
    type: "PDF · учебник",
    subject: "Гистология",
    subject_slug: "histology",
  },
  "library/histology/atlas-po-gistologii-s-l-kuznecov.pdf": {
    title: "Атлас по гистологии — С.Л. Кузнецов",
    type: "PDF · атлас",
    subject: "Гистология",
    subject_slug: "histology",
  },
  "library/histology/citol-i-embr-dlya-samopodgotovki-2024-g.docx": {
    title: "Цитология и эмбриология для самоподготовки (2024)",
    type: "Word · методичка",
    subject: "Гистология",
    subject_slug: "histology",
  },
  "library/chemistry/himiya.zip": {
    title: "Химия: сборники тестов и лекций (сканы)",
    type: "ZIP · архив сканов",
    subject: "Химия",
    subject_slug: "chemistry_organic_physical",
  },
  "library/physiology/fiziologia-cheloveka-v-skhemakh-i-tablitsakh-2017-avtory-brin-v.pdf": {
    title: "Физиология человека в схемах и таблицах — В. Брин (2017)",
    type: "PDF · учебник",
    subject: "Физиология",
    subject_slug: "physiology",
  },
  "library/physiology/atlas-po-normalnoy-fiziologii-chesnokov.pdf": {
    title: "Атлас по нормальной физиологии — Чесноков",
    type: "PDF · атлас",
    subject: "Физиология",
    subject_slug: "physiology",
  },
  "library/physiology/sudakov-k-v-normalnaya-fiziologia.pdf": {
    title: "Нормальная физиология — К.В. Судаков",
    type: "PDF · учебник",
    subject: "Физиология",
    subject_slug: "physiology",
  },
  "library/misc/course.rar": {
    title: "Архив старой версии сайта",
    type: "RAR · архив",
    subject: "Прочее",
    subject_slug: "misc",
  },
  "library/misc/zadachi.pdf": {
    title: "Задачник (сборник задач)",
    type: "PDF · задачи",
    subject: "Прочее",
    subject_slug: "misc",
  },
};

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const items = [];
for (const entry of manifest.entries ?? []) {
  const key = entry.object_key;
  const meta = HUMAN[key] ?? {
    title: entry.relative.replace(/\.[a-z0-9]+$/i, ""),
    type: "Файл",
    subject: "Прочее",
    subject_slug: "misc",
  };
  items.push({
    key,
    title: meta.title,
    type: meta.type,
    subject: meta.subject,
    subject_slug: meta.subject_slug,
    mime: entry.mime_type,
    size_bytes: entry.size_bytes,
    sha256: entry.sha256,
  });
}

items.sort((a, b) => a.subject.localeCompare(b.subject, "ru") || a.title.localeCompare(b.title, "ru"));
const data = { generated_at: manifest.generated_at, count: items.length, items };
fs.writeFileSync(TARGET, `${JSON.stringify(data, null, 1)}\n`);
console.log(`записано: ${TARGET} (${items.length} файлов)`);
for (const item of items) console.log(`  ${item.key} | ${item.title}`);
