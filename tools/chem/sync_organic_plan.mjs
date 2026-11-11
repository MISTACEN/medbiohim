// Синхронизация плана organic_chemistry с активным расписанием 2026/2027.
//
// План собран с фотографий кафедрального стенда: даты в нём расставлены по
// средам, а занятия по расписанию МБХ-201 идут по вторникам. Из-за сдвига в
// сетке появилась «пустая» неделя 04.11, которой в расписании нет, а зачёт
// уехал на 13.01. Скрипт выравнивает обе копии плана — payload в site_content
// (его отдаёт API /subject-plans) и статический JSON, который читает страница
// «План» — по фактическим датам пар из активного расписания.
//
// Запуск: node tools/chem/sync_organic_plan.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const KEY = "subject_plan:organic_chemistry";
const STATIC_PLAN = path.join(REPO, "public", "content", "chem", "plan-organic-2025-2026.json");
const DRY = process.argv.includes("--dry");
const LECTURE_SLOT = "10:40";
const PRACTICE_SLOT = "12:50";

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

// Дата берётся текстом из SQL: pg отдаёт DATE как Date в локальной таймзоне,
// и toISOString() сдвигал её на день назад (вторник вместо среды).
const scheduleRows = await client.query(
  `select s.version, s.academic_year,
          to_char(se.date, 'YYYY-MM-DD') as day,
          to_char(se.start_time, 'HH24:MI') as slot
   from public.schedule_entries se
   join public.schedules s on s.id = se.schedule_id
   where s.is_active = true
     and (se.subject_name ilike '%орган%' or se.subject_name ilike '%organic%')
     and coalesce(se.is_cancelled, false) = false
   order by se.date, se.start_time`,
);

const lectureDates = [...new Set(scheduleRows.rows.filter((r) => r.slot.startsWith(LECTURE_SLOT)).map((r) => r.day))];
const practiceDates = [...new Set(scheduleRows.rows.filter((r) => r.slot.startsWith(PRACTICE_SLOT)).map((r) => r.day))];
const scheduleVersion = scheduleRows.rows[0]?.version ?? null;
const scheduleYear = scheduleRows.rows[0]?.academic_year ?? "2026/2027";

console.log(`расписание: v${scheduleVersion} ${scheduleYear}; лекций ${lectureDates.length}, практик ${practiceDates.length}`);
console.log(`  лекции:   ${lectureDates.join(", ")}`);
console.log(`  практики: ${practiceDates.join(", ")}`);

if (practiceDates.length !== 18 || lectureDates.length !== 10) {
  console.error("расписание не совпадает по количеству пар с планом (ожидается 10 лекций и 18 практик) — прерываю");
  process.exit(1);
}

/* ---------------------------- 1. План в БД ---------------------------- */

const current = await client.query("select payload from public.site_content where key = $1", [KEY]);
if (!current.rows.length) {
  console.error("план не найден в site_content");
  process.exit(1);
}
const payload = current.rows[0].payload;
const weeks = Array.isArray(payload.weeks) ? payload.weeks : [];

// Каждой неделе плана — дата практики из расписания (по одной на неделю);
// лекции остаются на тех неделях, где в расписании есть вторая пара.
const aligned = weeks.map((week, index) => ({ ...week, date: practiceDates[index] ?? week.date }));

for (const week of aligned) {
  if (week.lecture && !lectureDates.includes(week.date)) {
    console.warn(`ВНИМАНИЕ: лекция «${String(week.lecture).slice(0, 40)}…» стоит на ${week.date}, а лекции в расписании там нет`);
  }
}

// Неделя без лекции и без практики — пустая, её в плане быть не должно.
const kept = aligned.filter((week) => Boolean(week.lecture) || Boolean(week.practice));
const removed = aligned.length - kept.length;

console.log("--- недели плана ---");
aligned.forEach((week, index) => {
  const was = weeks[index]?.date;
  console.log(`${was === week.date ? "   " : "→  "}${String(index + 1).padStart(2)} ${was} → ${week.date} | L:${week.lecture ? "да" : "—"} | P:${week.practice ? "да" : "—"}`);
});
console.log(`недель было ${weeks.length}, осталось ${kept.length}, убрано пустых ${removed}`);

const nextPayload = {
  ...payload,
  weeks: kept,
  lecture_count: kept.filter((week) => week.lecture).length,
  practice_count: kept.filter((week) => week.practice).length,
  aligned_schedule_year: scheduleYear,
  aligned_schedule_version: scheduleVersion,
  note: `Официальный план лекций и календарно-тематический план лабораторных занятий с фотографий пользователя. Специальность «Медицинская биохимия», 2 курс, 3 семестр. Содержание сохранено без смысловых добавлений; даты выровнены по активному расписанию МБХ-201 v${scheduleVersion} на ${scheduleYear}: ${practiceDates[0]} – ${practiceDates[practiceDates.length - 1]}.`,
};

/* ------------------- 2. Статический план для страницы ------------------ */

const rawStatic = fs.readFileSync(STATIC_PLAN, "utf8");
const staticPlan = JSON.parse(rawStatic);
const oldLabDates = (staticPlan.labs || []).map((lab) => String(lab.date || ""));
const oldLectureDates = (staticPlan.lectures || []).map((lecture) => String(lecture.date || ""));

// Контрольные точки привязаны к конкретным занятиям: находим занятие по старой
// дате и переносим точку на новую дату этого же занятия.
const controlDates = (staticPlan.controls || []).map((control) => {
  const oldDate = String(control.date || "");
  const labIndex = oldLabDates.indexOf(oldDate);
  if (labIndex >= 0 && practiceDates[labIndex]) return practiceDates[labIndex];
  const lectureIndex = oldLectureDates.indexOf(oldDate);
  if (lectureIndex >= 0 && lectureDates[lectureIndex]) return lectureDates[lectureIndex];
  return oldDate;
});

console.log("--- контрольные точки ---");
(staticPlan.controls || []).forEach((control, index) => {
  if (control.date !== controlDates[index]) {
    console.log(`  ${control.n}: ${control.date} → ${controlDates[index]} · ${String(control.title).slice(0, 46)}`);
  }
});

// Меняем только значения дат в нужных секциях: файл остаётся в своём
// форматировании, и диф показывает четыре десятка дат, а не переписанный JSON.
function replaceSectionDates(raw, section, dates) {
  const marker = `"${section}": [`;
  const start = raw.indexOf(marker);
  if (start < 0) return raw;
  const end = raw.indexOf("\n  ]", start);
  if (end < 0) return raw;
  const body = raw.slice(start, end);
  let index = 0;
  const nextBody = body.replace(/"date":\s*"\d{4}-\d{2}-\d{2}"/g, (match) => {
    const value = dates[index++];
    return value ? `"date": "${value}"` : match;
  });
  return raw.slice(0, start) + nextBody + raw.slice(end);
}

let nextStatic = replaceSectionDates(rawStatic, "lectures", lectureDates);
nextStatic = replaceSectionDates(nextStatic, "labs", practiceDates);
nextStatic = replaceSectionDates(nextStatic, "controls", controlDates);
nextStatic = nextStatic.replace(/"year":\s*"[^"]*"/, `"year": "${scheduleYear}"`);

/* ------------------------------ запись ------------------------------- */

if (DRY) {
  console.log("(dry) изменения не записаны");
} else {
  await client.query("begin");
  await client.query(`update public.site_content set payload = $2, updated_at = now() where key = $1`, [KEY, nextPayload]);
  await client.query("commit");
  if (nextStatic !== rawStatic) fs.writeFileSync(STATIC_PLAN, nextStatic, "utf8");
  console.log("план обновлён: site_content + public/content/chem/plan-organic-2025-2026.json");
}

await client.end();
