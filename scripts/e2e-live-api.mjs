/**
 * E2E маршрутов Worker на живой Supabase: поднимаем настоящий Hono-апп
 * (тот же код, что деплоится) в Node и дергаем новые маршруты с реальным
 * пользователем, группами, темой и материалом.
 *
 * Запуск: npm run test:e2e:api  (нужен .env.local)
 * Пользователь и членство создаются временно и удаляются в finally.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

process.loadEnvFile(".env.local");

const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const anon = process.env.SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "";
if (!base || !anon || !service) {
  console.error("Нужны SUPABASE_URL, SUPABASE_ANON_KEY и SUPABASE_SERVICE_KEY/SECRET_KEY");
  process.exit(1);
}

// Исходники Worker'а используют относительные импорты без расширения.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        /* fall through */
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      const text = readFileSync(fileURLToPath(url), "utf8");
      return { format: "module", source: `export default ${text};`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const { default: app } = await import("../workers/api/src/index.ts");
hooks.deregister();

const env = {
  SUPABASE_URL: base,
  SUPABASE_ANON_KEY: anon,
  SUPABASE_SERVICE_KEY: service,
  APP_ENV: "development",
  CORS_ORIGINS: "http://localhost:3000",
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

function expectedCourse(admissionYear, now = new Date()) {
  const year = now.getUTCFullYear() - (now.getUTCMonth() >= 8 ? 0 : 1);
  return year - Number(admissionYear) + 1;
}

async function call(path, { method = "GET", token, body } = {}) {
  const response = await app.fetch(
    new Request(`http://e2e.local/api/v1${path}`, {
      method,
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    ctx
  );
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: response.status, json };
}

async function admin(path, options = {}) {
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  assert.ok(response.ok, `service REST ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ ok: true, name });
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    results.push({ ok: false, name });
    console.log(`✗ ${name} — ${error.message}`);
  }
}

let user = null;
let membershipId = null;
try {
  const member = await admin("materials?select=id,topic_id,title,subject_id&is_published=eq.true&topic_id=not.is.null&limit=1");
  const material = member[0];
  assert.ok(material, "нет опубликованного материала с темой");
  const subjectId = material.subject_id;

  const groups = await admin("groups?select=id,name,code,admission_year,course_number,stream&admission_year=not.is.null&limit=1");
  const group = groups[0];
  assert.ok(group, "нет группы с годом поступления");

  // ── временный пользователь ───────────────────────────────────────────────
  const email = `e2e-api+${Date.now()}@example.invalid`;
  const password = `E2e-${crypto.randomUUID()}`;
  const created = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.ok(created.ok, `admin create ${created.status}`);
  user = await created.json();

  const sessionRes = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.ok(sessionRes.ok, `password grant ${sessionRes.status}`);
  const token = (await sessionRes.json()).access_token;
  assert.ok(token, "нет access_token");

  const membership = await admin("group_memberships", {
    method: "POST",
    body: { group_id: group.id, user_id: user.id, role_in_group: "starosta", subgroup: "2", is_active: true },
  });
  membershipId = membership[0]?.id;
  assert.ok(membershipId, "членство не создалось");

  // ── маршруты ─────────────────────────────────────────────────────────────
  let expected = null;
  await check("GET /groups: вычисляемое имя и курс от года поступления", async () => {
    const { status, json } = await call("/groups", { token });
    assert.equal(status, 200, JSON.stringify(json));
    const item = (json.data.items || []).find((g) => g.id === group.id);
    assert.ok(item, "группа не найдена в ответе");
    expected = expectedCourse(group.admission_year);
    assert.equal(item.course_number, expected, "курс не совпал с календарём");
    assert.ok(String(item.display_name || "").includes(String(expected)), `display_name=${item.display_name}`);
    assert.equal(item.membership_role, "starosta");
    return `${item.display_name}, курс ${item.course_number}`;
  });

  await check("GET /subjects/:id/plan-progress: материалы темы и счётчик неоткрытых", async () => {
    const { status, json } = await call(`/subjects/${subjectId}/plan-progress`, { token });
    assert.equal(status, 200, JSON.stringify(json));
    const items = json.data.items || [];
    assert.ok(items.length > 0, "нет тем");
    const own = items.find((i) => (i.materials || []).some((m) => m.id === material.id));
    assert.ok(own, "материал не привязан к теме в ответе");
    assert.equal(typeof json.data.summary.unopened_materials, "number");
    return `${items.length} тем, не открыто ${json.data.summary.unopened_materials}`;
  });

  await check("POST /materials/:id/open: отметка сохраняется и видна в плане", async () => {
    const opened = await call(`/materials/${material.id}/open`, { method: "POST", token });
    assert.equal(opened.status, 200, JSON.stringify(opened.json));
    assert.equal(opened.json.data.opened, true);
    const { status, json } = await call(`/subjects/${subjectId}/plan-progress`, { token });
    assert.equal(status, 200);
    const own = (json.data.items || []).find((i) => (i.materials || []).some((m) => m.id === material.id));
    const chip = (own?.materials || []).find((m) => m.id === material.id);
    assert.equal(chip.opened, true, "после открытия флаг не поднялся");
    return material.title;
  });

  await check("GET /staff/groups/:id/manage: состав с курсом и подгруппой", async () => {
    const { status, json } = await call(`/staff/groups/${group.id}/manage`, { token });
    assert.equal(status, 200, JSON.stringify(json));
    const me = (json.data.members || []).find((m) => m.user_id === user.id);
    assert.ok(me, "себя не видно в составе");
    assert.equal(me.course_number, expected);
    assert.equal(me.subgroup, "2");
    return `${json.data.group.display_name}, участников ${json.data.members.length}`;
  });

  await check("PATCH /staff/.../members/:id: заморозка курса не стирает подгруппу", async () => {
    const patched = await call(`/staff/groups/${group.id}/members/${user.id}`, {
      method: "PATCH",
      token,
      body: { course_override: 1 },
    });
    assert.equal(patched.status, 200, JSON.stringify(patched.json));
    const { json } = await call(`/staff/groups/${group.id}/manage`, { token });
    const me = (json.data.members || []).find((m) => m.user_id === user.id);
    assert.equal(me.course_override, 1);
    assert.equal(me.course_number, 1);
    assert.equal(me.course_source, "override");
    assert.equal(me.subgroup, "2", "подгруппа затёрлась");

    const unfrozen = await call(`/staff/groups/${group.id}/members/${user.id}`, {
      method: "PATCH",
      token,
      body: { course_override: null },
    });
    assert.equal(unfrozen.status, 200, JSON.stringify(unfrozen.json));
    const after = await call(`/staff/groups/${group.id}/manage`, { token });
    const meAfter = (after.json.data.members || []).find((m) => m.user_id === user.id);
    assert.equal(meAfter.course_source, "auto");
    assert.equal(meAfter.course_number, expected);
    return "1 → авто";
  });
} finally {
  if (user?.id) {
    await fetch(`${base}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: { apikey: service, Authorization: `Bearer ${service}` },
    }).catch(() => {});
    const left = await admin("group_memberships?select=id&user_id=eq." + user.id).catch(() => []);
    console.log(`· временный пользователь удалён, его членств: ${Array.isArray(left) ? left.length : "?"}`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\nИтог: ${results.length - failed.length}/${results.length} маршрутов пройдено`);
if (failed.length) process.exitCode = 1;
