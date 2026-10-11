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
