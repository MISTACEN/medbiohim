/**
 * Аудит повторов вопросов в банке Supabase. ТОЛЬКО ЧТЕНИЕ.
 *
 * Правило сравнения (v2, 2026-11-23):
 *   - ё → е, регистр, пробелы и пунктуация не различают вопросы;
 *   - дефис внутри слова снимается: «называ-ется» из PDF = «называется»;
 *   - ключ обрезается (btrim), иначе точка в конце даёт другой ключ;
 *   - вопросы-подписи к фотографиям исключены: у них одинаковый текст, ответ
 *     и варианты, а различает только изображение.
 *
 * Отчёт 2026-11-23 считал «активными» все строки с archived_at is null, то есть
 * включал 100 неопубликованных черновиков гистологии и фото-вопросы. Отсюда его
 * 1320/226/759 против фактических 1220/207/435.
 *
 * Запуск: node scripts/verify-question-duplicates.mjs [--json путь]
 */
import fs from "node:fs";
import pg from "pg";

try {
  process.loadEnvFile(".env.local");
} catch {
  console.error("Нет .env.local с DB_URL");
  process.exit(1);
}
const dbUrl = new URL(process.env.DB_URL || "");
dbUrl.searchParams.delete("sslmode");
if (!process.env.DB_URL) {
  console.error("Нет DB_URL в .env.local");
  process.exit(1);
}

const jsonIndex = process.argv.indexOf("--json");
const jsonPath = jsonIndex > -1 ? process.argv[jsonIndex + 1] : null;

const db = new pg.Client({ connectionString: dbUrl.toString(), ssl: { rejectUnauthorized: false } });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

const KEY = `btrim(lower(regexp_replace(
  replace(regexp_replace(coalesce(q.text, ''), '([0-9a-zA-Zа-яА-ЯёЁ])-([0-9a-zA-Zа-яА-ЯёЁ])', '\\1\\2', 'g'), 'ё', 'е'),
  '[^0-9a-zA-Zа-яА-Я]+', ' ', 'g')))`;
const ACTIVE = `q.archived_at is null and q.is_published`;
const NOT_PHOTO = `
  lower(coalesce(q.text, '')) not like '%изображен%'
  and lower(coalesce(q.text, '')) not like '%фотографи%'
  and lower(coalesce(q.text, '')) not like '%электронограмм%'
  and lower(coalesce(q.text, '')) not like '%на снимке%'
  and length(btrim(coalesce(q.text, ''))) > 12`;
const MARKED = `coalesce((
  select o->>'label' from jsonb_array_elements(coalesce(q.options, '[]'::jsonb)) o
   where (o->>'correct')::boolean is true limit 1), '<не отмечен>')`;
const OPTSET = `coalesce((
  select string_agg(coalesce(o->>'label','') || ':' || coalesce(o->>'correct','f'), '|' order by coalesce(o->>'label',''))
    from jsonb_array_elements(coalesce(q.options, '[]'::jsonb)) o), '')`;
// Набор подписей без флагов correct: две записи с одинаковыми вариантами, но
// разными отмеченными, — это один вопрос с расходящимся ключом.
const LABELSET = `coalesce((
  select string_agg(coalesce(o->>'label',''), '|' order by coalesce(o->>'label',''))
    from jsonb_array_elements(coalesce(q.options, '[]'::jsonb)) o), '')`;

const out = { generatedAt: new Date().toISOString(), rule: "v2: ё→е, btrim, дефис внутри слова, без фото-вопросов", subjects: {}, groups: {} };

console.log("== Активные вопросы ==");
const perSubject = await q(
  `select coalesce(s.slug,'(без предмета)') slug, count(*)::int n
     from questions q left join subjects s on s.id = q.subject_id
    where ${ACTIVE} group by 1 order by n desc`,
);
for (const r of perSubject) {
  console.log(`${r.slug}: ${r.n}`);
  out.subjects[r.slug] = r.n;
}

console.log("\n== Одинаковый текст ==");
const sameText = await q(
  `with base as (select q.id, q.subject_id, ${KEY} k from questions q where ${ACTIVE} and ${NOT_PHOTO})
   select coalesce(s.slug,'(без предмета)') slug, count(*)::int groups,
          sum(g.n)::int rows, sum(g.n - 1)::int extra
     from (select subject_id, k, count(*)::int n from base group by 1,2 having count(*) > 1) g
     left join subjects s on s.id = g.subject_id
    group by 1 order by extra desc`,
);
for (const r of sameText) console.log(`${r.slug}: ${r.groups} групп, ${r.rows} записей, ${r.extra} лишних`);

console.log("\n== Полные дубликаты (текст + type + answer + набор вариантов) ==");
const fullDup = await q(
  `with base as (
     select q.id, q.subject_id, ${KEY} k, q.type, coalesce(q.answer,'') a, ${OPTSET} o
       from questions q where ${ACTIVE} and ${NOT_PHOTO})
   select coalesce(s.slug,'(без предмета)') slug, count(*)::int groups,
          sum(g.n)::int rows, sum(g.n - 1)::int extra
     from (select subject_id, k, type, a, o, count(*)::int n from base group by 1,2,3,4,5 having count(*) > 1) g
     left join subjects s on s.id = g.subject_id
    group by 1 order by extra desc`,
);
for (const r of fullDup) console.log(`${r.slug}: ${r.groups} групп, ${r.rows} записей, ${r.extra} лишних`);

console.log("\n== Конфликт отмеченного ключа ==");
const conflicts = await q(
  `with base as (select q.id, q.subject_id, ${KEY} k, ${MARKED} m from questions q where ${ACTIVE} and ${NOT_PHOTO})
   select coalesce(s.slug,'(без предмета)') slug, count(*)::int groups, sum(g.n)::int rows,
          count(*) filter (where g.distinct_marked > 1)::int differing,
          count(*) filter (where g.unmarked > 0)::int with_unmarked
     from (select subject_id, k, count(*)::int n, count(distinct m)::int distinct_marked,
                  count(*) filter (where m = '<не отмечен>')::int unmarked
             from base group by 1,2 having count(*) > 1) g
     left join subjects s on s.id = g.subject_id
    where g.distinct_marked > 1 or g.unmarked > 0
    group by 1 order by groups desc`,
);
for (const r of conflicts) {
  console.log(`${r.slug}: ${r.groups} групп (${r.rows} записей), разные ключи: ${r.differing}, неотмеченные: ${r.with_unmarked}`);
}

console.log("\n== Настоящий конфликт: одинаковый текст и одинаковые варианты, разные ключи ==");
const trueConflict = await q(
  `with base as (
     select q.id, q.subject_id, ${KEY} k, ${MARKED} m, ${LABELSET} o
       from questions q where ${ACTIVE} and ${NOT_PHOTO})
   select coalesce(s.slug,'(без предмета)') slug, count(*)::int groups, sum(g.n)::int rows
     from (select subject_id, k, o, count(*)::int n, count(distinct m)::int dm
             from base group by 1,2,3 having count(*) > 1) g
     left join subjects s on s.id = g.subject_id
    where g.dm > 1
    group by 1 order by groups desc`,
);
for (const r of trueConflict) console.log(`${r.slug}: ${r.groups} групп, ${r.rows} записей`);

console.log("\n== Физиология: группы одинакового текста ==");
const phys = await q(
  `with base as (select q.id, ${KEY} k, q.text, ${MARKED} m
                   from questions q join subjects s on s.id=q.subject_id
                  where s.slug='physiology' and ${ACTIVE} and ${NOT_PHOTO})
   select k, array_agg(id::text order by id) ids, array_agg(distinct m) marked
     from base group by k having count(*) > 1 order by count(*) desc`,
);
for (const g of phys) console.log(`- ${g.ids.length} записей, ключ: ${JSON.stringify(g.marked)} → ${g.ids.map((i) => i.slice(0, 8)).join(", ")}`);
out.groups.physiology = phys;

// План чистки и запись выполняет scripts/apply-question-dedup.mjs.

if (jsonPath) {
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(`\nJSON: ${jsonPath}`);
}
await db.end();
