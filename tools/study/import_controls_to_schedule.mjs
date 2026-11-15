// Импорт контрольных точек из планов предметов (site_content: subject_plan:<slug>
// → payload.controls) в schedule_entries с event_kind — чтобы «Готовность к
// событию» на /study считалась на реальных данных, а не только на вручную
// заведённых событиях.
//
// Идемпотентность:
//  - source_detail = "subject_plan:<slug>:controls:<n>" — точный маркер повторного запуска;
//  - пропуск near-duplicate: если в расписании уже есть событие того же предмета
//    с тем же event_kind в пределах ±14 дней от даты контроля (вручную перенесли).
//
// Запуск: node tools/study/import_controls_to_schedule.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = process.argv.includes("--dry");

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY;
if (!base || !key) throw new Error("нет SUPABASE_URL / SUPABASE_SERVICE_KEY в .env.local");

async function rest(pathname, options = {}) {
  const response = await fetch(base + pathname, {
    ...options,
    headers: {
      apikey: key,
      authorization: "Bearer " + key,
      "content-type": "application/json",
      accept: "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`REST ${pathname}: ${response.status} ${text.slice(0, 200)}`);
  }
  return response;
}

async function rows(table, query) {
  // query — строка (готовый qs) или объект фильтров PostgREST.
  const qs = typeof query === "string" ? query : (() => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query || {})) params.set(k, v);
    return params.toString();
  })();
  const response = await rest(`/rest/v1/${table}?${qs}`);
  return response.json();
}

const KIND_BY_WORD = [
  ["коллоквиум", "colloquium"],
  ["контрольная", "control_work"],
  ["контрольн", "control_work"],
  ["кр ", "control_work"],
  ["зачет", "credit"],
  ["зачёт", "credit"],
  ["экзамен", "exam"],
];

function eventKindFor(title) {
  const lower = String(title || "").toLowerCase();
  for (const [word, kind] of KIND_BY_WORD) {
    if (lower.includes(word)) return kind;
  }
  return "control_work";
}

const today = new Date().toISOString().slice(0, 10);

// 1. Планы с контролами.
const plansResponse = await rest("/rest/v1/site_content?select=key,payload&key=like.subject_plan:*");
const plans = (await plansResponse.json()).filter((row) => Array.isArray(row.payload?.controls) && row.payload.controls.length);

// 2. Активные расписания с группами.
const schedules = await rows("schedules", "select=id,is_active,group_id,groups!inner(name,course_number,semester,specialty_slug,is_active)&is_active=eq.true&groups.is_active=eq.true");
const activeSchedules = schedules.filter((s) => s.is_active && s.groups?.is_active);

// 3. Предметы (для subject_id по названию/слагу).
const subjects = await rows("subjects", "select=id,slug,name&is_active=eq.true");
const SLUG_BY_PLAN_KEY = {
  "subject_plan:organic_chemistry": "chemistry_organic_physical",
};
const slugFromKey = (key) => key.replace("subject_plan:", "");

let inserted = 0;
let skippedExisting = 0;
let skippedNearDuplicate = 0;
let skippedNoSchedule = 0;

for (const plan of plans) {
  const planKey = plan.key;
  const payload = plan.payload;
  const slug = SLUG_BY_PLAN_KEY[planKey] || slugFromKey(planKey);
  const subjectName = String(payload.subject || "").trim();

  const subject = subjects.find((s) => s.slug === slug) ||
    subjects.find((s) => s.name.toLowerCase() === subjectName.toLowerCase());
  if (!subject) {
    console.log(`! ${planKey}: предмет не найден (slug ${slug}), пропуск`);
    continue;
  }

  // Расписания групп этого курса/семестра (план payload.course/semester).
  const course = Number(payload.course ?? payload.course_number ?? 0);
  const semester = Number(payload.semester ?? 0);
  const matching = activeSchedules.filter((s) =>
    (!course || Number(s.groups.course_number) === course) &&
    (!semester || Number(s.groups.semester) === semester));

  if (!matching.length) {
    skippedNoSchedule += payload.controls.length;
    console.log(`! ${planKey}: нет активного расписания для курса ${course}/${semester}, пропуск`);
    continue;
  }

  for (const [index, control] of payload.controls.entries()) {
    const date = String(control.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (date < today) continue; // прошедшие контролы не переносим в расписание
    const kind = eventKindFor(control.title);
    const sourceDetail = `${planKey}:controls:${control.n ?? index + 1}`;

    for (const schedule of matching) {
      // Точный маркер повторного запуска.
      const exact = await rows("schedule_entries", {
        select: "id",
        schedule_id: `eq.${schedule.id}`,
        source_detail: `eq.${sourceDetail}`,
        limit: "1",
      });
      if (exact.length) { skippedExisting += 1; continue; }

      // Near-duplicate: тот же предмет и вид события в ±14 дней
      // (контроль вручную перенесли — план-дату не дублируем; окно шире,
      // чтобы не создать дубль и следующего коллоквиума того же предмета).
      const nearFrom = new Date(Date.parse(date) - 21 * 86400000).toISOString().slice(0, 10);
      const nearTo = new Date(Date.parse(date) + 21 * 86400000).toISOString().slice(0, 10);
      const near = await rows("schedule_entries", {
        select: "id,date",
        schedule_id: `eq.${schedule.id}`,
        subject_name: `eq.${subjectName}`,
        event_kind: `eq.${kind}`,
        date: `gte.${nearFrom}`,
        and: `(date.lte.${nearTo})`,
        limit: "1",
      });
      if (near.length) {
        skippedNearDuplicate += 1;
        console.log(`~ ${planKey} ${sourceDetail}: уже есть ${kind} ${subjectName} на ${near[0].date} — пропуск`);
        continue;
      }

      // Время: как у первого занятия того же дня, иначе дефолт.
      const sameDay = await rows("schedule_entries", {
        select: "start_time,end_time",
        schedule_id: `eq.${schedule.id}`,
        date: `eq.${date}`,
        order: "start_time.asc",
        limit: "1",
      });
      const startTime = sameDay[0]?.start_time?.slice(0, 5) || "12:50";
      const endTime = sameDay[0]?.end_time?.slice(0, 5) || "14:20";

      const body = {
        schedule_id: schedule.id,
        subject_id: subject.id,
        subject_name: subjectName,
        date,
        start_time: startTime,
        end_time: endTime,
        type: "seminar",
        event_kind: kind,
        notes: `Контрольная точка плана: ${control.title}${control.covers?.length ? "\nОхват: " + control.covers.join("; ") : ""}`,
        is_cancelled: false,
        is_makeup: false,
        sort_order: 99,
        breaks: [],
        source: "subject_plan_import_2026_11_15",
        source_detail: sourceDetail,
      };

      if (DRY) {
        console.log(`[dry] ${schedule.groups.name}: ${date} ${startTime} ${kind} ${subjectName} — ${control.title}`);
        inserted += 1;
        continue;
      }
      const insertResponse = await rest("/rest/v1/schedule_entries", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(body),
      });
      const created = await insertResponse.json();
      inserted += 1;
      console.log(`✓ ${schedule.groups.name}: ${date} ${startTime} ${kind} ${subjectName} — ${control.title} (${created[0]?.id})`);
    }
  }
}

console.log(`\nитого: вставлено ${inserted}, уже были ${skippedExisting}, near-duplicate ${skippedNearDuplicate}, без расписания ${skippedNoSchedule}${DRY ? " (dry)" : ""}`);
