import test from "node:test";
import assert from "node:assert/strict";
import { authenticateSupabaseRequest } from "../src/supabase-auth.js";

function request(authorization) {
  const headers = authorization ? { authorization } : {};
  return new Request("https://api-shadow.example.test/api/v1/me", { headers });
}

const configured = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
};

test("authentication requires a Bearer header and never calls upstream without it", async () => {
  let calls = 0;
  const result = await authenticateSupabaseRequest(request(""), configured, async () => {
    calls += 1;
    throw new Error("should not be called");
  });
  assert.equal(result.status, 401);
  assert.equal(result.code, "UNAUTHORIZED");
  assert.equal(calls, 0);
});

test("authentication fails closed when Supabase configuration is missing", async () => {
  const result = await authenticateSupabaseRequest(request("Bearer user-token"), {}, async () => {
    throw new Error("should not be called");
  });
  assert.equal(result.status, 503);
  assert.equal(result.code, "AUTH_NOT_CONFIGURED");
});

test("authentication refuses a non-HTTPS Supabase origin", async () => {
  const result = await authenticateSupabaseRequest(request("Bearer user-token"), {
    ...configured,
    SUPABASE_URL: "http://project-id.supabase.co",
  }, async () => {
    throw new Error("should not be called");
  });
  assert.equal(result.status, 503);
  assert.equal(result.code, "AUTH_NOT_CONFIGURED");
});

test("valid access token is checked by Supabase and only canonical identity is returned", async () => {
  let calledUrl = "";
  let calledInit;
  const result = await authenticateSupabaseRequest(request("Bearer valid-user-token"), configured, async (url, init) => {
    calledUrl = url;
    calledInit = init;
    return new Response(JSON.stringify({
      id: "user-123",
      email: "student@example.com",
      user_metadata: { role: "admin" },
      app_metadata: { role: "unreviewed-role" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  });

  assert.equal(calledUrl, "https://project-id.supabase.co/auth/v1/user");
  assert.equal(calledInit.headers.apikey, configured.SUPABASE_ANON_KEY);
  assert.equal(calledInit.headers.authorization, "Bearer valid-user-token");
  assert.equal(calledInit.redirect, "error");
  assert.equal(result.ok, true);
  assert.deepEqual(result.user, { id: "user-123", email: "student@example.com" });
  assert.equal("role" in result.user, false);
});

test("expired token returns 401", async () => {
  const result = await authenticateSupabaseRequest(request("Bearer expired-token"), configured, async () =>
    new Response(JSON.stringify({ message: "expired" }), { status: 401 })
  );
  assert.equal(result.status, 401);
  assert.equal(result.code, "UNAUTHORIZED");
});

test("Supabase server errors are distinguished from invalid credentials", async () => {
  const result = await authenticateSupabaseRequest(request("Bearer user-token"), configured, async () =>
    new Response("upstream error", { status: 503 })
  );
  assert.equal(result.status, 502);
  assert.equal(result.code, "AUTH_UPSTREAM_ERROR");
});

test("network failure returns a generic upstream error without leaking details", async () => {
  const result = await authenticateSupabaseRequest(request("Bearer user-token"), configured, async () => {
    throw new Error("secret network detail");
  });
  assert.equal(result.status, 502);
  assert.equal(result.message, "Could not reach Supabase Auth");
  assert.equal(result.message.includes("secret network detail"), false);
});

import { logoutSupabaseSession } from "../src/supabase-auth.js";

test("logout requires a token and makes no upstream request without it", async () => {
  let calls = 0;
  const result = await logoutSupabaseSession("", configured, async () => { calls += 1; });
  assert.equal(result.status, 401);
  assert.equal(result.code, "UNAUTHORIZED");
  assert.equal(calls, 0);
});

test("logout refuses missing configuration and non-HTTPS Supabase URLs", async () => {
  const missing = await logoutSupabaseSession("user-token", {}, async () => {
    throw new Error("should not be called");
  });
  assert.equal(missing.status, 503);
  const insecure = await logoutSupabaseSession("user-token", {
    ...configured, SUPABASE_URL: "http://project-id.supabase.co",
  }, async () => {
    throw new Error("should not be called");
  });
  assert.equal(insecure.status, 503);
});

test("logout sends the caller token and anon key to the configured Supabase endpoint", async () => {
  let calledUrl = "";
  let calledInit;
  const result = await logoutSupabaseSession("caller-access-token", configured, async (url, init) => {
    calledUrl = url;
    calledInit = init;
    return new Response(null, { status: 204 });
  });
  assert.equal(result.ok, true);
  assert.equal(calledUrl, "https://project-id.supabase.co/auth/v1/logout");
  assert.equal(calledInit.method, "POST");
  assert.equal(calledInit.headers.apikey, configured.SUPABASE_ANON_KEY);
  assert.equal(calledInit.headers.authorization, "Bearer caller-access-token");
  assert.equal(calledInit.redirect, "error");
});

test("logout maps expired tokens to 401 and upstream/network failures to generic errors", async () => {
  const expired = await logoutSupabaseSession("expired-token", configured, async () =>
    new Response("unauthorized", { status: 401 })
  );
  assert.equal(expired.status, 401);
  const upstream = await logoutSupabaseSession("user-token", configured, async () =>
    new Response("internal details", { status: 503 })
  );
  assert.equal(upstream.status, 502);
  assert.equal(upstream.message.includes("internal details"), false);
  const network = await logoutSupabaseSession("user-token", configured, async () => {
    throw new Error("private network details");
  });
  assert.equal(network.status, 502);
  assert.equal(network.message.includes("private network details"), false);
});
