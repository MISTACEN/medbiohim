// Переносит планы кафедры (оптика, теория вероятностей, информатика) из
// статических JSON в site_content, чтобы страница плана читала недели из БД и
// правка плана не требовала деплоя.
//
// Источник — уже выровненные по расписанию файлы public/content/chem/*.json
// (после tools/chem/sync_stand_plans.mjs). Плоские списки lectures/practicals/
// labs превращаются в weeks: одна запись = одно занятие, поэтому страница
// показывает их тем же нормализатором, что и планы из API.
//
// Запуск: node tools/chem/seed_plan_weeks.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = process.argv.includes("--dry");

const PLANS = [
  { slug: "optics", file: "public/content/chem/plan-optics-2025-2026.json" },
  { slug: "probability", file: "public/content/chem/plan-probability-2025-2026.json" },
  { slug: "informatics", file: "public/content/chem/plan-informatics-2025-2026.json" },
];

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function buildWeeks(plan) {
  const entries = [];
  for (const lecture of plan.lectures || []) {
    entries.push({ kind: "lecture", date: lecture.date, title: String(lecture.title || "").trim() });
  }
  for (const practical of plan.practicals || []) {
    entries.push({ kind: "practice", date: practical.date, title: String(practical.title || "").trim() });
  }
  for (const lab of plan.labs || []) {
    const title = typeof lab === "string" ? lab : String(lab.title || "");
    const date = typeof lab === "string" ? null : lab.date || null;
    entries.push({ kind: "lab", date, title: title.trim() });
  }
  return entries
    .filter((entry) => entry.title)
    .sort((a, b) => String(a.date || "9999-12-31").localeCompare(String(b.date || "9999-12-31")))
    .map((entry, index) => {
      const week = { week: index + 1, date: entry.date || null };
      if (entry.kind === "lecture") return { ...week, lecture: entry.title };
      if (entry.kind === "practice") return { ...week, practice: entry.title };
      // Лабораторная работа: заголовок занятия + работа практикума в блоке.
      return { ...week, practice: entry.title, laboratory: [entry.title] };
    });
}

function buildPayload(plan) {
  const weeks = buildWeeks(plan);
  return {
    subject: plan.subject,
    subject_slug: plan.slug,
    slug: plan.slug,
    course: plan.course,
    semester: plan.semester,
    year: plan.year,
    audience: plan.audience,
    departments: plan.departments,
    note: plan.note,
    lectures_hours: plan.lectures_hours ?? null,
    labs_hours: plan.labs_hours ?? null,
    total: plan.total ?? null,
    controls: Array.isArray(plan.controls) ? plan.controls : [],
    weeks,
  };
}

const payloads = PLANS.map(({ slug, file }) => {
  const plan = JSON.parse(fs.readFileSync(path.join(REPO, file), "utf8"));
  const payload = buildPayload(plan);
  return { slug, key: `subject_plan:${slug}`, payload };
});

for (const { slug, payload } of payloads) {
  const kinds = payload.weeks.reduce((acc, week) => {
    const kind = week.lecture ? "lecture" : week.laboratory ? "lab" : "practice";
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, {});
  const dates = payload.weeks.map((week) => week.date);
  console.log(
    `${slug}: недель ${payload.weeks.length} (лекции ${kinds.lecture || 0}, практики ${kinds.practice || 0}, лабораторные ${kinds.lab || 0}); ${dates[0]} – ${dates.at(-1)}; ${payload.year}`,
  );
}

if (DRY) {
  console.log("(dry) в site_content ничего не записано");
  console.log(JSON.stringify(payloads[0].payload.weeks.slice(0, 3), null, 2));
  process.exit(0);
}

const env = loadEnv();
const client = new pg.Client({
  connectionString: env.DB_URL.replace(/\?sslmode=\w+/, ""),
  ssl: { rejectUnauthorized: false },
});
client.on("error", () => {});
await client.connect();

for (const { key, payload } of payloads) {
  await client.query(
    `insert into public.site_content (key, payload, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (key) do update set payload = excluded.payload, updated_at = now()`,
    [key, JSON.stringify(payload)],
  );
  console.log(`записано ${key}`);
}

await client.end();
