// Один тест на каждую тему занятия.
//
// До этого тесты в БД существовали только там, где методичка давала отдельный
// блок «Тестовые задания к теме»: у физиологии это 13 тем из 41, у гистологии —
// 10 из 20. Из-за этого в предмете показывались «два теста», хотя вопросы в
// банке уже были разложены по темам занятия.
//
// Скрипт досоздаёт недостающие:
//   * тема с вопросами и без теста → новый тест `topic-test:<topic_id>`
//     с заголовком темы, module_id + topic_id и всеми опубликованными
//     вопросами темы в test_questions (по порядку добавления);
//   * тема, у которой тест уже есть, только доукомплектовывается недостающими
//     связями — второй банк с теми же вопросами не создаётся;
//   * вопросы не дублируются, запуск идемпотентный.
//
// Запуск: node tools/portals/organize_topic_tests.mjs [--dry] [--subject=<uuid>|--all]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRY = process.argv.includes("--dry");
const ALL = process.argv.includes("--all");
const subjectArg = process.argv.find((a) => a.startsWith("--subject="))?.slice("--subject=".length) || "";

// Предметы, у которых темы занятия уже размечены в БД.
const KNOWN = {
  physiology: "6957e370-029e-4a9d-a6d2-fedf645328a9",
  histology: "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
};

function env() {
  const out = {};
  for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const clean = (title) => String(title || "").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();

(async () => {
  const e = env();
  const client = new pg.Client({
    connectionString: String(e.DB_URL).replace(/\?sslmode=\w+/, ""),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30000,
  });
  client.on("error", () => {});
  await client.connect();

  let subjects;
  if (subjectArg) {
    const row = (await client.query("select id, name from subjects where id=$1", [subjectArg])).rows[0];
    if (!row) throw new Error(`Предмет ${subjectArg} не найден`);
    subjects = [row];
  } else if (ALL) {
    subjects = (await client.query(
      `select distinct s.id, s.name from subjects s
       join modules m on m.subject_id = s.id
       join topics tp on tp.module_id = m.id
       where exists (select 1 from questions q where q.topic_id = tp.id and q.is_published and q.archived_at is null)
       order by s.name`,
    )).rows;
  } else {
    const wanted = Object.entries(KNOWN);
    subjects = [];
    for (const [slug, id] of wanted) {
      const row = (await client.query("select id, name from subjects where id=$1", [id])).rows[0];
      if (row) subjects.push(row);
      else console.warn(`пропуск ${slug}: ${id} не найден`);
    }
  }

  let createdTests = 0;
  let linked = 0;
  let filledTopics = 0;

  for (const subject of subjects) {
    const topics = (await client.query(
      `select tp.id, tp.title, tp.order_index, m.id module_id, m.title module_title
       from topics tp join modules m on m.id = tp.module_id
       where m.subject_id = $1
       order by m.order_index nulls last, tp.order_index nulls last, tp.title`,
      [subject.id],
    )).rows;

    // Всё нужное читаем тремя запросами: удалённый пулер отвечает медленно,
    // а по одному запросу на вопрос скрипт не успевал за разумное время.
    const questionsByTopic = new Map();
    for (const row of (await client.query(
      `select id, topic_id from questions
       where subject_id = $1 and topic_id is not null and is_published and archived_at is null
       order by created_at, id`,
      [subject.id],
    )).rows) {
      const key = String(row.topic_id);
      if (!questionsByTopic.has(key)) questionsByTopic.set(key, []);
      questionsByTopic.get(key).push(String(row.id));
    }
    const testByTopic = new Map();
    for (const row of (await client.query(
      "select id, topic_id from tests where subject_id = $1 and topic_id is not null order by created_at",
      [subject.id],
    )).rows) {
      if (!testByTopic.has(String(row.topic_id))) testByTopic.set(String(row.topic_id), String(row.id));
    }
    const linksByTest = new Map();
    for (const row of (await client.query(
      `select tq.test_id, tq.question_id from test_questions tq
       join tests te on te.id = tq.test_id where te.subject_id = $1`,
      [subject.id],
    )).rows) {
      const key = String(row.test_id);
      if (!linksByTest.has(key)) linksByTest.set(key, new Set());
      linksByTest.get(key).add(String(row.question_id));
    }

    let subjectCreated = 0;
    for (const topic of topics) {
      const questions = questionsByTopic.get(String(topic.id)) || [];
      if (!questions.length) continue;

      let testId = testByTopic.get(String(topic.id)) || null;
      if (!testId) {
        const title = clean(topic.title) || "Тест по теме занятия";
        if (DRY) {
          console.log(`  + тест «${title.slice(0, 60)}» — ${questions.length} вопр.`);
          subjectCreated += 1;
          filledTopics += 1;
          linked += questions.length;
          continue;
        }
        testId = String((await client.query(
          `insert into tests (subject_id, module_id, topic_id, title, is_published, source_key, order_index)
           values ($1,$2,$3,$4,true,$5,$6) returning id`,
          [subject.id, topic.module_id, topic.id, title, `topic-test:${topic.id}`, topic.order_index ?? 0],
        )).rows[0].id);
        testByTopic.set(String(topic.id), testId);
        createdTests += 1;
        subjectCreated += 1;
        filledTopics += 1;
      }

      const have = linksByTest.get(testId) || new Set();
      const missing = questions.filter((id) => !have.has(id));
      if (!missing.length) continue;
      if (DRY) { linked += missing.length; filledTopics += 1; continue; }
      const order = missing.map((_, i) => have.size + i);
      await client.query(
        `insert into test_questions (test_id, question_id, order_index)
         select $1::uuid, q, o from unnest($2::uuid[], $3::int[]) as t(q, o)`,
        [testId, missing, order],
      );
      for (const id of missing) have.add(id);
      linksByTest.set(testId, have);
      linked += missing.length;
      filledTopics += 1;
    }

    const { rows: [check] } = await client.query(
      `with t as (
         select tp.id from topics tp join modules m on m.id = tp.module_id where m.subject_id = $1
       )
       select (select count(*)::int from t) topics,
              (select count(*)::int from t where exists (select 1 from tests te where te.topic_id = t.id)) with_test,
              (select count(*)::int from questions q where q.subject_id = $1 and q.is_published and q.archived_at is null) questions`,
      [subject.id],
    );
    console.log(`${subject.name}: тем ${check.topics}, с тестом ${check.with_test}, вопросов ${check.questions}, новых тестов ${subjectCreated}`);
  }

  console.log(DRY ? "dry-run" : "готово", {
    createdTests,
    linked,
    filledTopics: filledTopics - createdTests,
  });
  await client.end();
})().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
