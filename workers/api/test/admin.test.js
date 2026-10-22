import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("canonical API mounts protected administration endpoints", async () => {
  const index = await source("../src/index.ts");
  const routes = await source("../src/routes/admin.ts");
  assert.match(index, /import adminRoutes from "\.\/routes\/admin"/);
  assert.match(index, /v1\.route\("\/admin", adminRoutes\)/);
  for (const contract of [
    'admin.get("/questions"',
    'admin.put("/question-bank/:id"',
    'admin.get("/lectures"',
    'admin.patch("/lectures/:id"',
    'admin.get("/users"',
    'admin.post("/users/roles"',
    'admin.post("/content/import"',
    'admin.post("/content/package/import"',
    'admin.get("/telegram/chats"',
    'admin.post("/telegram/set-webhook"',
  ]) assert.ok(routes.includes(contract), "missing admin contract: " + contract);
});

test("admin access checks role codes, and user role changes require strict admin", async () => {
  const routes = await source("../src/routes/admin.ts");
  assert.match(routes, /from\("user_roles"\)\.select\("roles\(code\)"\)/);
  assert.match(routes, /const STRICT_ADMINS = \["admin"\]/);
  assert.match(routes, /LAST_ADMIN/);
  assert.match(routes, /created_by/);
});

test("content import is bounded, allowlisted, dry-run capable, and histology scoped", async () => {
  const routes = await source("../src/routes/admin.ts");
  assert.match(routes, /total > 500/);
  assert.match(routes, /dry_run/);
  assert.match(routes, /subjectSlug === "histology" && specialty !== "mbh"/);
  assert.match(routes, /onConflict: "source_key"/);
});

test("Telegram webhook secrets are read only from Worker environment and are not returned", async () => {
  const routes = await source("../src/routes/admin.ts");
  const env = await source("../src/env.ts");
  assert.match(env, /TELEGRAM_BOT_TOKEN\?: string/);
  assert.match(env, /TELEGRAM_WEBHOOK_SECRET\?: string/);
  assert.match(routes, /c\.env\.TELEGRAM_BOT_TOKEN/);
  assert.match(routes, /secret_token: secret/);
  assert.doesNotMatch(routes, /return c\.json\(ok\(\{[^}]*token/i);
});

test("admin schedule routes mount under /admin so their /schedule paths resolve once", async () => {
  const index = await source("../src/index.ts");
  assert.match(index, /v1\.route\("\/admin", adminSchedule\)/);
  assert.doesNotMatch(index, /v1\.route\("\/admin\/schedule", adminSchedule\)/);
});
