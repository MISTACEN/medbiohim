import test from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_EXPIRED_EVENT,
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
  refreshAccessToken,
  refreshSessionResult,
  setSessionTokens,
} from "../src/lib/auth/session.ts";

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
}

let store;
let events;
let fetchCalls;
let fetchPlan;

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

test.beforeEach(() => {
  store = fakeStorage();
  events = [];
  fetchCalls = [];
  fetchPlan = () => jsonResponse(200, { ok: true, data: { access_token: "access-1" } });
  globalThis.window = {
    localStorage: store,
    dispatchEvent: (event) => {
      events.push(event.type);
      return true;
    },
  };
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    return fetchPlan(String(url));
  };
});

test("20 parallel 401s produce exactly one refresh request", async () => {
  setSessionTokens("stale-access", "refresh-1");
  const results = await Promise.all(Array.from({ length: 20 }, () => refreshAccessToken()));
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0], "/api/v1/auth/refresh");
  assert.deepEqual([...new Set(results)], ["access-1"]);
  assert.equal(getAccessToken(), "access-1");
  assert.equal(getRefreshToken(), "refresh-1");
});

test("a session refresh shares the same in-flight request as the requests around it", async () => {
  setSessionTokens("stale-access", "refresh-1");
  const [token, session] = await Promise.all([refreshAccessToken(), refreshSessionResult()]);
  assert.equal(fetchCalls.length, 1);
  assert.equal(token, "access-1");
  assert.equal(session.ok, true);
  assert.equal(session.data.access_token, "access-1");
});

test("a rejected refresh clears both tokens and announces the expired session", async () => {
  setSessionTokens("stale-access", "refresh-1");
  fetchPlan = () => jsonResponse(401, { ok: false, error: { code: "INVALID_REFRESH", message: "nope" } });
  const result = await refreshSessionResult();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_REFRESH");
  assert.equal(getAccessToken(), null);
  assert.equal(getRefreshToken(), null);
  assert.deepEqual(events, [SESSION_EXPIRED_EVENT]);
});

test("a 5xx auth outage keeps the stored session instead of logging the user out", async () => {
  setSessionTokens("stale-access", "refresh-1");
  fetchPlan = () => jsonResponse(503, { ok: false, error: { code: "DB_UNAVAILABLE", message: "later" } });
  const result = await refreshSessionResult();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "DB_UNAVAILABLE");
  assert.equal(getRefreshToken(), "refresh-1");
  assert.deepEqual(events, []);
});

test("a network failure reports NETWORK and does not clear the session", async () => {
  setSessionTokens("stale-access", "refresh-1");
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  const result = await refreshSessionResult();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NETWORK");
  assert.equal(getRefreshToken(), "refresh-1");
});

test("without a refresh token nothing is requested at all", async () => {
  setSessionTokens("access-only");
  const result = await refreshSessionResult();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_REFRESH_TOKEN");
  assert.equal(fetchCalls.length, 0);
});

test("a non-JSON refresh answer is reported as BAD_RESPONSE, not as a silent success", async () => {
  setSessionTokens("stale-access", "refresh-1");
  fetchPlan = () => jsonResponse(200, "<html>proxy error</html>");
  const result = await refreshSessionResult();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "BAD_RESPONSE");
});

test("switching accounts drops the previous refresh token and user-scoped caches", async () => {
  const scopeOf = (sub) => `x.${Buffer.from(JSON.stringify({ sub })).toString("base64")}.y`;
  let resets = 0;
  const { registerUserScopeReset } = await import("../src/lib/auth/session.ts");
  registerUserScopeReset(() => {
    resets += 1;
  });
  setSessionTokens(scopeOf("user-a"), "refresh-a");
  assert.equal(resets, 1); // anonymous → signed in
  setSessionTokens(scopeOf("user-b"));
  assert.equal(resets, 2); // the account behind the token changed
  assert.equal(getRefreshToken(), null);
  clearSessionTokens();
  assert.equal(resets, 3);
});
