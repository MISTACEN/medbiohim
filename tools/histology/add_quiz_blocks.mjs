// Вставка ```quiz блоков в лекции гистологии: подбирает вопросы из Supabase
// questions (subject histology) по совпадению темы/модуля с заголовком лекции
// и вставляет «Итоговый тест по теме» перед ## Контрольные вопросы.
//
// Мини-тест ≠ полный тест: вопросы полного теста занятия (test_id из плана
// семестра → test_questions) исключаются из пула; если после исключения
// вопросов меньше MIN, берётся весь тематический пул.
//
// Идемпотентно: лекции, где ```quiz уже есть, пропускаются.
//
// Запуск: node tools/histology/add_quiz_blocks.mjs [--dry] [--min=8] [--max=12]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(REPO, "public", "content", "lectures", "histology");
const DRY = process.argv.includes("--dry");
const MIN = Number((process.argv.find((a) => a.startsWith("--min=")) || "--min=6").slice(6));
const MAX = Number((process.argv.find((a) => a.startsWith("--max=")) || "--max=12").slice(6));

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Za-z_0-9]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

// Явный маппинг лекция → темы банка вопросов в Supabase (topics.title).
// Канонические hist-00…08 уже имеют quiz-блоки — их скрипт пропускает;
// маппинг нужен для новых hist-09…18.
const LECTURE_TOPICS = {
  "hist-09-nervnaya-tkan.md": [
    "Неделя 9–10 · Лекция 9/практика · Нервная ткань",
    "Нервная ткань", // Общая гистология · Нервная ткань
  ],
  "hist-10-nervnaya-sistema.md": [
    "Неделя 10/14 · Лекция 10/практика · Спинной мозг, ганглий, периферический нерв",
  ],
  "hist-11-kora-mozzhechok-vns.md": [
    "Неделя 11/15 · Лекция 11/практика · Кора, мозжечок и ВНС",
    "Неделя 10/14 · Лекция 10/практика · Спинной мозг, ганглий, периферический нерв",
  ],
  "hist-12-zrenie-obonyanie.md": [
    "Неделя 12–13 · Лекции 12–13 · Зрение, обоняние, слух, равновесие, вкус",
  ],
  "hist-13-sluh-vkus.md": [
    "Неделя 12–13 · Лекции 12–13 · Зрение, обоняние, слух, равновесие, вкус",
  ],
  "hist-14-serdechno-sosudistaya.md": [
    "Неделя 14 · Лекция 14 · Сердечно-сосудистая система",
  ],
  "hist-15-endokrinnaya.md": [
    "Неделя 15 · Лекция 15 · Эндокринная система",
  ],
  "hist-16-krovetvorenie.md": [
    "Неделя 16–17 · Лекции 16–17 · Кроветворение и иммунная защита",
    "Кровь", // Общая гистология · Кровь
  ],
  "hist-17-limfoidnye-organy.md": [
    "Неделя 16–17 · Лекции 16–17 · Кроветворение и иммунная защита",
    "Кровь",
  ],
  "hist-18-pishchevaritelnyy-kanal.md": [
    "Неделя 18 · Лекция 18 · Пищеварительный канал: ротовая полость",
  ],
};

// Номер занятия и тест занятия берём из плана семестра: подпись у мини-теста
// должна вести на ту же пару «лекция + тест», что и страница занятия.
const PLAN_PATH = path.join(REPO, "public", "content", "histology", "plan-semester3-2026-2027.json");
const lessonByLectureId = new Map();
for (const week of JSON.parse(fs.readFileSync(PLAN_PATH, "utf8")).weeks || []) {
  const lecture = week.lecture;
  if (!lecture?.lecture_id) continue;
  lessonByLectureId.set(String(lecture.lecture_id), {
    num: Number(week.num),
    testId: lecture.test_id ? String(lecture.test_id) : null,
  });
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

(async () => {
  const env = loadEnv();
  const client = new pg.Client({ connectionString: env.DB_URL.replace(/\?sslmode=\w+/, ""), ssl: { rejectUnauthorized: false } });
  client.on("error", () => {});
  await client.connect();

  const subjectRow = await client.query(
    `select s.id from subjects s left join questions q on q.subject_id=s.id
     where s.slug='histology' group by s.id order by count(q.id) desc limit 1`,
  );
  const subjectId = subjectRow.rows[0].id;

  const questions = await client.query(
    `select q.id, q.text, m.title module_title, tp.title topic_title
     from questions q
     left join modules m on m.id = q.module_id
     left join topics tp on tp.id = q.topic_id
     where q.subject_id = $1 and q.type = 'mcq' and q.is_published = true`,
    [subjectId],
  );
  console.log(`mcq в БД: ${questions.rows.length}`);

  // Мини-тест не должен повторять полный тест занятия: вопросы полного теста
  // (test_id из плана → test_questions) исключаются из пула. Если после
  // исключения пула не хватает, откатываемся к полному пулу — лучше
  // пересечение, чем отсутствие мини-теста.
  const planTestIds = [...new Set([...lessonByLectureId.values()].map((l) => l.testId).filter(Boolean))];
  const questionsByTestId = new Map();
  if (planTestIds.length) {
    const linked = await client.query(
      `select test_id, question_id from test_questions where test_id = any($1::uuid[])`,
      [planTestIds],
    );
    for (const row of linked.rows) {
      const list = questionsByTestId.get(row.test_id) || [];
      list.push(row.question_id);
      questionsByTestId.set(row.test_id, list);
    }
    console.log(`вопросов в полных тестах занятия: ${linked.rows.length} (тестов: ${planTestIds.length})`);
  }

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
  let touched = 0;
  for (const file of files) {
    const raw = fs.readFileSync(path.join(DIR, file), "utf8").replace(/\r\n/g, "\n");
    if (raw.includes("```quiz")) {
      console.log(`${file}: quiz уже есть, пропуск`);
      continue;
    }
    const meta = {};
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(raw);
    for (const line of (fm?.[1] || "").split("\n")) {
      const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
      if (kv) meta[kv[1]] = kv[2];
    }
    const topicPatterns = LECTURE_TOPICS[file];
    if (!topicPatterns) {
      console.log(`${file}: нет маппинга тем, пропуск`);
      continue;
    }
    const patterns = topicPatterns.map((t) => norm(t).join(" "));
    const pool = questions.rows.filter((q) => {
      const hay = `${norm(q.module_title).join(" ")} ${norm(q.topic_title).join(" ")}`;
      return patterns.some((p) => hay === p || hay.includes(p));
    });
    if (!pool.length) {
      console.log(`${file}: темы не найдены в БД, пропуск`);
      continue;
    }
    // приоритет: вопросы, у которых topic совпал точнее (первый паттерн — самый специфичный)
    let poolForMini = pool;
    const lessonTestQuestions = lessonByLectureId.get(String(meta.id || ""))?.testId
      ? questionsByTestId.get(lessonByLectureId.get(String(meta.id || "")).testId)
      : null;
    if (lessonTestQuestions?.length) {
      const excluded = new Set(lessonTestQuestions);
      const filtered = pool.filter((q) => !excluded.has(q.id));
      if (filtered.length >= MIN) {
        poolForMini = filtered;
        console.log(`${file}: из пула исключено ${pool.length - filtered.length} вопросов полного теста занятия`);
      } else {
        console.log(`${file}: после исключения полного теста осталось ${filtered.length} < ${MIN}, берём весь пул`);
      }
    }
    const chosen = shuffle(poolForMini).slice(0, MAX);
    if (chosen.length < MIN) {
      console.log(`${file}: мало вопросов (${chosen.length} < ${MIN}), пропуск`);
      continue;
    }

    const lesson = lessonByLectureId.get(String(meta.id || ""));
    const lessonNum = Number.isFinite(lesson?.num) && lesson.num > 0 ? lesson.num : null;
    const heading = lessonNum ? `## ✅ Мини-тест · занятие ${lessonNum}` : "## ✅ Итоговый тест по теме";
    const intro = lessonNum
      ? `Вопросы из банка по теме занятия. Полный тест занятия с проверкой — [занятие ${lessonNum}](/subjects/histology/lesson/${lessonNum}).`
      : "Вопросы из банка по теме лекции.";
    const quizTitle = lessonNum
      ? `Мини-тест · занятие ${lessonNum} (${chosen.length} вопросов)`
      : `Итоговый тест · ${meta.title} (${chosen.length} вопросов)`;

    const block = [
      "",
      heading,
      "",
      intro,
      "",
      "```quiz",
      JSON.stringify({
        questionIds: chosen.map((q) => q.id),
        subjectId,
        title: quizTitle,
      }),
      "```",
      "",
    ];
    const anchor = raw.includes("## Контрольные вопросы") ? "## Контрольные вопросы" : "## Дальше по теме";
    const idx = raw.indexOf(anchor);
    if (idx < 0) {
      console.log(`${file}: нет якоря ${anchor}, пропуск`);
      continue;
    }
    const updated = raw.slice(0, idx) + block.join("\n") + "\n" + raw.slice(idx);
    if (!DRY) fs.writeFileSync(path.join(DIR, file), updated, "utf8");
    touched += 1;
    console.log(`${file}: вставлен тест из ${chosen.length} вопросов (${poolForMini.length} в пуле)`);
  }
  console.log(`итого: ${touched}/${files.length}${DRY ? " (dry)" : ""}`);
  await client.end();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
