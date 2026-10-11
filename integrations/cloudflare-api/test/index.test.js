import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

function request(path, options = {}) {
  return new Request(`https://api-shadow.example.test${path}`, options);
}

test("health endpoint identifies this as a non-production migration scaffold", async () => {
  const response = await worker.fetch(request("/api/v1/health"), { APP_ENV: "shadow" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.productionTrafficEnabled, false);
  assert.equal(body.role, "migration-scaffold");
});

test("GET /api/v1 preserves the PHP public metadata response contract", async () => {
  const response = await worker.fetch(request("/api/v1"), { APP_ENV: "shadow", MEDBIOHIM_BUILD: "test-build" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.name, "MEDBIOHIM API");
  assert.equal(body.data.version, "v1");
  assert.equal(body.data.build, "test-build");
  assert.equal(body.data.phase, "D");
  assert.deepEqual(body.data.endpoints, ["auth, me, groups, subjects, tests, homeworks, files"]);
  assert.equal(typeof body.requestId, "string");
});

test("GET /api/v1/ping returns the PHP-compatible ping fields", async () => {
  const response = await worker.fetch(request("/api/v1/ping"), { APP_ENV: "shadow", MEDBIOHIM_BUILD: "test-build" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.deepEqual(Object.keys(body.data).sort(), ["build", "env", "pong", "time"]);
  assert.equal(body.data.pong, true);
  assert.equal(body.data.build, "test-build");
  assert.equal(body.data.env, "shadow");
  assert.match(body.data.time, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}\+00:00$/);
  assert.equal(typeof body.requestId, "string");
});

test("metadata routes normalize trailing slash and reject non-GET methods like the PHP router", async () => {
  const trailing = await worker.fetch(request("/api/v1/ping/"), {});
  assert.equal(trailing.status, 200);
  const post = await worker.fetch(request("/api/v1/ping", { method: "POST" }), {});
  assert.equal(post.status, 404);
  assert.equal((await post.json()).error.code, "NOT_FOUND");
});


test("POST /api/v1/auth/login fails closed until a Cloudflare rate limiter is configured", async () => {
  const response = await worker.fetch(request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.10" },
    body: JSON.stringify({ email: "student@example.com", password: "password123" }),
  }), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "RATE_LIMIT_NOT_CONFIGURED");
});

test("login rejects attempts denied by the Cloudflare rate limiter before auth", async () => {
  let calls = 0;
  const response = await worker.fetch(request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.10" },
    body: JSON.stringify({ email: "student@example.com", password: "password123" }),
  }), {
    AUTH_LOGIN_LIMITER: { limit: async ({ key }) => { calls += 1; assert.equal(key, "203.0.113.10"); return { success: false }; } },
  });
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, "RATE_LIMITED");
  assert.equal(calls, 1);
});

test("POST /api/v1/auth/recover validates input and fails closed without Supabase config", async () => {
  const missing = await worker.fetch(request("/api/v1/auth/recover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }), {});
  assert.equal(missing.status, 422);
  assert.equal((await missing.json()).error.code, "VALIDATION_ERROR");

  const unconfigured = await worker.fetch(request("/api/v1/auth/recover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "student@example.com" }),
  }), {});
  assert.equal(unconfigured.status, 503);
  assert.equal((await unconfigured.json()).error.code, "AUTH_NOT_CONFIGURED");
});

test("GET is not accepted for the recovery route", async () => {
  const response = await worker.fetch(request("/api/v1/auth/recover"), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST, OPTIONS");
});

test("POST /api/v1/auth/refresh validates JSON and fails closed without Supabase config", async () => {
  const missing = await worker.fetch(request("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }), {});
  assert.equal(missing.status, 422);
  assert.equal((await missing.json()).error.code, "VALIDATION_ERROR");

  const unconfigured = await worker.fetch(request("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: "test-refresh-token" }),
  }), {});
  assert.equal(unconfigured.status, 503);
  assert.equal((await unconfigured.json()).error.code, "AUTH_NOT_CONFIGURED");
});

test("refresh route rejects malformed and oversized JSON before calling Supabase", async () => {
  const malformed = await worker.fetch(request("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  }), {});
  assert.equal(malformed.status, 422);
  assert.equal((await malformed.json()).error.code, "VALIDATION_ERROR");

  const oversized = await worker.fetch(request("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: "x".repeat(17_000) }),
  }), {});
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "PAYLOAD_TOO_LARGE");
});

test("GET is not accepted for the refresh route", async () => {
  const response = await worker.fetch(request("/api/v1/auth/refresh"), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST, OPTIONS");
});

test("POST /api/v1/auth/logout requires a bearer token", async () => {
  const response = await worker.fetch(request("/api/v1/auth/logout", { method: "POST" }), {});
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
});

test("JSON access_token fallback is accepted by the PHP-compatible logout contract", async () => {
  const response = await worker.fetch(request("/api/v1/auth/logout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ access_token: "test-token" }),
  }), {});
  // Token parsing succeeded; the request fails closed only because the shadow
  // Worker has no Supabase configuration in this test.
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "AUTH_NOT_CONFIGURED");
});

test("malformed JSON logout body returns validation error", async () => {
  const response = await worker.fetch(request("/api/v1/auth/logout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  }), {});
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
});

test("logout JSON body has a strict byte limit even without Content-Length", async () => {
  const response = await worker.fetch(request("/api/v1/auth/logout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ access_token: "x".repeat(17_000) }),
  }), {});
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "PAYLOAD_TOO_LARGE");
});

test("GET is not accepted for the logout route", async () => {
  const response = await worker.fetch(request("/api/v1/auth/logout"), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST, OPTIONS");
});

test("logout route fails closed when Supabase configuration is absent", async () => {
  const response = await worker.fetch(request("/api/v1/auth/logout", {
    method: "POST",
    headers: { authorization: "Bearer test-token" },
  }), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "AUTH_NOT_CONFIGURED");
});

test("unmigrated API routes are not proxied to the current PHP origin", async () => {
  const response = await worker.fetch(request("/api/v1/auth/me"), {
    APP_ENV: "shadow",
    SPACEWEB_API_URL: "http://example.invalid",
  });
  assert.equal(response.status, 501);
  assert.equal((await response.json()).error.code, "ROUTE_NOT_MIGRATED");
});

test("CORS rejects an origin outside the configured allowlist", async () => {
  const response = await worker.fetch(request("/api/v1/health", {
    method: "OPTIONS",
    headers: { origin: "https://attacker.example", "access-control-request-method": "GET" },
  }), { MEDBIOHIM_ALLOWED_ORIGINS: "https://medbiohim.vercel.app" });
  assert.equal(response.status, 403);
});

test("CORS allows the configured frontend origin", async () => {
  const response = await worker.fetch(request("/api/v1/health", {
    headers: { origin: "https://medbiohim.vercel.app" },
  }), { MEDBIOHIM_APP_ORIGIN: "https://medbiohim.vercel.app" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://medbiohim.vercel.app");
});
