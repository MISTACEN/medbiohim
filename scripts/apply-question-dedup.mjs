/**
 * Чистка полных дубликатов вопросов: копия скрывается (is_published=false),
 * а не удаляется.
 *
 * Почему не delete: у questions внешние ключи test_answers, user_question_states,
 * test_preparation_results, test_questions, question_comments — ON DELETE CASCADE.
 * Удаление строки стёрло бы ответы и прогресс студентов. Снятие публикации
 * убирает вопрос из банка и оставляет историю.
 *
 * Копия скрывается, если совпадают текст (с точностью до регистра, пунктуации и
 * переносов из PDF), тип, поле answer и набор вариантов. Если копия входит в тест,
 * которого нет у канонической записи, канон сначала добавляется в этот тест на
 * место копии (--carry), иначе тест потерял бы вопрос.
 *
 * Запуск:
 *   node scripts/apply-question-dedup.mjs             # план, ничего не меняет
 *   node scripts/apply-question-dedup.mjs --apply     # скрыть копии с общими тестами
 *   node scripts/apply-question-dedup.mjs --apply --carry  # плюс перенос канона в тест
 *   node scripts/apply-question-dedup.mjs --revert <лог>
 */
import fs from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.local");
const u = new URL(process.env.DB_URL || "");
u.searchParams.delete("sslmode");
const db = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
await db.connect();
const q = async (s, p = []) => (await db.query(s, p)).rows;

const argv = process.argv.slice(2);
const archiveIndex = argv.indexOf("--archive-ids");
const mode = argv.includes("--revert") ? "revert" : argv.includes("--apply") ? "apply" : archiveIndex > -1 ? "archive" : "plan";
const carry = argv.includes("--carry");
const revertPath = argv[argv.indexOf("--revert") + 1];
const archiveIds = archiveIndex > -1 ? String(argv[archiveIndex + 1] || "").split(",").map((s) => s.trim()).filter(Boolean) : [];

const KEY = `btrim(lower(regexp_replace(
  replace(regexp_replace(coalesce(q.text, ''), '([0-9a-zA-Zа-яА-ЯёЁ])-([0-9a-zA-Zа-яА-ЯёЁ])', '\\1\\2', 'g'), 'ё', 'е'),
  '[^0-9a-zA-Zа-яА-Я]+', ' ', 'g')))`;
const OPTSET = `coalesce((
  select string_agg(coalesce(o->>'label','') || ':' || coalesce(o->>'correct','f'), '|' order by coalesce(o->>'label',''))
    from jsonb_array_elements(coalesce(q.options, '[]'::jsonb)) o), '')`;
const NOT_PHOTO = `
  lower(coalesce(q.text, '')) not like '%изображен%'
  and lower(coalesce(q.text, '')) not like '%фотографи%'
  and lower(coalesce(q.text, '')) not like '%электронограмм%'
  and lower(coalesce(q.text, '')) not like '%на снимке%'
  and length(btrim(coalesce(q.text, ''))) > 12`;

if (mode === "revert") {
  if (!revertPath || !fs.existsSync(revertPath)) {
    console.error("Укажи файл лога: --revert tmp/dedup-applied-*.json");
    process.exit(1);
  }
  const log = JSON.parse(fs.readFileSync(revertPath, "utf8"));
  const ids = (log.hidden || []).map((h) => h.id);
  const links = log.inserted || [];
  const archived = (log.archived || []).map((a) => a.id);
  await db.query("begin");
  try {
    for (const link of links) {
      await db.query(`delete from test_questions where test_id = $1::uuid and question_id = $2::uuid`, [link.test, link.question]);
    }
    const res = ids.length
      ? await db.query(`update questions set is_published = true where id = any($1::uuid[])`, [ids])
      : { rowCount: 0 };
    const back = archived.length
      ? await db.query(`update questions set archived_at = null where id = any($1::uuid[])`, [archived])
      : { rowCount: 0 };
    await db.query("commit");
    console.log(`Возвращено в банк: ${res.rowCount}; расархивировано: ${back.rowCount}; снято перенесённых связей: ${links.length}`);
  } catch (error) {
    await db.query("rollback");
    console.error("Откат:", error.message);
  }
  await db.end();
  process.exit(0);
}

// Строки методички, попавшие в банк как «открытые задания» (например «Оценить
// уровень самоподготовки…»): это не вопрос, его место — в архиве.
if (mode === "archive") {
  if (!archiveIds.length) {
    console.error("Укажи id через запятую: --archive-ids id1,id2");
    process.exit(1);
  }
  await db.query("begin");
  const res = await db.query(
    `update questions set archived_at = now()
      where id = any($1::uuid[]) and archived_at is null and is_published = true`,
    [archiveIds],
  );
  await db.query("commit");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = `tmp/dedup-archived-${stamp}.json`;
  fs.writeFileSync(logPath, JSON.stringify({
    appliedAt: new Date().toISOString(),
    hidden: [], inserted: [],
    archived: archiveIds.map((id) => ({ id })),
  }, null, 2));
  console.log(`Архивировано: ${res.rowCount}; лог: ${logPath}`);
  console.log(`Откат: node scripts/apply-question-dedup.mjs --revert ${logPath}`);
  await db.end();
  process.exit(0);
}

const rows = await q(
  `with base as (
     select q.id, q.subject_id, coalesce(s.slug,'—') slug, ${KEY} k, q.type,
            coalesce(q.answer,'') a, ${OPTSET} o, q.created_at, left(q.text, 70) text,
            (select count(*)::int from test_questions tq where tq.question_id = q.id) linked,
            (select coalesce(json_agg(json_build_object('test', tq.test_id, 'order', tq.order_index)
                                      order by tq.test_id), '[]'::json)
               from test_questions tq where tq.question_id = q.id) tests
       from questions q join subjects s on s.id = q.subject_id
      where q.is_published and q.archived_at is null and ${NOT_PHOTO}),
   dups as (select subject_id, k, type, a, o from base group by 1,2,3,4,5 having count(*) > 1)
   select b.* from base b join dups d
     on d.subject_id=b.subject_id and d.k=b.k and d.type=b.type and d.a=b.a and d.o=b.o
    order by b.slug, b.k, b.linked desc, b.created_at asc, b.id`,
);

const groups = new Map();
for (const r of rows) {
  const key = `${r.subject_id}|${r.k}|${r.type}|${r.a}|${r.o}`;
  const list = groups.get(key) ?? [];
  list.push(r);
  groups.set(key, list);
}

const hidden = [];
const inserted = [];
const skipped = [];
for (const [, list] of groups) {
  // Канон: больше связей с тестами, затем более ранняя запись.
  const sorted = [...list].sort((x, y) => y.linked - x.linked || new Date(x.created_at) - new Date(y.created_at));
  const keep = sorted[0];
  const keepTests = new Set((keep.tests || []).map((t) => t.test));
  for (const copy of sorted.slice(1)) {
    const missing = (copy.tests || []).filter((t) => !keepTests.has(t.test));
    if (missing.length && !carry) {
      skipped.push({ id: copy.id, slug: copy.slug, keepId: keep.id, tests: missing.map((t) => t.test) });
      continue;
    }
    hidden.push({ id: copy.id, slug: copy.slug, keepId: keep.id, text: copy.text });
    for (const t of missing) inserted.push({ test: t.test, question: keep.id, order: t.order });
  }
}

const bySubject = new Map();
for (const h of hidden) bySubject.set(h.slug, (bySubject.get(h.slug) || 0) + 1);
console.log(`Групп полных дублей: ${groups.size}`);
console.log(`К скрытию: ${hidden.length} (${[...bySubject].map(([s, n]) => `${s}: ${n}`).join(", ") || "—"})`);
console.log(`Перенести канон в тесты копии: ${inserted.length}`);
console.log(`Оставлено копий без переноса: ${skipped.length}`);

if (mode === "plan") {
  console.log("\nНичего не изменено. Для записи: --apply [--carry]");
  await db.end();
  process.exit(0);
}
if (!hidden.length) {
  console.log("\nНечего скрывать.");
  await db.end();
  process.exit(0);
}

const count = async () =>
  new Map(
    (await q(`select coalesce(s.slug,'—') slug, count(*)::int n from questions q
                left join subjects s on s.id=q.subject_id
               where q.is_published and q.archived_at is null group by 1`)).map((r) => [r.slug, r.n]),
  );
const before = await count();

await db.query("begin");
try {
  for (const link of inserted) {
    await db.query(
      `insert into test_questions (test_id, question_id, order_index)
       values ($1::uuid, $2::uuid, $3)
       on conflict (test_id, question_id) do nothing`,
      [link.test, link.question, link.order],
    );
  }
  const res = await db.query(
    `update questions set is_published = false
      where id = any($1::uuid[]) and is_published = true and archived_at is null`,
    [hidden.map((h) => h.id)],
  );
  await db.query("commit");
  console.log(`\nСнято с публикации: ${res.rowCount}; добавлено связей с тестами: ${inserted.length}`);
} catch (error) {
  await db.query("rollback");
  console.error("Откат, ничего не изменено:", error.message);
  await db.end();
  process.exit(1);
}

const after = await count();
console.log("\nБанк до → после:");
for (const [slug, n] of after) console.log(`  ${slug}: ${before.get(slug) ?? 0} → ${n}`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logPath = `tmp/dedup-applied-${stamp}.json`;
fs.writeFileSync(logPath, JSON.stringify({ appliedAt: new Date().toISOString(), hidden, inserted, skipped, archived: [] }, null, 2));
console.log(`\nЛог: ${logPath}`);
console.log(`Откат: node scripts/apply-question-dedup.mjs --revert ${logPath}`);

await db.end();
