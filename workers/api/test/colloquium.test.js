import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("colloquium routes are mounted publicly and inside the protected admin router", async () => {
  const index = await source("../src/index.ts");
  const admin = await source("../src/routes/admin.ts");
  assert.match(index, /import colloquium from "\.\/routes\/colloquium"/);
  assert.match(index, /v1\.route\("\/colloquium", colloquium\)/);
  assert.match(admin, /import adminColloquium from "\.\/admin-colloquium"/);
  assert.match(admin, /admin\.route\("\/colloquium", adminColloquium\)/);
  assert.ok(
    admin.indexOf('admin.route("/colloquium"') < admin.indexOf('admin.route("/", adminParity)'),
    "admin colloquium route must be mounted before the catch-all parity router",
  );
});

test("admin colloquium writes require authentication and the strict admin role", async () => {
  const routes = await source("../src/routes/admin-colloquium.ts");
  assert.match(routes, /adminColloquium\.use\("\*", requireAuth\)/);
  assert.match(routes, /const ADMIN_ONLY = \["admin"\]/);
  assert.match(routes, /ADMIN_ONLY\.includes\(role\)/);
  assert.match(routes, /adminColloquium\.get\("\/:subject"/);
  assert.match(routes, /adminColloquium\.get\("\/"/);
  assert.match(routes, /like\("key", "colloquium:%"\)/);
  assert.match(routes, /adminColloquium\.put\("\/:subject"/);
  assert.match(routes, /adminColloquium\.delete\("\/:subject"/);
  assert.match(routes, /FORBIDDEN/);
});

test("colloquium documents use namespaced site_content keys and exact-key reads", async () => {
  const library = await source("../src/lib/colloquium.ts");
  const admin = await source("../src/routes/admin-colloquium.ts");
  const publicRoute = await source("../src/routes/colloquium.ts");
  assert.match(library, /return `colloquium:\$\{subject\}`/);
  assert.match(library, /return `colloquium:\$\{subject\}:content`/);
  assert.match(admin, /colloquiumSettingsKey\(subject\)/);
  assert.match(admin, /colloquiumContentKey\(subject\)/);
  assert.match(admin, /\.eq\("key", key\)/);
  assert.match(admin, /onConflict: "key"/);
  assert.match(publicRoute, /optionalAuth/);
  assert.match(publicRoute, /degraded: true/);
  assert.doesNotMatch(publicRoute, /\.like\("key"/);
});

test("colloquium settings validation is bounded and rejects unsafe values", async () => {
  const library = await source("../src/lib/colloquium.ts");
  assert.match(library, /pass_percent/);
  assert.match(library, /default_question_count/);
  assert.match(library, /default_minutes/);
  assert.match(library, /max_attempts/);
  assert.match(library, /total_minutes/);
  assert.match(library, /OPEN|opens_at/);
  assert.match(library, /closes_at/);
  assert.match(library, /VALIDATION|Ожидается JSON/);
  assert.match(library, /subject_slug/);
  assert.match(library, /features/);
  assert.match(library, /COLLOQUIUM_MAX_PAYLOAD_BYTES/);
});

test("colloquium content saves are validated before they reach site_content", async () => {
  const library = await source("../src/lib/colloquium.ts");
  const admin = await source("../src/routes/admin-colloquium.ts");
  assert.match(library, /normalizeColloquiumContent/);
  assert.match(library, /test_modules/);
  assert.match(library, /plan_stages/);
  assert.match(library, /theory/);
  assert.match(library, /tasks/);
  assert.match(admin, /input\.content !== undefined/);
  assert.match(admin, /VALIDATION_ERROR/);
  assert.match(admin, /previous_subject/);
});

test("colloquium migration seeds defaults and protects the namespace with RLS", async () => {
  const migration = await source("../../../supabase/migrations/20261020150000_colloquium_settings.sql");
  assert.match(migration, /colloquium:physiology/);
  assert.match(migration, /on conflict \(key\) do nothing/);
  assert.match(migration, /site_content_colloquium_member_read/);
  assert.match(migration, /site_content_colloquium_admin_insert/);
  assert.match(migration, /site_content_colloquium_admin_update/);
  assert.match(migration, /private\.has_app_role/);
  assert.doesNotMatch(migration, /disable row level security/i);
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(migration, /create table/i);
});
