// Разложение банка вопросов физиологии по модулям (методичкам) и темам:
//   modules   = 7 методичек из index.json
//   topics    = занятие методички / название банка тестовых заданий
//   questions = module_id + topic_id + чистка хвостового примечания «[Тест · …]»
//   tests     = отдельный опубликованный тест на каждую группу тестов
//               методички (test_questions по порядку) — так в предмете
//             появляются тесты по темам, а не только «Кровь — базовый».
// Ключи source_key повторяют import_physiology_questions.mjs, поэтому
// сопоставление вопрос ↔ место в методичке точное, без эвристик.
//
// Запуск: node tools/portals/organize_physiology_bank.mjs [--dry]

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(REPO, "public", "content", "physiology");
const DRY = process.argv.includes("--dry");
const PHYSIOLOGY_SUBJECT = "6957e370-029e-4a9d-a6d2-fedf645328a9";

const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);

/** Те же записи, что положил импортёр: kind, текст, source_key, место в методичке. */
function collect() {
  const index = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
  const rows = [];
  for (const manualMeta of index.manuals) {
    const manual = JSON.parse(fs.readFileSync(path.join(REPO, "public", manualMeta.file), "utf8"));
    const moduleTitle = manual.title || manualMeta.title;
    for (const lesson of manual.lessons || []) {
      const topicNote = `${manual.title} · ${lesson.title}`;
      for (const group of lesson.tests || []) {
        for (const q of group.questions || []) {
          const text = String(q.text || "").trim();
          if (text.length < 8) continue;
          rows.push({
            kind: "mcq", text, key: sha(`mcq:${text}`),
            module: moduleTitle,
            topic: lesson.title,
            testTitle: group.title && group.title !== lesson.title
              ? `${group.title.replace(/\.?\s*$/, "")} · ${lesson.title}`
              : lesson.title,
          });
        }
      }
      const pushOpen = (arr, label) => {
        for (const item of arr || []) {
          const text = String(item).trim();
          if (text.length < 8) continue;
          rows.push({ kind: "open", text, key: sha(`open:${text}`), module: moduleTitle, topic: lesson.title });
        }
      };
      pushOpen(lesson.questions, "Контрольный вопрос");
      pushOpen(lesson.situational, "Ситуационная задача");
      pushOpen(lesson.tasks, "Задача");
    }
    for (const bank of manual.banks || []) {
      for (const q of bank.questions || []) {
        const text = String(q.text || "").trim();
        if (text.length < 8) continue;
        rows.push({
          kind: "mcq", text, key: sha(`mcq:${text}`),
          module: moduleTitle, topic: bank.title, testTitle: bank.title,
        });
      }
    }
  }
  return rows;
}

/** Хвостовое «\n\n[Тест · …]», добавленное импортёром, из текста вопроса. */
const NOTE_RE = /\n*\[[^\]]+\]\s*$/;
function stripNote(text) {
  return text.replace(NOTE_RE, "").trim();
}

(async () => {
  const rows = collect();
  const modules = [...new Set(rows.map((r) => r.module))];
  const tests = [...new Map(rows.filter((r) => r.testTitle).map((r) => [`${r.module}|${r.topic}|${r.testTitle}`, r])).values()];
  console.log(`вопросов с картой: ${rows.length}, модулей: ${modules.length}, тестов-наборов: ${tests.length}`);
  if (DRY) {
    for (const r of rows.slice(0, 3)) console.log("  пример:", r.kind, "|", r.module, "|", r.topic.slice(0, 50), "|", r.text.slice(0, 50));
    return;
  }

  const env = {};
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  const client = new pg.Client({ connectionString: env.DB_URL.replace(/\?sslmode=\w+/, ""), ssl: { rejectUnauthorized: false } });
  client.on("error", () => {});
  await client.connect();

  // 1. Модули — по порядку из index.json.
  const moduleId = new Map();
  const existed = await client.query("select id,title from modules where subject_id=$1", [PHYSIOLOGY_SUBJECT]);
  for (const row of existed.rows) moduleId.set(row.title, row.id);
  let order = 10;
  for (const title of modules) {
    if (!moduleId.has(title)) {
      const res = await client.query(
        "insert into modules (subject_id,title,order_index,is_published) values ($1,$2,$3,true) returning id",
        [PHYSIOLOGY_SUBJECT, title, order],
      );
      moduleId.set(title, res.rows[0].id);
    }
    order += 10;
  }
  console.log("модулей готово:", moduleId.size);

  // 2. Темы внутри каждого модуля.
  const topicId = new Map();
  const existedTopics = await client.query(
    "select tp.id,tp.title,m.title module_title from topics tp join modules m on m.id=tp.module_id where m.subject_id=$1",
    [PHYSIOLOGY_SUBJECT],
  );
  for (const row of existedTopics.rows) topicId.set(`${row.module_title}|${row.title}`, row.id);
  let createdTopics = 0;
  const topicOrder = new Map();
  for (const r of rows) {
    const k = `${r.module}|${r.topic}`;
    topicOrder.set(k, (topicOrder.get(k) || 0) + 1);
  }
  let tOrder = 10;
  for (const k of [...topicOrder.keys()].sort((a, b) => topicOrder.get(b) - topicOrder.get(a))) {
    if (topicId.has(k)) continue;
    const [moduleTitle, title] = k.split("|");
    const res = await client.query(
      "insert into topics (module_id,title,order_index,is_published) values ($1,$2,$3,true) returning id",
      [moduleId.get(moduleTitle), title, tOrder],
    );
    topicId.set(k, res.rows[0].id);
    tOrder += 10;
    createdTopics += 1;
  }
  console.log("тем создано:", createdTopics, "| всего:", topicId.size);

  // 3. Вопросы: привязка к модулю/теме + чистка примечания из текста.
  let updatedQ = 0;
  for (const r of rows) {
    const res = await client.query(
      `update questions set module_id=$1, topic_id=$2, text=$3
       where subject_id=$4 and source_key=$5 and (module_id is null or topic_id is null or text like '%[%')`,
      [moduleId.get(r.module), topicId.get(`${r.module}|${r.topic}`), stripNote(r.text), PHYSIOLOGY_SUBJECT, `phys_${r.kind}:${r.key}`],
    );
    updatedQ += res.rowCount;
  }
  console.log("вопросов обновлено:", updatedQ);

  // 4. Тесты по темам + связи с вопросами.
  let createdTests = 0, linked = 0;
  const testOrder = { module: null, n: 10 };
  for (const r of tests) {
    const sourceKey = `phys_testset:${sha(`${r.kind}:${r.module}|${r.testTitle}`)}`;
    let testRow = (await client.query("select id from tests where subject_id=$1 and source_key=$2 limit 1", [PHYSIOLOGY_SUBJECT, sourceKey])).rows[0];
    if (!testRow) {
      const res = await client.query(
        `insert into tests (subject_id,module_id,topic_id,title,is_published,source_key,order_index)
         values ($1,$2,$3,$4,true,$5,$6) returning id`,
        [PHYSIOLOGY_SUBJECT, moduleId.get(r.module), topicId.get(`${r.module}|${r.topic}`), r.testTitle, sourceKey, testOrder.n],
      );
      testRow = res.rows[0];
      testOrder.n += 10;
      createdTests += 1;
    }
    const members = rows.filter((x) => x.module === r.module && x.topic === r.topic && x.testTitle === r.testTitle);
    let idx = 0;
    for (const m of members) {
      const q = (await client.query("select id from questions where subject_id=$1 and source_key=$2 limit 1", [PHYSIOLOGY_SUBJECT, `phys_${m.kind}:${m.key}`])).rows[0];
      if (!q) continue;
      const link = await client.query(
        "select 1 from test_questions where test_id=$1 and question_id=$2 limit 1",
        [testRow.id, q.id],
      );
      if (!link.rows.length) {
        await client.query("insert into test_questions (test_id,question_id,order_index) values ($1,$2,$3)", [testRow.id, q.id, idx]);
        linked += 1;
      }
      idx += 1;
    }
  }
  console.log("тестов создано:", createdTests, "| связей добавлено:", linked);

  const check = await client.query(
    `select count(*)::int n from questions where subject_id=$1 and topic_id is not null`,
    [PHYSIOLOGY_SUBJECT],
  );
  console.log("итого вопросов с темой:", check.rows[0].n);
  await client.end();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
