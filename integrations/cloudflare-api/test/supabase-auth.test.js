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

import { logoutSupabaseSession, recoverSupabasePassword, refreshSupabaseSession } from "../src/supabase-auth.js";

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


test("refresh rejects missing token without contacting Supabase", async () => {
  let calls = 0;
  const result = await refreshSupabaseSession("", configured, async () => { calls += 1; });
  assert.equal(result.status, 422);
  assert.equal(result.code, "VALIDATION_ERROR");
  assert.equal(calls, 0);
});

test("refresh requires HTTPS and configured anon key", async () => {
  const missing = await refreshSupabaseSession("refresh-token", {}, async () => {
    throw new Error("should not be called");
  });
  assert.equal(missing.status, 503);
  const insecure = await refreshSupabaseSession("refresh-token", {
    ...configured, SUPABASE_URL: "http://project-id.supabase.co",
  }, async () => {
    throw new Error("should not be called");
  });
  assert.equal(insecure.status, 503);
});

test("refresh exchanges the token and normalizes session without trusting user_metadata role", async () => {
  let calledUrl = "";
  let calledInit;
  const result = await refreshSupabaseSession("old-refresh-token", configured, async (url, init) => {
    calledUrl = url;
    calledInit = init;
    return new Response(JSON.stringify({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user: {
        id: "user-123",
        email: "student@example.com",
        user_metadata: { full_name: "Student", role: "admin" },
        app_metadata: { role: "student" },
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(calledUrl, "https://project-id.supabase.co/auth/v1/token?grant_type=refresh_token");
  assert.equal(calledInit.method, "POST");
  assert.equal(calledInit.headers.apikey, configured.SUPABASE_ANON_KEY);
  assert.equal(calledInit.headers.authorization, "Bearer " + configured.SUPABASE_ANON_KEY);
  assert.deepEqual(JSON.parse(calledInit.body), { refresh_token: "old-refresh-token" });
  assert.equal(calledInit.redirect, "error");
  assert.equal(result.ok, true);
  assert.equal(result.data.access_token, "new-access-token");
  assert.equal(result.data.user.full_name, "Student");
  assert.equal(result.data.user.role, "student");
});

test("refresh maps invalid tokens and hides upstream details", async () => {
  const invalid = await refreshSupabaseSession("expired-token", configured, async () =>
    new Response("invalid", { status: 400 })
  );
  assert.equal(invalid.status, 401);
  assert.equal(invalid.code, "AUTH_REFRESH_FAILED");
  const failed = await refreshSupabaseSession("token", configured, async () =>
    new Response("sensitive upstream details", { status: 503 })
  );
  assert.equal(failed.status, 502);
  assert.equal(failed.message.includes("sensitive"), false);
});


test("password recovery requires email and configured HTTPS Supabase", async () => {
  const missing = await recoverSupabasePassword("", configured, async () => {
    throw new Error("should not be called");
  });
  assert.equal(missing.status, 422);
  const unconfigured = await recoverSupabasePassword("student@example.com", {}, async () => {
    throw new Error("should not be called");
  });
  assert.equal(unconfigured.status, 503);
  const insecure = await recoverSupabasePassword("student@example.com", {
    ...configured, MEDBIOHIM_APP_ORIGIN: "http://medbiohim.example",
  }, async () => {
    throw new Error("should not be called");
  });
  assert.equal(insecure.status, 503);
});

test("password recovery uses a fixed HTTPS callback and does not disclose account existence", async () => {
  let calledUrl = "";
  let calledInit;
  const result = await recoverSupabasePassword("student@example.com", configured, async (url, init) => {
    calledUrl = url;
    calledInit = init;
    return new Response(null, { status: 200 });
  });
  const parsed = new URL(calledUrl);
  assert.equal(parsed.origin, "https://project-id.supabase.co");
  assert.equal(parsed.pathname, "/auth/v1/recover");
  assert.equal(parsed.searchParams.get("redirect_to"), "https://medbiohim.vercel.app/auth/callback");
  assert.equal(calledInit.method, "POST");
  assert.equal(calledInit.headers.apikey, configured.SUPABASE_ANON_KEY);
  assert.deepEqual(JSON.parse(calledInit.body), { email: "student@example.com" });
  assert.deepEqual(result, { ok: true, data: { sent: true } });
  const unknown = await recoverSupabasePassword("nobody@example.com", configured, async () =>
    new Response("not found", { status: 400 })
  );
  assert.deepEqual(unknown, { ok: true, data: { sent: true } });
});

test("password recovery maps upstream throttling and outages safely", async () => {
  const limited = await recoverSupabasePassword("student@example.com", configured, async () =>
    new Response("limited", { status: 429 })
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.code, "RATE_LIMITED");
  const outage = await recoverSupabasePassword("student@example.com", configured, async () =>
    new Response("private upstream details", { status: 503 })
  );
  assert.equal(outage.status, 502);
  assert.equal(outage.message.includes("private"), false);
});
