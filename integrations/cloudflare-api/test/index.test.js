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
  assert.deepEqual(body.data.endpoints, ["auth, me, groups, subjects, tests, homeworks, files, materials, content-sources, trainer-feed, notes, favorites, lecture-mini-quiz, question-reports"]);
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


test("GET /api/v1/groups requires a verified bearer token", async () => {
  const response = await worker.fetch(request("/api/v1/groups"), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHORIZED");
});

test("POST /api/v1/groups is explicitly read-only on the shadow migration route", async () => {
  const response = await worker.fetch(request("/api/v1/groups", { method: "POST" }), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, OPTIONS");
});

test("GET /api/v1/subjects requires a bearer token", async () => {
  const response = await worker.fetch(request("/api/v1/subjects"), {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHORIZED");
});

test("POST /api/v1/subjects list is rejected with an explicit allowed method", async () => {
  const response = await worker.fetch(request("/api/v1/subjects", { method: "POST" }), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, OPTIONS");
});

test("GET /api/v1/subjects/:id/gradebook requires a verified bearer token", async () => {
  const response = await worker.fetch(request("/api/v1/subjects/subject-1/gradebook"), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHORIZED");
});

test("POST /api/v1/subjects/:id/gradebook is explicitly read-only", async () => {
  const response = await worker.fetch(request("/api/v1/subjects/subject-1/gradebook", { method: "POST" }), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, OPTIONS");
});

test("GET /api/v1/subjects/:id requires a bearer token", async () => {
  const response = await worker.fetch(request("/api/v1/subjects/subject-1"), {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHORIZED");
});

test("POST /api/v1/subjects/:id is rejected with an explicit allowed method", async () => {
  const response = await worker.fetch(request("/api/v1/subjects/subject-1", { method: "POST" }), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, OPTIONS");
});

test("GET /api/v1/search requires a valid Supabase Bearer token", async () => {
  const response = await worker.fetch(request("/api/v1/search?q=mitosis"), {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHORIZED");
});

test("POST /api/v1/search is rejected with an explicit allowed method", async () => {
  const response = await worker.fetch(request("/api/v1/search?q=mitosis", { method: "POST" }), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, OPTIONS");
});

test("GET /api/v1/auth/me requires a valid Supabase Bearer token", async () => {
  let calls = 0;
  const response = await worker.fetch(request("/api/v1/auth/me"), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHORIZED");
  assert.equal(calls, 0);
});

test("GET /api/v1/me is a PHP-compatible alias for the authenticated profile bundle", async () => {
  const response = await worker.fetch(request("/api/v1/me"), {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHORIZED");
});

test("POST /api/v1/auth/me is rejected with an explicit allowed method", async () => {
  const response = await worker.fetch(request("/api/v1/auth/me", { method: "POST" }), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, OPTIONS");
});

test("POST /api/v1/auth/register fails closed until rate-limit enforcement is verified", async () => {
  const response = await worker.fetch(request("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.11" },
    body: JSON.stringify({ email: "student@example.com", password: "password123", full_name: "Student" }),
  }), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "RATE_LIMIT_ENFORCEMENT_UNVERIFIED");
});

test("registration rejects attempts denied by the Cloudflare rate limiter before auth", async () => {
  let calls = 0;
  const response = await worker.fetch(request("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.11" },
    body: JSON.stringify({ email: "student@example.com", password: "password123", full_name: "Student" }),
  }), {
    AUTH_RATE_LIMIT_ENFORCEMENT_VERIFIED: "true",
    AUTH_REGISTER_LIMITER: { limit: async ({ key }) => { calls += 1; assert.equal(key, "203.0.113.11"); return { success: false }; } },
  });
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, "RATE_LIMITED");
  assert.equal(calls, 1);
});

test("POST /api/v1/auth/login fails closed until rate-limit enforcement is verified", async () => {
  const response = await worker.fetch(request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.10" },
    body: JSON.stringify({ email: "student@example.com", password: "password123" }),
  }), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "RATE_LIMIT_ENFORCEMENT_UNVERIFIED");
});

test("login rejects attempts denied by the Cloudflare rate limiter before auth", async () => {
  let calls = 0;
  const response = await worker.fetch(request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.10" },
    body: JSON.stringify({ email: "student@example.com", password: "password123" }),
  }), {
    AUTH_RATE_LIMIT_ENFORCEMENT_VERIFIED: "true",
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
  const response = await worker.fetch(request("/api/v1/unmigrated-example"), {
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


for (const path of ["/api/v1/dashboard", "/api/v1/admin/schedule", "/api/v1/schedule", "/api/v1/schedule/meta", "/api/v1/homeworks", "/api/v1/tests", "/api/v1/questions", "/api/v1/questions/subjects", "/api/v1/questions/mini-quiz", "/api/v1/lectures", "/api/v1/lectures/lecture-1", "/api/v1/curriculum", "/api/v1/subjects-catalog", "/api/v1/subject-materials", "/api/v1/materials", "/api/v1/materials/material-1", "/api/v1/content-sources/source-1", "/api/v1/trainers/feed", "/api/v1/trainers/feed/card-1", "/api/v1/favorites", "/api/v1/subject-plans", "/api/v1/subject-plans/histology"]) {
  test(`GET ${path} requires a valid Supabase bearer token`, async () => {
    const response = await worker.fetch(request(path), {
      SUPABASE_URL: "https://project-id.supabase.co",
      SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
    });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "UNAUTHORIZED");
  });
}

test("schedule and dashboard read routes reject writes rather than silently accepting them", async () => {
  for (const path of ["/api/v1/dashboard", "/api/v1/schedule", "/api/v1/homeworks", "/api/v1/tests", "/api/v1/questions", "/api/v1/questions/subjects", "/api/v1/questions/mini-quiz", "/api/v1/questions/mini-quiz/check", "/api/v1/lectures", "/api/v1/lectures/lecture-1", "/api/v1/curriculum", "/api/v1/subjects-catalog", "/api/v1/subject-materials", "/api/v1/materials", "/api/v1/materials/material-1", "/api/v1/content-sources/source-1", "/api/v1/trainers/feed", "/api/v1/trainers/feed/card-1", "/api/v1/favorites", "/api/v1/subject-plans", "/api/v1/subject-plans/histology"]) {
    const response = await worker.fetch(request(path, { method: "POST" }), {});
    assert.equal(response.status, 405, path);
  }
});


test("schedule create route requires auth and rejects non-POST methods", async () => {
  const unauthenticated = await worker.fetch(request("/api/v1/schedule/entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }), { SUPABASE_URL: "https://project-id.supabase.co", SUPABASE_ANON_KEY: "public-anon-key-for-test-only" });
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).error.code, "UNAUTHORIZED");

  const wrongMethod = await worker.fetch(request("/api/v1/schedule/entries"), {});
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST, OPTIONS");
});

test("schedule entry update and delete routes require supported methods and valid auth", async () => {
  const path = "/api/v1/schedule/entries/22222222-2222-4222-8222-222222222222";
  const wrongMethod = await worker.fetch(request(path), {});
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "PATCH, DELETE, OPTIONS");

  const unauthenticated = await worker.fetch(request(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ room: "304" }),
  }), { SUPABASE_URL: "https://project-id.supabase.co", SUPABASE_ANON_KEY: "public-anon-key-for-test-only" });
  assert.equal(unauthenticated.status, 401);
});


test("admin schedule editor requires authentication for reads and writes", async () => {
  const get = await worker.fetch(request("/api/v1/admin/schedule?group_id=11111111-1111-4111-8111-111111111111&semester=3"), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(get.status, 401);
  const put = await worker.fetch(request("/api/v1/admin/schedule", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ group_id: "11111111-1111-4111-8111-111111111111", semester: 3, entries: [] }),
  }), { SUPABASE_URL: "https://project-id.supabase.co", SUPABASE_ANON_KEY: "public-anon-key-for-test-only" });
  assert.equal(put.status, 401);
});


test("progress and question-bank routes are authenticated and read-only", async () => {
  for (const path of ["/api/v1/progress", "/api/v1/tests", "/api/v1/questions", "/api/v1/questions/subjects"]) {
    const response = await worker.fetch(request(path), {
      SUPABASE_URL: "https://project-id.supabase.co",
      SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
    });
    assert.equal(response.status, 401, path);
    assert.equal((await response.json()).error.code, "UNAUTHORIZED", path);
  }
  for (const path of ["/api/v1/progress", "/api/v1/tests", "/api/v1/questions"]) {
    const response = await worker.fetch(request(path, { method: "POST" }), {});
    assert.equal(response.status, 405, path);
    assert.equal(response.headers.get("allow"), "GET, OPTIONS", path);
  }
});


test("test detail and attempt history routes require authentication", async () => {
  for (const path of [
    "/api/v1/tests/22222222-2222-4222-8222-222222222222",
    "/api/v1/my/attempts?group_id=11111111-1111-4111-8111-111111111111",
  ]) {
    const response = await worker.fetch(request(path), {
      SUPABASE_URL: "https://project-id.supabase.co",
      SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
    });
    assert.equal(response.status, 401, path);
    assert.equal((await response.json()).error.code, "UNAUTHORIZED", path);
  }
});

test("test attempt start/save/finish routes require auth before invoking private RPCs", async () => {
  const attemptId = "33333333-3333-4333-8333-333333333333";
  const paths = [
    ["/api/v1/tests/22222222-2222-4222-8222-222222222222/start", "POST", "{}"],
    ["/api/v1/tests/attempts/" + attemptId + "/answers", "POST", JSON.stringify({ question_id: "55555555-5555-4555-8555-555555555555", answer_text: "A" })],
    ["/api/v1/tests/attempts/" + attemptId + "/finish", "POST", "{}"],
  ];
  for (const [path, method, body] of paths) {
    const response = await worker.fetch(request(path, {
      method,
      headers: { "content-type": "application/json" },
      body,
    }), {
      SUPABASE_URL: "https://project-id.supabase.co",
      SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
    });
    assert.equal(response.status, 401, path);
    assert.equal((await response.json()).error.code, "UNAUTHORIZED", path);
  }
});


test("test curriculum map and chemistry master routes require authentication", async () => {
  for (const path of ["/api/v1/tests/curriculum-map", "/api/v1/tests/chemistry-master"]) {
    const response = await worker.fetch(request(path), {
      SUPABASE_URL: "https://project-id.supabase.co",
      SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
    });
    assert.equal(response.status, 401, path);
    assert.equal((await response.json()).error.code, "UNAUTHORIZED", path);
  }
  for (const path of ["/api/v1/tests/curriculum-map", "/api/v1/tests/chemistry-master"]) {
    const response = await worker.fetch(request(path, { method: "POST" }), {});
    assert.equal(response.status, 405, path);
    assert.equal(response.headers.get("allow"), "GET, OPTIONS", path);
  }
});


test("test bank progress route requires auth and is read-only", async () => {
  const path = "/api/v1/tests/22222222-2222-4222-8222-222222222222/bank-progress";
  const unauthenticated = await worker.fetch(request(path), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).error.code, "UNAUTHORIZED");

  const wrongMethod = await worker.fetch(request(path, { method: "POST" }), {});
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "GET, OPTIONS");
});


test("dedicated test bank detail is authenticated and read-only", async () => {
  const path = "/api/v1/tests/22222222-2222-4222-8222-222222222222/bank";
  const unauthenticated = await worker.fetch(request(path), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).error.code, "UNAUTHORIZED");
  const wrongMethod = await worker.fetch(request(path, { method: "POST" }), {});
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "GET, OPTIONS");
});


test("test detail view=bank route remains authenticated and read-only", async () => {
  const response = await worker.fetch(request("/api/v1/tests/22222222-2222-4222-8222-222222222222?view=bank"), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHORIZED");
  const wrongMethod = await worker.fetch(request("/api/v1/tests/22222222-2222-4222-8222-222222222222?view=bank", { method: "POST" }), {});
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "GET, OPTIONS");
});


test("trainer answer submission requires authentication and only accepts POST", async () => {
  const unauthenticated = await worker.fetch(request("/api/v1/trainers/feed/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ card_id: "card-1", option_id: "a" }),
  }), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).error.code, "UNAUTHORIZED");

  const wrongMethod = await worker.fetch(request("/api/v1/trainers/feed/answer"), {});
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST, OPTIONS");
});


test("personal state routes enforce authentication and explicit methods", async () => {
  const unauthNotes = await worker.fetch(request("/api/v1/notes"), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(unauthNotes.status, 401);
  assert.equal((await unauthNotes.json()).error.code, "UNAUTHORIZED");

  const unsupportedNotes = await worker.fetch(request("/api/v1/notes", { method: "DELETE" }), {});
  assert.equal(unsupportedNotes.status, 405);
  assert.equal(unsupportedNotes.headers.get("allow"), "GET, POST, OPTIONS");

  const unauthPostNote = await worker.fetch(request("/api/v1/notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target_type: "question", target_id: "q-1", body: "note" }),
  }), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(unauthPostNote.status, 401);

  const unauthFavorites = await worker.fetch(request("/api/v1/favorites"), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(unauthFavorites.status, 401);

  const unsupportedFavorites = await worker.fetch(request("/api/v1/favorites", { method: "POST" }), {});
  assert.equal(unsupportedFavorites.status, 405);
  assert.equal(unsupportedFavorites.headers.get("allow"), "GET, OPTIONS");

  const unauthToggle = await worker.fetch(request("/api/v1/favorites/toggle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target_type: "question", target_id: "q-1" }),
  }), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(unauthToggle.status, 401);

  const wrongToggleMethod = await worker.fetch(request("/api/v1/favorites/toggle"), {});
  assert.equal(wrongToggleMethod.status, 405);
  assert.equal(wrongToggleMethod.headers.get("allow"), "POST, OPTIONS");
});


test("lecture mini-quiz routes enforce auth and GET/POST methods", async () => {
  const read = await worker.fetch(request("/api/v1/questions/mini-quiz?subject_id=subject-1&ids=q-1"), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(read.status, 401);
  assert.equal((await read.json()).error.code, "UNAUTHORIZED");

  const wrongReadMethod = await worker.fetch(request("/api/v1/questions/mini-quiz", { method: "POST" }), {});
  assert.equal(wrongReadMethod.status, 405);
  assert.equal(wrongReadMethod.headers.get("allow"), "GET, OPTIONS");

  const check = await worker.fetch(request("/api/v1/questions/mini-quiz/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question_id: "q-1", subject_id: "subject-1", selected_indexes: [0] }),
  }), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(check.status, 401);
  assert.equal((await check.json()).error.code, "UNAUTHORIZED");

  const wrongCheckMethod = await worker.fetch(request("/api/v1/questions/mini-quiz/check"), {});
  assert.equal(wrongCheckMethod.status, 405);
  assert.equal(wrongCheckMethod.headers.get("allow"), "POST, OPTIONS");
});


test("question report route requires auth and only accepts POST", async () => {
  const auth = await worker.fetch(request("/api/v1/questions/a94f7d20-4c6a-4f4a-8e22-731f2b8f57c1/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ category: "typo", message: "Typo" }),
  }), {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  });
  assert.equal(auth.status, 401);
  assert.equal((await auth.json()).error.code, "UNAUTHORIZED");

  const wrongMethod = await worker.fetch(request("/api/v1/questions/a94f7d20-4c6a-4f4a-8e22-731f2b8f57c1/report"), {});
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST, OPTIONS");
});
