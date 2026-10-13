import test from "node:test";
import assert from "node:assert/strict";
import { isHttpsOrigin, shouldFallbackFromCloudflare } from "../src/lib/api-failover.mjs";

function req(method, path = "/api/v1/homeworks") {
  return new Request("https://app.example.test" + path, { method });
}
function res(status, code = "") {
  return new Response(JSON.stringify({ ok: false, error: { code } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("only HTTPS SpaceWeb origins are eligible for credentialed failover", () => {
  assert.equal(isHttpsOrigin("https://spaceweb.example/api/v1"), true);
  assert.equal(isHttpsOrigin("http://spaceweb.example/api/v1"), false);
  assert.equal(isHttpsOrigin("not a URL"), false);
  assert.equal(isHttpsOrigin(undefined), false);
});

test("admin transport diagnostics are backed by a server-side canonical role check", async () => {
  const fs = await import("node:fs/promises");
  const route = await fs.readFile(new URL("../src/app/api/v1/[...path]/route.ts", import.meta.url), "utf8");
  assert.match(route, /async function isCanonicalAdminRequest\(req: NextRequest\)/);
  assert.match(route, /auth\/v1\/user/);
  assert.match(route, /select", "roles\(code\)"/);
  assert.match(route, /x-mbh-transport-diagnostics/);
  assert.match(route, /x-mbh-transport-source/);
  assert.match(route, /INSECURE_BACKEND_ORIGIN/);
  assert.doesNotMatch(route, /user_metadata\s*\.\s*role/);
});

test("falls back when Cloudflare explicitly marks a route not migrated", async () => {
  assert.equal(await shouldFallbackFromCloudflare(req("POST"), res(501, "ROUTE_NOT_MIGRATED")), true);
});

test("falls back for server errors on read-only requests", async () => {
  assert.equal(await shouldFallbackFromCloudflare(req("GET"), res(503, "DB_UNAVAILABLE")), true);
  assert.equal(await shouldFallbackFromCloudflare(req("HEAD"), res(502, "UPSTREAM")), true);
  assert.equal(await shouldFallbackFromCloudflare(req("OPTIONS"), res(504, "TIMEOUT")), true);
});

test("does not retry generic or ambiguous failed writes", async () => {
  assert.equal(await shouldFallbackFromCloudflare(req("POST"), res(502, "UPSTREAM")), false);
  assert.equal(await shouldFallbackFromCloudflare(req("PATCH"), res(503, "DB_UNAVAILABLE")), false);
  assert.equal(await shouldFallbackFromCloudflare(req("DELETE"), res(500, "INTERNAL")), false);
});

test("allows safe auth fallback only for explicit pre-operation configuration guards", async () => {
  assert.equal(await shouldFallbackFromCloudflare(req("POST", "/api/v1/auth/login"), res(503, "RATE_LIMIT_NOT_CONFIGURED")), true);
  assert.equal(await shouldFallbackFromCloudflare(req("POST", "/api/v1/auth/refresh"), res(503, "AUTH_NOT_CONFIGURED")), true);
  assert.equal(await shouldFallbackFromCloudflare(req("POST", "/api/v1/auth/login"), res(503, "DB_UNAVAILABLE")), false);
});

test("allows upload fallback only when the Worker returns before processing due to missing storage", async () => {
  assert.equal(await shouldFallbackFromCloudflare(req("POST", "/api/v1/files/upload"), res(503, "STORAGE_NOT_CONFIGURED")), true);
  assert.equal(await shouldFallbackFromCloudflare(req("POST", "/api/v1/files/upload"), res(503, "DB_UNAVAILABLE")), false);
});


test("falls back to SpaceWeb when shared-homework attachments are explicitly unsupported before writes", async () => {
  assert.equal(await shouldFallbackFromCloudflare(req("POST", "/api/v1/homeworks"), res(503, "HOMEWORK_ATTACHMENTS_NOT_CONFIGURED")), true);
  assert.equal(await shouldFallbackFromCloudflare(req("POST", "/api/v1/homeworks"), res(503, "DB_UNAVAILABLE")), false);
});


test("Cloudflare is the default API mode and ignores the retired SpaceWeb origin", async () => {
  const fs = await import("node:fs/promises");
  const route = await fs.readFile(new URL("../src/app/api/v1/[...path]/route.ts", import.meta.url), "utf8");
  assert.match(route, /process\.env\.MEDBIOHIM_API_MODE === "legacy" \? "legacy" : "cloudflare"/);
  assert.match(route, /API_MODE === "cloudflare" \? undefined : process\.env\.SPACEWEB_API_ORIGIN/);
  assert.ok(route.includes("https://medbiohim-api-shadow.ryazansevegor.workers.dev/api/v1"));
  assert.match(route, /API_MODE === "cloudflare" \|\| process\.env\.MEDBIOHIM_CF_FIRST === "true"/);
  assert.match(route, /if \(safeRead && UPSTREAM && isHttpsOrigin\(UPSTREAM\)\)/);
});
