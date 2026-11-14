/**
 * Живой E2E фаз 4 и 6 (по образцу scripts/e2e-live-supabase.mjs).
 *
 * Что проверяет на реальном production-стеке, а не по коду:
 *  1) POST /lectures/:id/cloze создаёт пропуски на опубликованной лекции физиологии
 *     и пишет их в site_content (ключ cloze:v1:<lecture_id>);
 *  2) GET /lectures/:id/cloze отдаёт их из кэша;
 *  3) POST /srs/cards кладёт ошибку конспекта в srs_cards этого пользователя
 *     и карточка сразу видна в /srs/due;
 *  4) POST /study-prep/plan/:id/compress двигает due_at карточек предмета на день
 *     накануне события, не трогая другие предметы и ничего не откладывая.
 *
 * Секреты берутся из .env.local, в stdout не печатаются. Временный пользователь
 * и его строки удаляются в finally.
 */
import assert from "node:assert/strict";
import pg from "pg";

process.loadEnvFile(".env.local");

const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const anon = process.env.SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "";
const api = (process.env.WORKER_API_URL || "https://medbiohim-api.ryazansevegor.workers.dev/api/v1").replace(/\/$/, "");
const proxy = "https://medbiohim.vercel.app/api/v1";
if (!base || !anon || !service) {
  console.error("Нужны SUPABASE_URL, SUPABASE_ANON_KEY и SUPABASE_SERVICE_KEY/SECRET_KEY");
  process.exit(1);
}

const dbUrl = new URL(String(process.env.DB_URL || ""));
dbUrl.searchParams.delete("sslmode");

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ ok: true, name });
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    results.push({ ok: false, name, error });
    console.log(`✗ ${name} — ${error.message}`);
  }
}

async function rest(path, { method = "GET", token, key = service, body, prefer } = {}) {
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data };
}

async function callApi(url, path, { method = "GET", token, body, timeout = 30000 } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

/** Тот же анти-галлюцинационный критерий, что у сервера, но проверенный снаружи. */
const squash = (value) => String(value || "").replace(/\s+/g, " ").trim();

const db = new pg.Client({ connectionString: dbUrl.toString(), ssl: { rejectUnauthorized: false } });
await db.connect();

let tempUser = null;
let lectureId = null;
let clozeItems = 0;
try {
  // --- временный пользователь и настоящий JWT ---------------------------------
  const email = `e2e-cloze+${Date.now()}@example.invalid`;
  const password = `E2e-${crypto.randomUUID()}`;
  const created = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.ok(created.ok, `admin create ${created.status}`);
  tempUser = await created.json();

  const grant = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.ok(grant.ok, `password grant ${grant.status}`);
  const session = await grant.json();
  const jwt = session.access_token;
  assert.ok(jwt, "нет access_token");
  console.log(`· временный пользователь создан, JWT получен (${jwt.split(".").length} сегмента)`);

  // --- лекция физиологии, которую реально читают -------------------------------
  const lectureRow = await db.query(
    `select id, title, length(body_markdown) as len
       from public.histology_lectures
      where is_published = true and subject_slug = 'physiology' and body_markdown is not null and length(body_markdown) > 1200
      and not exists (select 1 from public.site_content sc where sc.key = 'cloze:v1:' || histology_lectures.id)
      order by length(body_markdown) desc limit 1`,
  );
  assert.equal(lectureRow.rowCount, 1, "нет опубликованной лекции физиологии без кэша");
  lectureId = lectureRow.rows[0].id;
  console.log(`· лекция: «${lectureRow.rows[0].title}» (${lectureRow.rows[0].len} символов)`);

  // --- 1. генерация пропусков на живом ИИ --------------------------------------
  await check("POST /lectures/:id/cloze генерирует пропуски на живой лекции", async () => {
    const cachedBefore = await rest(`site_content?select=key&key=eq.cloze:v1:${lectureId}`, { key: service });
    const wasCached = cachedBefore.ok && cachedBefore.data.length > 0;

    const r = await callApi(api, `/lectures/${lectureId}/cloze`, { method: "POST", token: jwt, timeout: 150000 });
    assert.notEqual(r.data?.data?.provider, "cloudflare", "сработал медленный ИИ-фолбэк вместо разметки");
    assert.equal(r.status, 200, `HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 240)}`);
    const items = r.data?.data?.items || [];
    assert.ok(items.length >= 4, `пропусков ${items.length}`);
    assert.equal(r.data.data.cached, wasCached, `cached=${r.data.data.cached} при наличии кэша ${wasCached}`);
    assert.equal(r.data.data.lecture_id, lectureId);
    clozeItems = items.length;
    return `${items.length} пунктов, cached=${r.data.data.cached}, провайдер ${r.data.data.provider || "?"}, впервые=${!wasCached}`;
  });

  // --- 2. анти-галлюцинация: цитаты дословные ---------------------------------
  await check("каждый пропуск — дословная цитата из текста лекции", async () => {
    const row = await db.query("select body_markdown from public.histology_lectures where id = $1", [lectureId]);
    const text = String(row.rows[0].body_markdown || "");
    const cached = await rest(`site_content?select=payload&key=eq.cloze:v1:${lectureId}`, { key: service });
    assert.ok(cached.ok && cached.data.length === 1, "нет строки кэша");
    const items = cached.data[0].payload.items || [];
    assert.ok(items.length >= 4, `в кэше ${items.length}`);
    // Сервер сравнивает без markdown-разметки, пробелов и пунктуации — проверяем
    // так же (цитата может быть разрезана посреди слова),
    // плюс требуем, чтобы ответ реально был выделенным термином лекции.
    const squash = (value) => String(value).toLowerCase().replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9]+/g, "");
    const plain = text.replace(/\*\*/g, "");
    const haystack = squash(plain);
    for (const item of items) {
      const needle = squash(`${item.before}${item.answer}${item.after}`);
      assert.ok(needle.length > 15, "слишком короткая цитата");
      assert.ok(haystack.includes(needle), `не найдено в тексте: ${needle.slice(0, 70)}…`);
      assert.ok(text.includes(`**${item.answer}**`), `ответ не выделен в лекции: ${item.answer}`);
    }
    return `${items.length} цитат дословно, все ответы — выделенные термины`;
  });

  // --- 3. кэш: GET без ожидания ИИ -------------------------------------------
  await check("GET /lectures/:id/cloze отдаёт кэш, в том числе через прокси Vercel", async () => {
    const direct = await callApi(api, `/lectures/${lectureId}/cloze`, { token: jwt });
    assert.equal(direct.status, 200, `worker HTTP ${direct.status}`);
    assert.equal(direct.data.data.cached, true);
    assert.equal(direct.data.data.items.length, clozeItems);
    const viaProxy = await callApi(proxy, `/lectures/${lectureId}/cloze`, { token: jwt });
    assert.equal(viaProxy.status, 200, `proxy HTTP ${viaProxy.status}`);
    assert.equal(viaProxy.data.data.cached, true);
    return `worker 200 cached, прокси 200 cached, ${clozeItems} пунктов`;
  });

  // --- 4. кэш лежит в site_content с провайдером ------------------------------
  await check("site_content хранит cloze:v1:<lecture_id> с payload и updated_at", async () => {
    const row = await db.query(
      "select key, payload, updated_at from public.site_content where key = $1",
      [`cloze:v1:${lectureId}`],
    );
    assert.equal(row.rowCount, 1, "нет строки cloze:v1:<id>");
    const payload = row.rows[0].payload;
    assert.ok(Array.isArray(payload.items) && payload.items.length >= 4);
    assert.ok(payload.generated_at && payload.provider, "нет generated_at/provider");
    return `${payload.items.length} пунктов, provider=${payload.provider}, model=${payload.model}`;
  });

  // --- 5. ошибка конспекта → карточка SRS ------------------------------------
  await check("POST /srs/cards кладёт ошибку конспекта в личные карточки", async () => {
    const cached = await rest(`site_content?select=payload&key=eq.cloze:v1:${lectureId}`, { key: service });
    const item = (cached.data[0].payload.items || [])[0];
    assert.ok(item, "нет пункта для карточки");
    const front = `${item.before}___${item.after}`.slice(0, 400);
    const r = await callApi(api, "/srs/cards", {
      method: "POST",
      token: jwt,
      body: { front, back: item.answer, subject_slug: "physiology", topic: "Конспект с пропусками" },
    });
    assert.ok([200, 201].includes(r.status), `HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    const cardId = r.data?.data?.id || r.data?.data?.card?.id;
    assert.ok(cardId, "нет id карточки в ответе");

    const row = await db.query(
      "select user_id, front, back, source_type, subject_slug, topic, due_at from public.srs_cards where id = $1",
      [cardId],
    );
    assert.equal(row.rowCount, 1, "карточки нет в базе");
    assert.equal(String(row.rows[0].user_id), tempUser.id, "карточка записана не моему пользователю");
    assert.equal(row.rows[0].source_type, "personal");
    assert.equal(row.rows[0].subject_slug, "physiology");
    assert.equal(row.rows[0].back, item.answer, "ответ карточки не совпал");

    const due = await callApi(api, "/srs/due?limit=50", { token: jwt });
    assert.equal(due.status, 200, `due HTTP ${due.status}`);
    const ids = (due.data.data.items || []).map((card) => card.id);
    assert.ok(ids.includes(cardId), "карточка не попала в /srs/due");
    return `карточка ${cardId.slice(0, 8)}… в базе и в /srs/due (${ids.length} на повторение)`;
  });

  // --- 6. compress двигает due_at --------------------------------------------
  const eventDate = "2026-12-01";
  await check("POST /study-prep/plan/:id/compress двигает due_at, а не moved:0", async () => {
    const planInsert = await rest("study_plans", {
      method: "POST",
      body: { user_id: tempUser.id, subject_slug: "physiology", event_date: eventDate, topics: [] },
      prefer: "return=representation",
    });
    assert.ok(planInsert.ok, `insert plan ${planInsert.status}: ${JSON.stringify(planInsert.data)}`);
    const planId = planInsert.data[0].id;

    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const seeded = await rest("srs_cards", {
      method: "POST",
      prefer: "return=representation",
      body: [
        { user_id: tempUser.id, source_type: "personal", front: "phys A", back: "A", subject_slug: "physiology", topic: "t1", ease: 2.5, interval: 5, reps: 2, due_at: future },
        { user_id: tempUser.id, source_type: "personal", front: "phys B", back: "B", subject_slug: "physiology", topic: "t2", ease: 2.5, interval: 5, reps: 2, due_at: future },
        { user_id: tempUser.id, source_type: "personal", front: "hist C", back: "C", subject_slug: "histology", topic: "t3", ease: 2.5, interval: 5, reps: 2, due_at: future },
      ],
    });
    assert.ok(seeded.ok, `seed cards ${seeded.status}: ${JSON.stringify(seeded.data)}`);

    const r = await callApi(api, `/study-prep/plan/${planId}/compress`, { method: "POST", token: jwt });
    assert.equal(r.status, 200, `HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    assert.equal(r.data.data.moved, 2, `moved=${r.data.data.moved}, ожидалось 2 (только физиология)`);
    assert.equal(r.data.data.scope, "subject");
    // 2026-12-01 минус день = 2026-11-30T00:00:00Z
    assert.equal(r.data.data.target_due, "2026-11-30T00:00:00.000Z", `target_due=${r.data.data.target_due}`);

    const rows = await db.query(
      "select front, subject_slug, due_at from public.srs_cards where user_id = $1 and front in ('phys A','phys B','hist C') order by front",
      [tempUser.id],
    );
    assert.equal(rows.rowCount, 3);
    for (const row of rows.rows) {
      const due = new Date(row.due_at).toISOString();
      if (row.subject_slug === "physiology") {
        assert.equal(due, "2026-11-30T00:00:00.000Z", `${row.front}: due_at=${due}`);
      } else {
        assert.notEqual(due, "2026-11-30T00:00:00.000Z", "чужая карточка сдвинута");
      }
    }
    const again = await callApi(api, `/study-prep/plan/${planId}/compress`, { method: "POST", token: jwt });
    assert.equal(again.status, 200);
    assert.equal(again.data.data.moved, 0, "повторное сжатие должно быть идемпотентным");
    return "moved 2 (физиология), histology не тронута, повторно 0, target 2026-11-30T00:00:00Z";
  });
} finally {
  if (tempUser?.id) {
    await fetch(`${base}/auth/v1/admin/users/${tempUser.id}`, {
      method: "DELETE",
      headers: { apikey: service, Authorization: `Bearer ${service}` },
    }).catch(() => {});
    const left = await db
      .query("select (select count(*) from public.srs_cards where user_id=$1)::int cards, (select count(*) from public.study_plans where user_id=$1)::int plans", [tempUser.id])
      .catch(() => ({ rows: [{ cards: -1, plans: -1 }] }));
    console.log(`· временный пользователь удалён; осталось карточек ${left.rows[0].cards}, планов ${left.rows[0].plans}`);
    if (left.rows[0].cards > 0 || left.rows[0].plans > 0) {
      await db.query("delete from public.srs_cards where user_id=$1", [tempUser.id]).catch(() => {});
      await db.query("delete from public.study_plans where user_id=$1", [tempUser.id]).catch(() => {});
      const after = await db.query("select (select count(*) from public.srs_cards where user_id=$1)::int cards, (select count(*) from public.study_plans where user_id=$1)::int plans", [tempUser.id]);
      console.log(`· добито вручную: карточек ${after.rows[0].cards}, планов ${after.rows[0].plans}`);
    }
  }
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\nИтог: ${results.length - failed.length}/${results.length} проверок пройдено`);
if (failed.length) process.exitCode = 1;
