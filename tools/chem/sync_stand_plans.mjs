// Выравнивание планов кафедры (оптика, теория вероятностей, информатика) по
// активному расписанию 2026/2027.
//
// Планы собраны со стенда: в файлах стоит прошлогодняя недельная сетка
// (2025/2026), а занятия по расписанию МБХ-201 идут в другие дни. Скрипт
// расставляет даты по фактическим парам активного расписания:
//   оптика:        лекции — 10:40, практикум — 12:50 (12 практик + 7 лабораторных);
//   вероятность:   лекции — 10:40, практики — 12:50;
//   информатика:   практики — субботние пары 08:00.
// Содержание (темы, часы, контрольные) не меняется — только даты, год и note.
//
// Запуск: node tools/chem/sync_stand_plans.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = process.argv.includes("--dry");

const PLANS = [
  {
    slug: "optics",
    file: "public/content/chem/plan-optics-2025-2026.json",
    match: "%оптик%",
    lectureSlot: "10:40",
    practiceSlot: "12:50",
    labs: true,
  },
  {
    slug: "probability",
    file: "public/content/chem/plan-probability-2025-2026.json",
    match: "%вероят%",
    lectureSlot: "10:40",
    practiceSlot: "12:50",
    labs: false,
  },
  {
    slug: "informatics",
    file: "public/content/chem/plan-informatics-2025-2026.json",
    match: "%информат%",
    lectureSlot: null,
    practiceSlot: "08:00",
    labs: false,
  },
];

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const client = new pg.Client({
  connectionString: env.DB_URL.replace(/\?sslmode=\w+/, ""),
  ssl: { rejectUnauthorized: false },
});
client.on("error", () => {});
await client.connect();

const meta = await client.query(
  `select s.version, s.academic_year
   from public.schedules s
   where s.is_active = true
   order by s.version desc
   limit 1`,
);
const version = meta.rows[0]?.version ?? null;
const year = meta.rows[0]?.academic_year ?? "2026/2027";
console.log(`активное расписание: v${version} ${year}`);

async function datesFor(match, slot) {
  if (!slot) return [];
  // Дата берётся текстом из SQL: pg отдаёт DATE как Date в локальной таймзоне.
  const res = await client.query(
    `select distinct to_char(se.date, 'YYYY-MM-DD') as day
     from public.schedule_entries se
     join public.schedules s on s.id = se.schedule_id
     where s.is_active = true
       and coalesce(se.is_cancelled, false) = false
       and se.subject_name ilike $1
       and to_char(se.start_time, 'HH24:MI') = $2
     order by day`,
    [match, slot],
  );
  return res.rows.map((r) => r.day);
}

function replaceSectionDates(raw, section, dates, slug) {
  const marker = `"${section}": [`;
  const start = raw.indexOf(marker);
  if (start < 0) throw new Error(`${slug}: секция ${section} не найдена`);
  const end = raw.indexOf("\n  ]", start);
  if (end < 0) throw new Error(`${slug}: не найден конец секции ${section}`);
  const body = raw.slice(start, end);
  const count = (body.match(/"date":\s*"\d{4}-\d{2}-\d{2}"/g) || []).length;
  if (count !== dates.length) {
    throw new Error(`${slug}: в ${section} ${count} дат, в расписании ${dates.length} — прерываю`);
  }
  let index = 0;
  const nextBody = body.replace(/"date":\s*"\d{4}-\d{2}-\d{2}"/g, () => `"date": "${dates[index++]}"`);
  return raw.slice(0, start) + nextBody + raw.slice(end);
}

function replaceLabs(raw, labs, dates, slug) {
  const marker = '"labs": [';
  const start = raw.indexOf(marker);
  if (start < 0) return raw;
  const end = raw.indexOf("\n  ]", start);
  if (end < 0) throw new Error(`${slug}: не найден конец секции labs`);
  if (labs.length !== dates.length) {
    throw new Error(`${slug}: лабораторных ${labs.length}, свободных дат ${dates.length} — прерываю`);
  }
  const rows = labs.map((lab, i) => {
    const title = typeof lab === "string" ? lab : String(lab.title || "");
    return `    { "n": ${i + 1}, "date": "${dates[i]}", "title": ${JSON.stringify(title)} }`;
  });
  return raw.slice(0, start) + marker + "\n" + rows.join(",\n") + "\n  ]" + raw.slice(end + "\n  ]".length);
}

for (const plan of PLANS) {
  const file = path.join(REPO, plan.file);
  const raw = fs.readFileSync(file, "utf8");
  const data = JSON.parse(raw);

  const lectureDates = await datesFor(plan.match, plan.lectureSlot);
  const practiceDates = await datesFor(plan.match, plan.practiceSlot);
  const practiceCount = Array.isArray(data.practicals) ? data.practicals.length : 0;
  const lectureCount = Array.isArray(data.lectures) ? data.lectures.length : 0;
  const labCount = Array.isArray(data.labs) ? data.labs.length : 0;

  console.log(`\n== ${plan.slug} (${plan.file})`);
  console.log(`  лекций в плане ${lectureCount}, в расписании ${lectureDates.length}`);
  console.log(`  практик в плане ${practiceCount}, в расписании ${practiceDates.length}`);
  console.log(`  лабораторных в плане ${labCount}`);

  if (lectureCount && lectureCount !== lectureDates.length) {
    console.warn("  ВНИМАНИЕ: число лекций не совпадает с расписанием — лекции не трогаю");
  }

  // Лабораторные занимают свободные пары практикума после практических занятий.
  const freePracticeDates = practiceDates.slice(practiceCount);
  const usedPracticeDates = practiceDates.slice(0, practiceCount);
  if (!plan.labs && practiceCount && practiceDates.length !== practiceCount) {
    console.warn(
      `  ВНИМАНИЕ: в расписании ${practiceDates.length} пар, в плане ${practiceCount} тем; без темы остаются: ${practiceDates.slice(practiceCount).join(", ")}`,
    );
  }
  if (plan.labs && labCount) {
    console.log(`  практики: ${usedPracticeDates[0]} – ${usedPracticeDates.at(-1)}`);
    console.log(`  лабораторные: ${freePracticeDates[0]} – ${freePracticeDates.at(-1)}`);
    if (practiceDates.length !== practiceCount + labCount) {
      console.warn("  ВНИМАНИЕ: пар в расписании больше/меньше, чем практик+лабораторных");
    }
  }

  let next = raw;
  if (lectureCount && lectureCount === lectureDates.length) {
    next = replaceSectionDates(next, "lectures", lectureDates, plan.slug);
  }
  if (practiceCount) {
    next = replaceSectionDates(next, "practicals", usedPracticeDates, plan.slug);
  }
  if (plan.labs && labCount) {
    next = replaceLabs(next, data.labs, freePracticeDates, plan.slug);
  }

  const firstLecture = lectureDates[0];
  const lastLecture = lectureDates.at(-1);
  const firstPractice = practiceDates[0];
  // Конец практикума — последняя дата, у которой есть тема в плане
  // (лабораторные идут после практик), а не последняя пара в расписании.
  const lastPractice =
    plan.labs && labCount ? freePracticeDates.at(-1) : usedPracticeDates.at(-1) || practiceDates.at(-1);
  const range =
    plan.lectureSlot && firstLecture
      ? `лекции ${firstLecture} – ${lastLecture}, практикум ${firstPractice} – ${lastPractice}`
      : `занятия ${firstPractice} – ${lastPractice}`;
  const extraPractice = plan.labs ? [] : practiceDates.slice(practiceCount);
  const extraNote = extraPractice.length
    ? ` В расписании есть ещё пары без темы в плане: ${extraPractice.join(", ")}.`
    : "";
  const note = `Даты — из активного расписания МБХ-201 v${version} на ${year}: ${range}. Содержание плана со стенда сохранено без изменений.${extraNote}`;

  next = next.replace(/"year":\s*"[^"]*"/, `"year": "${year}"`);
  next = next.replace(/"note":\s*"[^"]*"/, `"note": ${JSON.stringify(note)}`);

  const parsed = JSON.parse(next);
  const sectionDates = [
    (parsed.lectures || []).map((x) => x.date),
    (parsed.practicals || []).map((x) => x.date),
    (parsed.labs || []).map((x) => (typeof x === "object" ? x.date : null)).filter(Boolean),
  ];
  const dates = sectionDates.flat();
  for (const section of sectionDates) {
    if (JSON.stringify(section) !== JSON.stringify([...section].sort())) {
      throw new Error(`${plan.slug}: даты внутри секции идут не по возрастанию`);
    }
  }

  if (DRY) {
    console.log("  (dry) даты не записаны");
    console.log("  первые даты:", dates.slice(0, 3).join(", "), "…", dates.at(-1));
  } else {
    fs.writeFileSync(file, next, "utf8");
    console.log(`  записано: ${parsed.year}, ${dates.length} дат`);
  }
}

await client.end();
