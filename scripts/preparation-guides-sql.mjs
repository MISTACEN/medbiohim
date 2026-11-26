/**
 * Генератор миграции методических карточек микропрепаратов.
 *
 * Источник данных — `src/data/histology-preparations.json` (сид из программы
 * первого диагностикума). Скрипт печатает SQL в stdout, поэтому миграцию можно
 * пересобрать после правки контента:
 *
 *   node scripts/preparation-guides-sql.mjs > database/migrations/20261120_preparation_guides.sql
 *
 * Ключ гида — `id` препарата из JSON. Он же используется нормализатором
 * `preparationKey()` в `src/lib/histologyAtlas.ts`, поэтому карточка банка и
 * гид находят друг друга по названию препарата, без хранения uuid карточек.
 */

import { readFile } from "node:fs/promises";

const SOURCE = "src/data/histology-preparations.json";

/** Словарь диагностических структур: слаг → подпись и тип. */
const STRUCTURES = [
  ["nucleus", "Ядро", "cell"],
  ["nucleolus", "Ядрышко", "cell"],
  ["chromosomes", "Хромосомы", "cell"],
  ["mitotic-figures", "Фигуры митоза", "structure"],
  ["fat-droplets", "Жировые включения", "inclusion"],
  ["glycogen", "Гликоген", "inclusion"],
  ["pigment", "Пигмент", "inclusion"],
  ["secretory-granules", "Секреторные гранулы", "inclusion"],
  ["cilia", "Реснички", "structure"],
  ["goblet-cells", "Бокаловидные клетки", "cell"],
  ["microvilli-brush-border", "Щёточная кайма", "structure"],
  ["keratinized-layers", "Слои эпителия", "layer"],
  ["basement-membrane", "Базальная мембрана", "layer"],
  ["urothelium-dome-cells", "Покровные клетки уротелия", "cell"],
  ["smooth-muscle", "Гладкая мышечная ткань", "structure"],
  ["skeletal-muscle", "Поперечнополосатая мышечная ткань", "structure"],
  ["striation", "Поперечная исчерченность", "structure"],
  ["erythrocytes", "Эритроциты", "cell"],
  ["leukocytes", "Лейкоциты", "cell"],
  ["platelets", "Тромбоциты", "cell"],
  ["chondrocytes", "Хондроциты", "cell"],
  ["isogenous-groups", "Изогенные группы", "structure"],
  ["elastic-fibers", "Эластические волокна", "structure"],
  ["collagen-fibers", "Коллагеновые волокна", "structure"],
  ["tendon-bundles", "Пучки сухожилия", "structure"],
  ["osteon", "Остеон", "structure"],
  ["haversian-canal", "Гаверсов канал", "structure"],
  ["osteocytes", "Остеоциты", "cell"],
  ["bone-trabeculae", "Костные трабекулы", "structure"],
  ["astrocytes", "Астроциты", "cell"],
  ["myelin-sheath", "Миелиновая оболочка", "structure"],
  ["node-of-ranvier", "Перехват Ранвье", "structure"],
  ["lamellar-corpuscle", "Пластинчатое тельце", "structure"],
  ["oocyte", "Ооцит", "cell"],
  ["zona-pellucida", "Блестящая зона", "layer"],
  ["spermatozoa", "Сперматозоиды", "cell"],
  ["acrosome", "Акросома", "structure"],
  // Осевые органы: добавлены вместе с 19-й методичкой первой диагностики.
  ["neural-tube", "Нервная трубка", "structure"],
  ["notochord", "Хорда", "structure"],
  ["somites", "Сомиты", "structure"],
];

const q = (value) => "'" + String(value ?? "").replace(/'/g, "''") + "'";
const jsonb = (value) => q(JSON.stringify(Array.isArray(value) ? value : [])) + "::jsonb";
const textArray = (values) =>
  "ARRAY[" + (Array.isArray(values) && values.length ? values.map(q).join(", ") : "") + "]::text[]";
const difficulty = (value) => Math.min(3, Math.max(1, Number(value) || 1));

const data = JSON.parse(await readFile(SOURCE, "utf8"));

const out = [];
out.push(`-- Методические карточки микропрепаратов (первый диагностикум).
-- Сгенерировано: node scripts/preparation-guides-sql.mjs
-- Сид: ${SOURCE}; ключ гида = id препарата, см. preparationKey() в src/lib/histologyAtlas.ts.
-- Файл идемпотентен: DDL через IF NOT EXISTS, данные — через ON CONFLICT.

create table if not exists public.preparation_structures (
  slug        text primary key,
  title       text not null,
  kind        text not null default 'structure'
              check (kind in ('cell', 'structure', 'inclusion', 'layer')),
  sort_order  integer not null default 100
);

create table if not exists public.preparation_guides (
  key                 text primary key,
  name                text not null,
  section             text not null default '',
  system              text not null default '',
  organ               text not null default '',
  tissue              text not null default '',
  stain               text not null default '',
  difficulty          smallint not null default 1 check (difficulty between 1 and 3),
  low_magnification   text not null default '',
  high_magnification  text not null default '',
  steps               jsonb not null default '[]'::jsonb,
  features            jsonb not null default '[]'::jsonb,
  inclusions          jsonb not null default '[]'::jsonb,
  differential        jsonb not null default '[]'::jsonb,
  mistakes            jsonb not null default '[]'::jsonb,
  structures          text[] not null default '{}',
  sources             jsonb not null default '[]'::jsonb,
  updated_at          timestamptz not null default now()
);

alter table public.preparation_structures enable row level security;
alter table public.preparation_guides enable row level security;

-- Читать методички может любой авторизованный студент; писать — только
-- сервисная роль (админ-редактор), у неё RLS обходится штатно.
drop policy if exists preparation_structures_read on public.preparation_structures;
create policy preparation_structures_read on public.preparation_structures
  for select to authenticated using (true);

drop policy if exists preparation_guides_read on public.preparation_guides;
create policy preparation_guides_read on public.preparation_guides
  for select to authenticated using (true);

grant select on public.preparation_structures to authenticated;
grant select on public.preparation_guides to authenticated;

comment on table public.preparation_guides is
  'Методическая карточка микропрепарата: как искать структуры, признаки, дифференциал. Ключ = id препарата из программы диагностикума.';

insert into public.preparation_structures (slug, title, kind, sort_order) values`);

out.push(
  STRUCTURES.map(
    ([slug, title, kind], index) => `  (${q(slug)}, ${q(title)}, ${q(kind)}, ${(index + 1) * 10})`,
  ).join(",\n") + "\non conflict (slug) do update set title = excluded.title, kind = excluded.kind, sort_order = excluded.sort_order;\n",
);

out.push("insert into public.preparation_guides as g\n  (key, name, section, system, organ, tissue, stain, difficulty, low_magnification, high_magnification, steps, features, inclusions, differential, mistakes, structures, sources)\nvalues");

out.push(
  data
    .map((item) => {
      const columns = [
        q(item.id),
        q(item.name),
        q(item.section),
        q(item.system || String(item.section || "").replace(/^\d+\.\s*/, "")),
        q(item.organ),
        q(item.tissue_type),
        q(item.stain),
        String(difficulty(item.difficulty_level)),
        q(item.low_magnification),
        q(item.high_magnification),
        jsonb(item.steps),
        jsonb(item.diagnostic_features),
        jsonb(item.inclusions),
        jsonb([item.differentiation].filter(Boolean)),
        jsonb([item.common_mistakes].filter(Boolean)),
        textArray(item.structures),
        jsonb(item.sources),
      ];
      return "  (" + columns.join(", ") + ")";
    })
    .join(",\n"),
);

out.push(`on conflict (key) do update set
  name = excluded.name,
  section = excluded.section,
  system = excluded.system,
  organ = excluded.organ,
  tissue = excluded.tissue,
  stain = excluded.stain,
  difficulty = excluded.difficulty,
  low_magnification = excluded.low_magnification,
  high_magnification = excluded.high_magnification,
  steps = excluded.steps,
  features = excluded.features,
  inclusions = excluded.inclusions,
  differential = excluded.differential,
  mistakes = excluded.mistakes,
  structures = excluded.structures,
  sources = excluded.sources,
  updated_at = now();
`);

process.stdout.write(out.join("\n"));
