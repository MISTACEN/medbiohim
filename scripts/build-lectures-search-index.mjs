#!/usr/bin/env node
/**
 * lectures-*.json → public/content/lectures-search-index.json
 *
 * Лёгкий индекс (только id/set/название/ссылка) для поиска конспектов на /search —
 * без тяжёлых HTML-тел, полные наборы грузятся только на странице предмета.
 *
 *   node scripts/build-lectures-search-index.mjs
 */
import fs from "node:fs";

const SETS = [
  { file: "lectures-chem.json", setId: "chem", href: "/subjects/organic_chemistry?tab=portal" },
  { file: "lectures-chem-organic.json", setId: "chem-organic", href: "/subjects/organic_chemistry?tab=portal" },
  { file: "lectures-bio.json", setId: "bio", href: "/subjects/biology?tab=portal" },
  { file: "lectures-math.json", setId: "math", href: "/subjects/math?tab=portal" },
  { file: "lectures-phys.json", setId: "phys", href: "/subjects/physics?tab=portal" },
  { file: "lectures-history.json", setId: "history", href: "/subjects/history?tab=portal" },
  { file: "lectures-latin.json", setId: "latin", href: "/latin" },
  { file: "lectures-english.json", setId: "english", href: "/english" },
];

const SUBJECT_LABELS = {
  chem: "Химия",
  "chem-organic": "Органическая химия",
  bio: "Биология",
  math: "Математика",
  phys: "Физика",
  history: "История",
  latin: "Латынь",
  english: "Английский",
};

const items = [];
for (const set of SETS) {
  const file = `public/content/portals/${set.file}`;
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const item of data.items ?? []) {
    items.push({
      id: `${set.setId}:${item.id}`,
      setId: set.setId,
      subject: SUBJECT_LABELS[set.setId] ?? set.setId,
      title: item.title,
      href: set.href,
    });
  }
}

items.sort((a, b) => a.subject.localeCompare(b.subject, "ru") || a.title.localeCompare(b.title, "ru"));
const data = { count: items.length, items };
fs.writeFileSync("public/content/lectures-search-index.json", `${JSON.stringify(data, null, 1)}\n`);
console.log(`записано: public/content/lectures-search-index.json (${items.length} конспектов)`);
