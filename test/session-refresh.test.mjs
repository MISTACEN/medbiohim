import test from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_EXPIRED_EVENT,
  clearSessionTokens,
  currentUserScope,
  getAccessToken,
  hasAccessToken,
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
  fetchPlan = (url) => {
    if (String(url).includes("/api/auth/refresh")) {
      return jsonResponse(200, { ok: true, access_token: "access-1" });
    }
    // POST /api/auth/session — обмен токенов на HttpOnly куки.
    return jsonResponse(204, "");
  };
  globalThis.window = {
    localStorage: store,
    dispatchEvent: (event) => {
      events.push(event.type);
      return true;
    },
  };
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return fetchPlan(url, init);
  };
});

/** Минимальный JWT: области кэша нужен только payload.sub (base64url). */
function jwt(sub) {
  return `x.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.y`;
}

test("setSessionTokens exchanges tokens for HttpOnly cookies and never writes token keys", async () => {
  store.setItem("mb_access_token", "stale-legacy-access");
  store.setItem("mb_refresh_token", "stale-legacy-refresh");
  await setSessionTokens("access-1", "refresh-1");
  assert.equal(getAccessToken(), "access-1");
  assert.equal(store.getItem("mb_auth_transport"), "cookie");
  // Legacy token keys are deleted, not rewritten.
  assert.equal(store.getItem("mb_access_token"), null);
  assert.equal(store.getItem("mb_refresh_token"), null);
  const sessionCall = fetchCalls.find((c) => String(c.url).includes("/api/auth/session"));
  assert.ok(sessionCall, "POST /api/auth/session performed");
  assert.equal(sessionCall.init.method, "POST");
  assert.deepEqual(JSON.parse(sessionCall.init.body), { access_token: "access-1", refresh_token: "refresh-1" });
});

test("20 parallel 401s produce exactly one server-side refresh request", async () => {
  await setSessionTokens("stale-access", "refresh-1");
  fetchCalls.length = 0;
  const results = await Promise.all(Array.from({ length: 20 }, () => refreshAccessToken()));
  const refreshCalls = fetchCalls.filter((c) => String(c.url).includes("/api/auth/refresh"));
  assert.equal(refreshCalls.length, 1);
  assert.equal(refreshCalls[0].init.method, "POST");
  // The refresh token itself never travels from the client: it lives in the cookie.
  assert.equal(JSON.parse(refreshCalls[0].init.body || "null"), null);
  assert.deepEqual([...new Set(results)], ["access-1"]);
  assert.equal(getAccessToken(), "access-1");
});

test("a session refresh shares the same in-flight request as the requests around it", async () => {
  await setSessionTokens("stale-access", "refresh-1");
  fetchCalls.length = 0;
  const [token, session] = await Promise.all([refreshAccessToken(), refreshSessionResult()]);
  assert.equal(fetchCalls.filter((c) => String(c.url).includes("/api/auth/refresh")).length, 1);
  assert.equal(token, "access-1");
  assert.equal(session.ok, true);
  assert.equal(session.data.access_token, "access-1");
});

test("a rejected refresh clears the session and announces the expired session", async () => {
  await setSessionTokens("stale-access", "refresh-1");
  fetchCalls.length = 0;
  fetchPlan = () => jsonResponse(401, { ok: false, error: { code: "INVALID_REFRESH", message: "nope" } });
  const result = await refreshSessionResult();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_REFRESH");
  assert.equal(getAccessToken(), null);
  assert.equal(hasAccessToken(), false);
  assert.deepEqual(events, [SESSION_EXPIRED_EVENT]);
});

test("a 502 auth outage keeps the session instead of logging the user out", async () => {
  await setSessionTokens("stale-access", "refresh-1");
  fetchPlan = () => jsonResponse(502, { ok: false, error: { code: "UPSTREAM", message: "later" } });
  const result = await refreshSessionResult();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UPSTREAM");
  assert.equal(hasAccessToken(), true);
  assert.deepEqual(events, []);
});

test("a network failure reports NETWORK and does not clear the session", async () => {
  await setSessionTokens("stale-access", "refresh-1");
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  const result = await refreshSessionResult();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NETWORK");
  assert.equal(hasAccessToken(), true);
});

test("a non-JSON refresh answer is reported as BAD_RESPONSE, not as a silent success", async () => {
  await setSessionTokens("stale-access", "refresh-1");
  fetchPlan = () => jsonResponse(200, "<html>proxy error</html>");
  const result = await refreshSessionResult();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "BAD_RESPONSE");
});

test("a 200 without access_token in the body is a BAD_RESPONSE", async () => {
  await setSessionTokens("stale-access", "refresh-1");
  fetchPlan = () => jsonResponse(200, { ok: true });
  const result = await refreshSessionResult();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "BAD_RESPONSE");
});

test("clearSessionTokens clears the in-memory token and legacy localStorage keys", async () => {
  store.setItem("mb_access_token", "legacy");
  store.setItem("mb_refresh_token", "legacy");
  await setSessionTokens(jwt("user-a"), "refresh-1");
  clearSessionTokens();
  assert.equal(getAccessToken(), null);
  assert.equal(hasAccessToken(), false);
  assert.equal(store.getItem("mb_access_token"), null);
  assert.equal(store.getItem("mb_refresh_token"), null);
});

test("switching accounts resets user-scoped caches; theme keys are never touched", async () => {
  store.setItem("mb_app_theme", "midnight");
  store.setItem("mb_theme", "dark");
  let resets = 0;
  const { registerUserScopeReset } = await import("../src/lib/auth/session.ts");
  registerUserScopeReset(() => {
    resets += 1;
  });
  await setSessionTokens(jwt("user-a"), "refresh-a");
  assert.equal(resets, 1); // anonymous → signed in
  assert.equal(currentUserScope(), "user-a");
  await setSessionTokens(jwt("user-b"));
  assert.equal(resets, 2); // the account behind the token changed
  assert.equal(currentUserScope(), "user-b");
  clearSessionTokens();
  assert.equal(resets, 3);
  assert.equal(currentUserScope(), "anon");
  // Theme keys stay untouched by the legacy cleanup.
  assert.equal(store.getItem("mb_app_theme"), "midnight");
  assert.equal(store.getItem("mb_theme"), "dark");
});
