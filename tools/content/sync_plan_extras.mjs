// Дополнение планов в site_content тем, что раньше терялось при переносе:
// лабораторными работами занятий (laboratory) и контрольными точками
// (control у занятия + массив controls в payload).
//
// Страница плана читает недели из API, а нормализатор понимает ровно эти поля.
// Источник — статические планы кафедры в public/content, поэтому после синка
// БД и статика дают одинаковую вкладку «План».
//
// Запуск: node tools/content/sync_plan_extras.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = process.argv.includes("--dry");

const PLANS = [
  { slug: "histology", file: "public/content/histology/plan-semester3-2026-2027.json", mode: "weeks" },
  { slug: "physiology", file: "public/content/physiology/plan-semester3-2026-2027.json", mode: "flat" },
  { slug: "organic_chemistry", file: "public/content/chem/plan-organic-2025-2026.json", mode: "flat" },
];

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) env[m[1]] = m[2];
  }
  return env;
}

const text = (value) => (typeof value === "string" ? value.trim() : value && typeof value === "object" ? String(value.title || "").trim() : "");

/** Контрольная точка из статического плана → shape, который читает normalizeApiPlan. */
function mapControl(raw) {
  return {
    n: Number(raw?.n) || undefined,
    date: raw?.date || null,
    title: text(raw),
    covers: Array.isArray(raw?.covers) ? raw.covers.map(String) : [],
    prep_href: raw?.prep_href || null,
    prep_note: raw?.prep_note || null,
  };
}

function enrich(slug, payload, plan, mode) {
  const weeks = Array.isArray(payload.weeks) ? payload.weeks : [];
  const byDate = new Map();
  const byNum = new Map();
  for (const week of weeks) {
    if (week?.date) byDate.set(String(week.date), week);
    if (week?.n != null) byNum.set(Number(week.n), week);
  }

  let labsAdded = 0;
  let controlsAdded = 0;

  const applyLab = (week, title) => {
    if (!week || !title) return;
    const list = Array.isArray(week.laboratory) ? [...week.laboratory] : [];
    if (!list.includes(title)) {
      list.push(title);
      labsAdded += 1;
    }
    week.laboratory = list;
  };

  const applyControl = (week, title) => {
    if (!week || !title) return;
    if (week.control !== title) {
      week.control = title;
      controlsAdded += 1;
    }
  };

  if (mode === "weeks") {
    for (const week of plan.weeks || []) {
      const target = byNum.get(Number(week.num)) || byDate.get(String(week.date));
      const labTitle = text(week.lab);
      if (labTitle) applyLab(target, labTitle);
      const controlTitle = text(week.control);
      if (controlTitle) applyControl(target, controlTitle);
    }
    const controls = (plan.controls || []).map(mapControl).filter((c) => c.title);
    if (controls.length) payload.controls = controls;
  } else {
    const controls = (plan.controls || []).map(mapControl).filter((c) => c.title);
    for (const control of controls) {
      applyControl(byDate.get(String(control.date)), control.title);
    }
    for (const lab of plan.labs || []) {
      applyLab(byDate.get(String(lab.date)), text(lab));
    }
    payload.controls = controls;
  }

  return { weeks: weeks.length, labsAdded, controlsAdded, controls: (payload.controls || []).length };
}

async function main() {
  const env = loadEnv();
  const client = new pg.Client({ connectionString: env.DB_URL.replace(/\?sslmode=\w+/, ""), ssl: { rejectUnauthorized: false } });
  client.on("error", () => {});
  await client.connect();

  for (const plan of PLANS) {
    const source = JSON.parse(fs.readFileSync(path.join(REPO, plan.file), "utf8"));
    const key = `subject_plan:${plan.slug}`;
    const row = await client.query("select payload from public.site_content where key = $1", [key]);
    if (!row.rows.length) {
      console.log(`${plan.slug}: нет ${key} — пропуск`);
      continue;
    }
    const payload = row.rows[0].payload;
    const stats = enrich(plan.slug, payload, source, plan.mode);
    console.log(
      `${plan.slug}: недель ${stats.weeks}, лабораторных +${stats.labsAdded}, контрольных на занятиях +${stats.controlsAdded}, controls: ${stats.controls}`,
    );
    if (!DRY) {
      await client.query("update public.site_content set payload = $2::jsonb, updated_at = now() where key = $1", [
        key,
        JSON.stringify(payload),
      ]);
    }
  }

  await client.end();
  if (DRY) console.log("(dry) изменения не записаны");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
