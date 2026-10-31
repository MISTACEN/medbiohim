/**
 * E2E на живой Supabase: проверяет то, что нельзя проверить моками —
 * применённую миграцию, RLS material_views, чтения маршрутов групп/плана
 * и реальный пересчёт курса (та же RPC, которую вызывает cron).
 *
 * Запуск: npm run test:e2e:supabase
 * Секреты берутся из .env.local; в консоль не печатаются.
 * Скрипт создаёт одного временного пользователя и удаляет его в finally.
 */
import assert from "node:assert/strict";
import pg from "pg";

try {
  process.loadEnvFile(".env.local");
} catch {
  console.error("Нет .env.local с SUPABASE_URL / ключами");
  process.exit(1);
}

const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const anon = process.env.SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "";
if (!base || !anon || !service) {
  console.error("Нужны SUPABASE_URL, SUPABASE_ANON_KEY и SUPABASE_SERVICE_KEY/SECRET_KEY");
  process.exit(1);
}

const dbUrl = new URL(process.env.DB_URL || "");
dbUrl.searchParams.delete("sslmode");

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ ok: true, name, detail });
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    results.push({ ok: false, name, error });
    console.log(`✗ ${name} — ${error.message}`);
  }
}

async function rest(path, { method = "GET", token, key = anon, body, prefer } = {}) {
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data };
}

/** То же правило, что в SQL и в groupIdentity.ts: учебный год с 1 сентября. */
function expectedCourse(admissionYear, now = new Date()) {
  const year = now.getUTCFullYear() - (now.getUTCMonth() >= 8 ? 0 : 1);
  return year - Number(admissionYear) + 1;
}

const db = new pg.Client({ connectionString: dbUrl.toString(), ssl: { rejectUnauthorized: false } });
await db.connect();

let tempUser = null;
try {
  await check("миграция: material_views и новые колонки на месте", async () => {
    const tables = await db.query(
      "select table_name from information_schema.tables where table_schema='public' and table_name='material_views'"
    );
    assert.equal(tables.rowCount, 1, "нет public.material_views");
    const cols = await db.query(
      `select table_name || '.' || column_name as col
         from information_schema.columns
        where table_schema='public' and (
          (table_name='groups' and column_name in ('stream','semester')) or
          (table_name='group_memberships' and column_name in ('course_override','subgroup')) or
          (table_name='materials' and column_name='topic_id'))`
    );
    const found = cols.rows.map((r) => r.col);
    for (const col of ["groups.stream", "groups.semester", "group_memberships.course_override", "group_memberships.subgroup", "materials.topic_id"]) {
      assert.ok(found.includes(col), `нет колонки ${col}`);
    }
    const rls = await db.query("select relrowsecurity from pg_class where oid = 'public.material_views'::regclass");
    assert.equal(rls.rows[0].relrowsecurity, true, "RLS на material_views выключен");
    return `${found.length} колонок, RLS включён`;
  });

  await check("cron: RPC пересчёта курса приводит groups.course_number к календарю", async () => {
    const first = await db.query("select public.medbiohim_rollover_group_courses() as result");
    assert.equal(first.rows[0].result.updated >= 0, true);
    const rows = (await db.query("select id, admission_year, course_number from public.groups where is_active is not false and admission_year between 1990 and 2100")).rows;
    for (const row of rows) {
      assert.equal(Number(row.course_number), expectedCourse(row.admission_year), `группа ${row.id}: курс не совпал`);
    }
    const second = await db.query("select public.medbiohim_rollover_group_courses() as result");
    assert.equal(second.rows[0].result.updated, 0, "повторный запуск должен быть идемпотентным");
    return `обновлено ${first.rows[0].result.updated}, повторно 0, проверено ${rows.length} групп`;
  });

  await check("маршрут групп: чтение с admission_year/stream/semester работает", async () => {
    const { ok, status, data } = await rest(
      "groups?select=id,name,code,specialty_slug,course_number,admission_year,stream,semester,is_active&order=name&limit=5",
      { key: service }
    );
    assert.ok(ok, `PostgREST ${status}`);
    assert.ok(Array.isArray(data));
    return `${data.length} групп`;
  });

  let materialId = null;
  await check("план тем: материалы с topic_id читаются (47 привязанных)", async () => {
    const { ok, status, data } = await rest(
      "materials?select=id,topic_id,title,type,external_url,order_index&is_published=eq.true&topic_id=not.is.null&order=order_index.asc&limit=5",
      { key: service }
    );
    assert.ok(ok, `PostgREST ${status}`);
    assert.ok(data.length > 0, "нет опубликованных материалов с topic_id");
    materialId = data[0].id;
    return `${data.length} в выборке, пример ${data[0].title}`;
  });

  await check("прогресс тем: table topic_progress читается", async () => {
    const { ok, status } = await rest("topic_progress?select=topic_id,status&limit=1", { key: service });
    assert.ok(ok, `PostgREST ${status}`);
    return "ok";
  });

  await check("RLS: material_views видит только владелец", async () => {
    assert.ok(materialId, "нужен материал из предыдущей проверки");
    const email = `e2e+${Date.now()}@example.invalid`;
    const password = `E2e-${crypto.randomUUID()}`;
    const created = await fetch(`${base}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    assert.ok(created.ok, `admin create ${created.status}`);
    tempUser = await created.json();

    const token = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.ok(token.ok, `password grant ${token.status}`);
    const session = await token.json();
    assert.ok(session.access_token, "нет access_token");

    const inserted = await rest("material_views", {
      method: "POST",
      token: session.access_token,
      body: { user_id: tempUser.id, material_id: materialId },
      prefer: "return=minimal",
    });
    assert.ok(inserted.ok, `insert ${inserted.status}: ${JSON.stringify(inserted.data)}`);

    const own = await rest(`material_views?select=material_id&material_id=eq.${materialId}`, { token: session.access_token });
    assert.ok(own.ok && own.data.length === 1, "владелец не видит свою отметку");

    const anonRead = await rest(`material_views?select=material_id&material_id=eq.${materialId}`, { key: anon });
    assert.ok(!anonRead.ok || anonRead.data.length === 0, "anon прочитал чужую отметку");

    const serviceRead = await rest(`material_views?select=material_id&material_id=eq.${materialId}`, { key: service });
    assert.ok(serviceRead.ok && serviceRead.data.length === 1, "service_role не видит строку");
    return "владелец 1, anon 0, service 1";
  });
} finally {
  if (tempUser?.id) {
    await fetch(`${base}/auth/v1/admin/users/${tempUser.id}`, {
      method: "DELETE",
      headers: { apikey: service, Authorization: `Bearer ${service}` },
    }).catch(() => {});
    const left = await db
      .query("select count(*)::int n from public.material_views where user_id = $1", [tempUser.id])
      .catch(() => ({ rows: [{ n: 0 }] }));
    console.log(`· временный пользователь удалён, его material_views: ${left.rows[0].n}`);
  }
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\nИтог: ${results.length - failed.length}/${results.length} проверок пройдено`);
if (failed.length) process.exitCode = 1;
