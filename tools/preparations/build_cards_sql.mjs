/**
 * Готовит SQL для 30 дополнительных карточек препаратов.
 *
 *   node tools/preparations/build_cards_sql.mjs
 *
 * Карточки — дополнение к существующим: имя препарата совпадает, поэтому в
 * тренажёре появляются новые снимки того же препарата. Картинка отдаётся
 * статикой Vercel по preparation.imageStatic, Worker для них не нужен.
 * SQL печатается в файл data/preparations-bonus-cards-2026-11.sql и не
 * выполняется автоматически.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, "data/preparations-bonus-2026-11.processed.json"), "utf8"),
);

const SUBJECT_ID = "977d78ca-7a58-4b0a-9e93-29d8e03f6946";
const BASE = "/library/lectures/gistologiya/preparaty-bonus";

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonSql(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

const rows = [];
for (const preparation of manifest.preparations) {
  const micro = preparation.images.filter((image) => image.role === "micro");
  for (const [index, image] of micro.entries()) {
    const n = String(index + 1).padStart(2, "0");
    const id = `feed-prep-bonus-${preparation.slug}-${n}`;
    const imageStatic = `${BASE}/${preparation.slug}/${image.file.split("/").pop()}`;
    const preparationJson = {
      name: preparation.name,
      organ: preparation.name,
      captions: preparation.stain ? [`Окраска: ${preparation.stain}`, "Дополнительный снимок"] : ["Дополнительный снимок"],
      imageStatic,
      bonus: true,
    };
    rows.push({
      id,
      subject_id: SUBJECT_ID,
      subject_slug: "histology",
      specialty_slug: "mbh",
      mode_set: "preparation",
      preparation: jsonSql(preparationJson),
      tags: jsonSql(["preparation", "identify", "mbh", "bonus"]),
      source_key: `histology-bonus-${preparation.slug}-${n}`,
    });
  }
}

const values = rows
  .map(
    (row) =>
      `(${sqlString(row.id)}, ${sqlString(row.subject_id)}::uuid, ${sqlString(row.subject_slug)}, ${sqlString(row.specialty_slug)}, ${sqlString(row.mode_set)}, ${row.preparation}, '[]'::jsonb, '{}'::jsonb, ${row.tags}, true, ${sqlString(row.source_key)})`,
  )
  .join(",\n  ");

const sql = `-- Дополнительные снимки препаратов (сгенерировано tools/preparations/build_cards_sql.mjs)
insert into public.trainer_feed_cards
  (id, subject_id, subject_slug, specialty_slug, mode_set, preparation, hotspots, question, tags, is_published, source_key)
values
  ${values}
on conflict (id) do update set
  preparation = excluded.preparation,
  tags = excluded.tags,
  is_published = excluded.is_published,
  source_key = excluded.source_key,
  updated_at = now();
`;

writeFileSync(resolve(ROOT, "data/preparations-bonus-cards-2026-11.sql"), sql);
console.log(`карточек: ${rows.length}, файл: data/preparations-bonus-cards-2026-11.sql (${sql.length} символов)`);
