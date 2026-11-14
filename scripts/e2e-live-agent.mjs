/** Живой E2E ночного агента: план, разборы, отметка, изоляция и RLS. */
import pg from "pg";
process.loadEnvFile(".env.local");
const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const anon = process.env.SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "";
const api = "https://medbiohim-api.ryazansevegor.workers.dev/api/v1";
const u = new URL(String(process.env.DB_URL || ""));
u.searchParams.delete("sslmode");
const db = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
await db.connect();

const day = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const created = [];

async function tempUser(tag) {
  const email = `${tag}+${Date.now()}@example.invalid`;
  const password = `T-${crypto.randomUUID()}`;
  const res = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await res.json();
  created.push(user.id);
  const grant = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { id: user.id, jwt: (await grant.json()).access_token };
}

async function call(path, { method = "GET", jwt, body } = {}) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text };
}

const owner = await tempUser("agent");
const stranger = await tempUser("agent-other");
const eventDate = day(14);

try {
  // --- ждём выкатку: до деплоя маршрута нет (501) ---------------------------
  let start = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    start = await call("/study-prep/agent", { method: "POST", jwt: owner.jwt, body: { subject_slug: "histology", event_date: eventDate } });
    console.log(`POST /agent try=${attempt} status=${start.status}`);
    if (start.status !== 501 && start.status !== 404) break;
    await new Promise((r) => setTimeout(r, 15000));
  }
  console.log("create:", JSON.stringify({ status: start.status, added: start.data?.data?.added, plan: start.data?.data?.plan?.id?.slice(0, 8) }));
  if (start.status !== 200) {
    console.log("body:", start.text.slice(0, 240));
    throw new Error("agent route not deployed");
  }

  const planId = start.data.data.plan.id;
  const rows = await db.query(
    "select day, question_text, answer, topic, done, position from public.study_agent_items where plan_id=$1 order by position",
    [planId],
  );
  console.log("db items:", rows.rowCount, "day:", rows.rows[0]?.day, "today:", day(), "with_answer:", rows.rows.filter((r) => r.answer).length);
  console.log("first:", JSON.stringify({ topic: rows.rows[0]?.topic, q: String(rows.rows[0]?.question_text).slice(0, 60) }));
  console.log("unique texts:", new Set(rows.rows.map((r) => r.question_text)).size === rows.rowCount);

  // --- идемпотентность -----------------------------------------------------
  const repeat = await call("/study-prep/agent", { method: "POST", jwt: owner.jwt, body: { subject_slug: "histology", event_date: eventDate } });
  const again = await db.query("select count(*)::int n from public.study_agent_items where plan_id=$1", [planId]);
  console.log("repeat:", repeat.status, "added:", repeat.data?.data?.added, "total:", again.rows[0].n, "same plan:", repeat.data?.data?.plan?.id === planId);

  // --- чтение и отметка ----------------------------------------------------
  const list = await call("/study-prep/agent", { jwt: owner.jwt });
  const plan = list.data?.data?.plans?.[0];
  console.log("list:", list.status, JSON.stringify({ plans: list.data?.data?.plans?.length, today: plan?.today?.total, done: plan?.today?.done, tomorrow: plan?.tomorrow?.total, days_left: plan?.days_left }));

  const itemId = plan.today.items[0].id;
  const mark = await call(`/study-prep/agent/items/${itemId}`, { method: "PATCH", jwt: owner.jwt, body: { done: true } });
  const after = await call("/study-prep/agent", { jwt: owner.jwt });
  console.log("mark:", mark.status, "done:", after.data?.data?.plans?.[0]?.today?.done);

  // --- чужой пункт ---------------------------------------------------------
  const foreign = await call(`/study-prep/agent/items/${itemId}`, { method: "PATCH", jwt: stranger.jwt, body: { done: false } });
  const stillDone = await db.query("select done from public.study_agent_items where id=$1", [itemId]);
  console.log("stranger PATCH:", foreign.status, "item still done:", stillDone.rows[0].done);

  // --- RLS: чужие строки не видны, колонки кроме done не меняются ----------
  const strangerRead = await fetch(`${base}/rest/v1/study_agent_items?select=id&plan_id=eq.${planId}`, {
    headers: { apikey: anon, Authorization: `Bearer ${stranger.jwt}` },
  });
  console.log("stranger rows visible:", (await strangerRead.json()).length);

  const tamper = await fetch(`${base}/rest/v1/study_agent_items?id=eq.${itemId}`, {
    method: "PATCH",
    headers: { apikey: anon, Authorization: `Bearer ${owner.jwt}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ question_text: "подмена" }),
  });
  const tampered = await db.query("select question_text from public.study_agent_items where id=$1", [itemId]);
  console.log("tamper status:", tamper.status, "text intact:", tampered.rows[0].question_text !== "подмена");

  const anonRead = await fetch(`${base}/rest/v1/study_agent_items?select=id&plan_id=eq.${planId}`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  const anonRows = await anonRead.json().catch(() => []);
  console.log("anon rows:", Array.isArray(anonRows) ? anonRows.length : anonRead.status);
} finally {
  for (const id of created) {
    await fetch(`${base}/auth/v1/admin/users/${id}`, {
      method: "DELETE",
      headers: { apikey: service, Authorization: `Bearer ${service}` },
    }).catch(() => {});
  }
  const left = await db.query(
    "select (select count(*) from public.study_agent_items where user_id = any($1::uuid[]))::int items, (select count(*) from public.study_plans where user_id = any($1::uuid[]))::int plans",
    [created],
  );
  console.log("после удаления пользователей осталось:", JSON.stringify(left.rows[0]));
  await db.end();
}
