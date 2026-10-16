import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const [apiSource, settingsSource, worker] = await Promise.all([
  readFile(resolve(root, "src/lib/api.ts"), "utf8"),
  readFile(resolve(root, "src/lib/settings-api.ts"), "utf8"),
  readFile(resolve(root, "integrations/cloudflare-api/src/index.js"), "utf8"),
]);
const frontend = apiSource + "\n" + settingsSource;

test("frontend and Worker keep the same API envelope and base path", () => {
  assert.match(frontend, /const API_URL\s*=\s*["']\/api\/v1["']/);
  assert.match(frontend, /ok:true;data:T;requestId:string/);
  assert.match(frontend, /ok:false;error:/);
  assert.match(worker, /const API_PREFIX\s*=\s*["']\/api\/v1["']/);
});

test("P0 authentication and dashboard paths are explicitly dispatched", () => {
  for (const path of [
    "/auth/register",
    "/auth/login",
    "/auth/me",
    "/auth/refresh",
    "/auth/recover",
    "/auth/logout",
    "/dashboard",
    "/schedule",
    "/schedule/meta",
    "/planner",
    "/homeworks",
    "/progress",
    "/settings/account",
    "/settings/profile",
  ]) {
    assert.ok(worker.includes(path), `Worker dispatch is missing expected P0 path: ${path}`);
    assert.ok(frontend.includes(path), `Frontend caller is missing expected P0 path: ${path}`);
  }
});

test("frontend group and subject CRUD routes are wired to the database-guarded admin service", () => {
  for (const path of [
    "/groups",
    "/subjects",
  ]) assert.ok(frontend.includes(path));
  assert.ok(frontend.includes('method:"POST"'));
  assert.ok(frontend.includes('method:"PATCH"'));
  assert.ok(frontend.includes('method:"DELETE"'));
  assert.ok(worker.includes("mutateSupabaseAdminEntity"));
  assert.ok(worker.includes("groupMutationMatch"));
  assert.ok(worker.includes("subjectMutationMatch"));
});

test("file upload is explicitly dispatched to the authenticated upload service", () => {
  assert.ok(frontend.includes('"/files/upload"'), "frontend upload contract changed; re-audit it");
  assert.ok(worker.includes("/files/upload"));
  assert.ok(worker.includes("uploadSupabaseFile(request, env)"));
});
