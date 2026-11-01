// Связывает лекции с учебным планом и убирает дубли из выдачи предмета.
//
// 1. Плановые лекции гистологии (curriculum.scope=current в site_content) попадают
//    в histology_lectures — именно эту таблицу отдаёт публичный API страницы предмета.
// 2. Темы, у которых есть полная лекция серии hist-0X, ведут на неё: короткий
//    конспект влит в полную (curriculum.scope=merged), в выдаче — одна лекция
//    на тему; архивные дубли (study-core) остаются скрытыми. Полную серию синк не скрывает.
// 3. В payload учебного плана каждой неделе проставляется lecture_id/lecture_title,
//    чтобы вкладка «План» могла открыть нужную лекцию.
//
// Запуск: node tools/lectures/link_plans.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = process.argv.includes("--dry");

function loadEnv() {
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// Архив: дубли, которые уже объединены с каноническими лекциями (их текст влит
// в цель под заголовком «## Дополнение: … (объединено)» и помечен MBH:MERGED:FROM).
// Держим их снятыми с публикации, чтобы не было двух записей на одну тему.
//
// ВАЖНО: полную серию hist-00…hist-08 здесь перечислять нельзя — это канон,
// её публикация не должна зависеть от прогона синка (именно из-за этого
// hist-03-embriologiya однажды исчезла из выдачи).
const ARCHIVED = [
  "histology-mbh-study-muscle-core",
  "histology-mbh-study-epithelium-core",
  "histology-mbh-study-blood-core",
  "histology-mbh-study-nervous-core",
  "histology-mbh-study-connective-core",
  "histology-mbh-study-cytology-core",
  "histology-mbh-study-urinary-reproductive-core",
  "histology-mbh-study-cardiovascular-core",
  "histology-mbh-study-digestive-core",
  "histology-mbh-study-respiratory-core",
  "histology-mbh-study-embryology-core",
  "lec-hist-histotech",
  "lec-hist-plan-01-20261008",
  "lec-hist-cytology",
  "lec-hist-embryology",
  "lec-hist-epithelium",
  "lec-histology-blood-20261008",
  "lec-hist-connective",
  "lec-hist-bone_muscle",
  "lec-hist-plan-08-20261008",
];

/** Полная серия занятий: её содержимое — канон, синк не вправе её скрывать. */
const FULL_SERIES = /^hist-0\d/;
/** Нижняя граница «это полноценная лекция, а не конспект». */
const FULL_LECTURE_MIN_CHARS = 20000;

/** Недели, у которых канон — полная лекция серии hist-0X (короткий конспект влит в неё). */
const FULL_LECTURE_BY_WEEK = {
  1: "hist-00-gistotekhnika",
  2: "hist-01-citologiya-organelly",
  3: "hist-03-embriologiya",
  4: "hist-04-epitelialnye-tkani",
  5: "hist-05-krov",
  6: "hist-06-sobstvenno-st",
  7: "hist-07-hryaschevye-kostnye",
  8: "hist-08-myishechnye-tkani",
};
/** Привязка недели к лекции: канон важнее order_index из плановых записей. */
function lectureIdForWeek(n) {
  return FULL_LECTURE_BY_WEEK[n] || histByOrderRef.get(n) || null;
}
let histByOrderRef = new Map();

// План физиологии 3 семестра: неделя → лекция (сопоставлено по теме недели).
const PHYSIOLOGY_PLAN = {
  1: "lec-44db6ebee0344e24", // предмет и методы физиологии
  2: "lec-7f9d0be106de460f", // потенциал покоя и действия
  3: "lec-8c7c3b4980a04971", // законы раздражения возбудимых структур
  4: "lec-f032784e3caf4e67", // физиология мышц
  5: "lec-7689425cf2c14023", // физиология нервной клетки
  6: "lec-75da7a3c6a354eed", // рефлекс, нейрональная сеть, нервный центр
  7: "lec-75da7a3c6a354eed", // торможение и координация — та же лекция
  8: "lec-fc517dbd545b422c", // соматическая нервная система
  9: "lec-7a1a41c1be12466b", // вегетативная нервная система
  10: "lec-600c4ab31d684ddf", // система крови, эритроциты
  11: "lec-6fb509db7efb4fbd", // лейкоциты, иммунный ответ
  12: "lec-6940f5d6a7884a58", // тромбоциты, гемостаз
};

async function sb(pathname, init = {}) {
  const res = await fetch(`${URL}/rest/v1/${pathname}`, { headers: H, ...init });
  if (!res.ok) throw new Error(`${pathname} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.headers.get("content-type")?.includes("json") ? res.json() : null;
}

const lecturesRow = (await sb("site_content?key=eq.lectures&select=payload"))[0];
const payload = lecturesRow?.payload;
const items = Array.isArray(payload) ? payload : payload?.items ?? [];

const plans = await sb("site_content?key=like.subject_plan:*&select=key,payload");
const planOf = (slug) => plans.find((row) => row.key === `subject_plan:${slug}`);

// 1. Плановые лекции гистологии → в таблицу, которую читает страница предмета.
const histCurrent = items.filter(
  (l) => String(l.subject_slug) === "histology" && String(l.curriculum?.scope) === "current",
);
console.log(`плановых лекций гистологии: ${histCurrent.length}`);

const mirror = histCurrent.map((l) => ({
  id: l.id,
  subject_slug: "histology",
  specialty_scope: ["mbh"],
  title: l.title,
  kind: l.kind || "written_lecture",
  prep_names: Array.isArray(l.prep_names) ? l.prep_names : [],
  linked_prep_ids: Array.isArray(l.linked_prep_ids) ? l.linked_prep_ids : [],
  body_markdown: String(l.body_md || l.body_markdown || ""),
  description_algorithm_ref: l.description_algorithm_ref ?? null,
  is_published: true,
  updated_at: new Date().toISOString(),
}));

if (!DRY && mirror.length) {
  await sb("histology_lectures?on_conflict=id", {
    method: "POST",
    headers: { ...H, Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify(mirror),
  });
  console.log(`в histology_lectures записано плановых лекций: ${mirror.length}`);
}

// 2. Держим архивные дубли скрытыми — но ТОЛЬКО их: полную серию не трогаем.
let archivedOff = 0;
for (const id of ARCHIVED) {
  if (DRY) continue;
  const row = (await sb(`histology_lectures?id=eq.${encodeURIComponent(id)}&select=id,is_published,body_markdown`))[0];
  if (!row) continue;
  const body = String(row.body_markdown || "");
  if (FULL_SERIES.test(id) || body.length >= FULL_LECTURE_MIN_CHARS) {
    // Защита от повторения инцидента: полная лекция не снимается этим синком.
    console.warn(`пропуск ${id}: похоже на полноценную лекцию (${body.length} симв.) — публикацию не меняю`);
    continue;
  }
  if (row.is_published === false) continue;
  await sb(`histology_lectures?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ is_published: false }),
  });
  archivedOff++;
}
console.log(`снято с публикации архивных дублей: ${archivedOff}${DRY ? " (dry)" : ""}`);

// 3. Привязка недель плана к лекциям.
function linkWeeks(slug, resolve) {
  const row = planOf(slug);
  if (!row) return console.log(`план ${slug}: нет`);
  const weeks = row.payload?.weeks || [];
  let linked = 0;
  weeks.forEach((week, index) => {
    const id = resolve(index + 1, week);
    if (!id) {
      delete week.lecture_id;
      delete week.lecture_title;
      return;
    }
    week.lecture_id = id;
    week.lecture_title = week.lecture || "";
    linked += 1;
  });
  console.log(`план ${slug}: недель ${weeks.length}, привязано лекций ${linked}`);
  return { key: row.key, payload: row.payload };
}

const histByOrder = new Map();
for (const l of histCurrent) {
  const order = Number(l.curriculum?.order_index);
  if (Number.isFinite(order)) histByOrder.set(order, l.id);
}
histByOrderRef = histByOrder;
// Недели, которые плановая лекция закрывает вместе с соседней: слух/равновесие
// (12–13) и лимфоидное кроветворение (16–17).
histByOrder.set(13, histByOrder.get(12));
histByOrder.set(17, histByOrder.get(16));

const histologyPlan = linkWeeks("histology", (n) => lectureIdForWeek(n));
const physiologyPlan = linkWeeks("physiology", (n) => PHYSIOLOGY_PLAN[n] || null);

for (const plan of [histologyPlan, physiologyPlan]) {
  if (!plan || DRY) continue;
  await sb(`site_content?key=eq.${encodeURIComponent(plan.key)}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ payload: plan.payload, updated_at: new Date().toISOString() }),
  });
}
console.log(DRY ? "dry-run: план не записан" : "планы обновлены");

// 4. Статические планы кафедр (public/content/...), которые рисует ChemPlan:
//    им тоже нужен lecture_id, иначе кнопка «Открыть лекцию» не появится.
//    Файлы правим текстом, чтобы не переформатировать весь JSON.
function patchStaticPlan(relativePath, transform) {
  const file = path.join(REPO, "public", "content", relativePath);
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (!DRY) fs.writeFileSync(file, after);
  const count = (after.match(/"lecture_id"/g) || []).length;
  console.log(`${relativePath}: лекций с lecture_id ${count}`);
}

// Гистология: "lecture": { "num": N, ... } — вставляем id сразу после num.
patchStaticPlan("histology/plan-semester3-2026-2027.json", (text) => {
  let out = text.replace(/"lecture_id":\s*"[^"]*",?\s*/g, "");
  out = out.replace(/"lecture":\s*\{\s*"num":\s*(\d+),/g, (match, num) => {
    const id = lectureIdForWeek(Number(num));
    return id ? `${match} "lecture_id": "${id}",` : match;
  });
  return out;
});

// Физиология: { "n": N, "date": ..., "title": ... } — id в конец объекта.
// Правки только внутри массива lectures: в labs/controls те же поля n,
// но ссылка на лекцию там не нужна.
patchStaticPlan("physiology/plan-semester3-2026-2027.json", (text) => {
  const start = text.indexOf('"lectures": [');
  const end = text.indexOf('"labs": [', start);
  if (start < 0 || end < 0) return text;
  const block = text
    .slice(start, end)
    .replace(/,\s*"lecture_id":\s*"[^"]*"/g, "")
    .replace(/(\{\s*"n":\s*(\d+),[^{}]*?)(\s*\})/g, (match, head, num, tail) => {
      const id = PHYSIOLOGY_PLAN[Number(num)];
      return id ? `${head}, "lecture_id": "${id}"${tail}` : match;
    });
  return text.slice(0, start) + block + text.slice(end);
});
