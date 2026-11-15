// «Полные тесты» физиологии в DB — перенос фич статического PhysiologyTests:
//   1. полный тест по каждой методичке (дедуп вопросов + детерминированный порядок);
//   2. мега-микс по всем методичкам (~2000 вопросов).
// Вопросы не создаются заново: скрипт только связывает уже импортированные
// questions (source_key phys_mcq:<sha1>, как в import_physiology_questions.mjs
// и organize_physiology_bank.mjs) с 8 опубликованными тестами.
// test_questions перезаписывается на каждом запуске — свежий пул и порядок.
//
// Запуск: node tools/portals/create_physiology_full_tests.mjs [--dry|--check]
//   --dry   — только счётчики по методичкам, без подключения к БД;
//   --check — только чтение: что уже лежит в БД по phys_full:*, без записи.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(REPO, "public", "content", "physiology");
const DRY = process.argv.includes("--dry");
const CHECK = process.argv.includes("--check");
const PHYSIOLOGY_SUBJECT = "6957e370-029e-4a9d-a6d2-fedf645328a9";
const MEGA_SLUG = "physiology";
const MEGA_TITLE = "Все тесты физиологии · мега-микс";

const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);

/** Ключ вопроса ровно как у импортёра: sha1 от текста в JSON (с хвостовым примечанием). */
const questionKey = (text) => `phys_mcq:${sha(`mcq:${text}`)}`;

function uniqueByText(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.text.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Тот же набор, что PhysiologyTests.manualQuestions(): занятия + банки методички. */
function manualQuestions(manual) {
  const rows = [];
  for (const lesson of manual.lessons || []) {
    for (const group of lesson.tests || []) {
      for (const q of group.questions || []) {
        rows.push({ text: String(q.text || "").trim() });
      }
    }
  }
  for (const bank of manual.banks || []) {
    for (const q of bank.questions || []) {
      rows.push({ text: String(q.text || "").trim() });
    }
  }
  return uniqueByText(rows.filter((row) => row.text.length >= 8));
}

function collect() {
  const index = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
  const manuals = index.manuals.map((meta) => {
    const manual = JSON.parse(fs.readFileSync(path.join(REPO, "public", meta.file), "utf8"));
    const title = manual.title || meta.title;
    return { slug: meta.slug, title, questions: manualQuestions(manual) };
  });
  const mega = uniqueByText(manuals.flatMap((manual) => manual.questions));
  return { manuals, mega };
}

function envFromLocalFile() {
  const env = {};
  const file = path.join(REPO, ".env.local");
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  if (!env.DB_URL) throw new Error("В .env.local нет DB_URL");
  return env;
}

async function main() {
  const { manuals, mega } = collect();
  const total = manuals.reduce((sum, manual) => sum + manual.questions.length, 0);
  console.log(`методичек: ${manuals.length} | вопросов по методичкам: ${total} | мега-микс: ${mega.length}`);
  for (const manual of manuals) {
    console.log(`  phys_full:${manual.slug} — ${manual.questions.length} · ${manual.title}`);
  }
  if (DRY) return;

  const client = new pg.Client({
    connectionString: envFromLocalFile().DB_URL.replace(/\?sslmode=\w+/, ""),
    ssl: { rejectUnauthorized: false },
  });
  client.on("error", () => {});
  await client.connect();

  if (CHECK) {
    const res = await client.query(
      `select t.source_key, t.title, t.is_published, count(tq.question_id)::int n
         from tests t left join test_questions tq on tq.test_id = t.id
        where t.subject_id = $1 and t.source_key like 'phys_full:%'
        group by t.id, t.source_key, t.title, t.is_published
        order by t.source_key`,
      [PHYSIOLOGY_SUBJECT],
    );
    for (const row of res.rows) {
      console.log(`${row.source_key} | ${row.n} | published=${row.is_published} | ${row.title}`);
    }
    console.log("тестов phys_full в БД:", res.rowCount);
    await client.end();
    return;
  }

  // Вопросы уже импортированы: только читаем их id по source_key.
  const qIdByKey = new Map(
    (
      await client.query(
        "select id, source_key from questions where subject_id=$1 and source_key like 'phys_mcq:%'",
        [PHYSIOLOGY_SUBJECT],
      )
    ).rows.map((row) => [row.source_key, row.id]),
  );
  console.log("вопросов phys_mcq в БД:", qIdByKey.size);

  const moduleRows = await client.query("select id,title from modules where subject_id=$1", [PHYSIOLOGY_SUBJECT]);
  const moduleIdByTitle = new Map(moduleRows.rows.map((row) => [row.title, row.id]));

  const plans = [
    { sourceKey: `phys_full:${MEGA_SLUG}`, title: MEGA_TITLE, moduleTitle: null, questions: mega },
    ...manuals.map((manual) => ({
      sourceKey: `phys_full:${manual.slug}`,
      title: `Полный тест · ${manual.title}`,
      moduleTitle: manual.title,
      questions: manual.questions,
    })),
  ];

  let created = 0;
  let linked = 0;
  const missingKeys = new Set();
  let order = 1;

  for (const plan of plans) {
    const moduleId = plan.moduleTitle ? moduleIdByTitle.get(plan.moduleTitle) || null : null;
    if (plan.moduleTitle && !moduleId) console.warn(`  ! модуль не найден: ${plan.moduleTitle}`);

    const existing = (
      await client.query("select id from tests where subject_id=$1 and source_key=$2 limit 1", [
        PHYSIOLOGY_SUBJECT,
        plan.sourceKey,
      ])
    ).rows[0];

    let testId = existing?.id;
    if (!testId) {
      const res = await client.query(
        `insert into tests (subject_id, module_id, topic_id, title, is_published, source_key, order_index)
         values ($1,$2,null,$3,true,$4,$5) returning id`,
        [PHYSIOLOGY_SUBJECT, moduleId, plan.title, plan.sourceKey, order],
      );
      testId = res.rows[0].id;
      created += 1;
    } else {
      await client.query(
        `update tests set title=$2, module_id=$3, is_published=true, order_index=$4 where id=$1`,
        [testId, plan.title, moduleId, order],
      );
    }
    order += 1;

    const pairs = [];
    for (const question of plan.questions) {
      const key = questionKey(question.text);
      const questionId = qIdByKey.get(key);
      if (questionId) pairs.push(questionId);
      else missingKeys.add(key);
    }

    // Свежий пул на каждый запуск: связи теста перезаписываются целиком.
    await client.query("delete from test_questions where test_id=$1", [testId]);
    const CHUNK = 200;
    let localLinked = 0;
    for (let i = 0; i < pairs.length; i += CHUNK) {
      const chunk = pairs.slice(i, i + CHUNK);
      const values = chunk.map((_, j) => `($1, $${j * 2 + 2}, $${j * 2 + 3})`);
      const params = [testId];
      chunk.forEach((questionId, j) => params.push(questionId, i + j));
      const res = await client.query(
        `insert into test_questions (test_id, question_id, order_index) values ${values.join(",")} on conflict do nothing`,
        params,
      );
      localLinked += res.rowCount;
    }
    linked += localLinked;
    console.log(`  ${plan.sourceKey} — связано ${localLinked} из ${plan.questions.length}`);
  }

  if (missingKeys.size) {
    console.warn(`вопросов без записи в БД: ${missingKeys.size} (сначала прогоните import_physiology_questions.mjs)`);
  }
  console.log("тестов создано:", created, "| связей записано:", linked);
  console.log(`итого тестов phys_full: ${plans.length}`);
  await client.end();
}

main().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
