import test from "node:test";
import assert from "node:assert/strict";
import { authenticateSupabaseRequest, getSupabaseProfileBundle, listSupabaseHomeworks, listSupabasePublishedTests, listSupabaseSchedule, listSupabaseSubjects, loginSupabaseUser, logoutSupabaseSession, recoverSupabasePassword, refreshSupabaseSession, registerSupabaseUser, searchSupabaseContent } from "../src/supabase-auth.js";

function request(authorization) {
  const headers = authorization ? { authorization } : {};
  return new Request("https://api-shadow.example.test/api/v1/me", { headers });
}

const configured = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
};

test("subjects list uses the caller JWT and filters specialty-scoped subjects by active group", async () => {
  const seen = [];
  const result = await listSupabaseSubjects(request("Bearer valid-user-token"), configured, { course: "2", semester: "3" }, async (url, init) => {
    seen.push({ url: String(url), authorization: init.headers.authorization });
    if (String(url).includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "user-1", email: "student@example.com" }), { status: 200 });
    }
    if (String(url).includes("/rest/v1/group_memberships")) {
      return new Response(JSON.stringify([{ groups: { specialty_slug: "mbh" } }]), { status: 200 });
    }
    if (String(url).includes("/rest/v1/subjects")) {
      const parsed = new URL(String(url));
      assert.equal(parsed.searchParams.get("course_number"), "eq.2");
      assert.equal(parsed.searchParams.get("semester"), "eq.3");
      return new Response(JSON.stringify([
        { id: "1", slug: "histology", specialty_slug: "histology", name: "Гистология" },
        { id: "2", slug: "anatomy", specialty_slug: "mbh", name: "Анатомия" },
        { id: "3", slug: "other", specialty_slug: "nursing", name: "Другой профиль" },
        { id: "4", slug: "general", specialty_slug: null, name: "Общий предмет" },
      ]), { status: 200 });
    }
    throw new Error("unexpected endpoint");
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items.map((item) => item.id), ["1", "2", "4"]);
  assert.equal(seen.length, 3);
  assert.ok(seen.every((call) => call.authorization === "Bearer valid-user-token"));
});

test("subjects list fails closed when the membership/RLS access check is unavailable", async () => {
  let calls = 0;
  const result = await listSupabaseSubjects(request("Bearer valid-user-token"), configured, {}, async (url) => {
    calls += 1;
    if (String(url).includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    }
    return new Response("denied", { status: 403 });
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, "DB_UNAVAILABLE");
  assert.equal(calls, 2);
});

test("subjects list rejects invalid course and semester filters", async () => {
  const result = await listSupabaseSubjects(request("Bearer valid-user-token"), configured, { course: "99" }, async () =>
    new Response(JSON.stringify({ id: "user-1" }), { status: 200 }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.code, "VALIDATION_ERROR");
});

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


test("login validates credentials and requires HTTPS Supabase configuration", async () => {
  const missing = await loginSupabaseUser("", "password123", configured, async () => {
    throw new Error("should not be called");
  });
  assert.equal(missing.status, 422);
  const insecure = await loginSupabaseUser("student@example.com", "password123", {
    ...configured, SUPABASE_URL: "http://project-id.supabase.co",
  }, async () => {
    throw new Error("should not be called");
  });
  assert.equal(insecure.status, 503);
});

test("login exchanges credentials and returns a normalized session without trusting user_metadata role", async () => {
  let calledUrl = "";
  let calledInit;
  const result = await loginSupabaseUser("student@example.com", "safe-password", configured, async (url, init) => {
    calledUrl = url;
    calledInit = init;
    return new Response(JSON.stringify({
      access_token: "access",
      refresh_token: "refresh",
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
  assert.equal(calledUrl, "https://project-id.supabase.co/auth/v1/token?grant_type=password");
  assert.equal(calledInit.method, "POST");
  assert.equal(calledInit.redirect, "error");
  assert.deepEqual(JSON.parse(calledInit.body), { email: "student@example.com", password: "safe-password" });
  assert.equal(result.ok, true);
  assert.equal(result.data.user.role, "student");
  assert.equal(result.data.access_token, "access");
});

test("login normalizes invalid credentials, throttling and upstream failures", async () => {
  const invalid = await loginSupabaseUser("student@example.com", "wrong-password", configured, async () =>
    new Response("private auth details", { status: 400 })
  );
  assert.equal(invalid.status, 401);
  assert.equal(invalid.message, "Invalid credentials");
  const limited = await loginSupabaseUser("student@example.com", "password", configured, async () =>
    new Response("limited", { status: 429 })
  );
  assert.equal(limited.status, 429);
  const outage = await loginSupabaseUser("student@example.com", "password", configured, async () =>
    new Response("private details", { status: 503 })
  );
  assert.equal(outage.status, 502);
  assert.equal(outage.message.includes("private"), false);
});


test("registration validates name, email and password before contacting Supabase", async () => {
  const shortName = await registerSupabaseUser("student@example.com", "password123", "A", configured, async () => {
    throw new Error("should not be called");
  });
  assert.equal(shortName.status, 422);
  const shortPassword = await registerSupabaseUser("student@example.com", "short", "Student", configured, async () => {
    throw new Error("should not be called");
  });
  assert.equal(shortPassword.status, 422);
  const invalidEmail = await registerSupabaseUser("not-an-email", "password123", "Student", configured, async () => {
    throw new Error("should not be called");
  });
  assert.equal(invalidEmail.status, 422);
});

test("registration sends full-name metadata and handles email-confirmation-only response", async () => {
  let calledUrl = "";
  let calledInit;
  const result = await registerSupabaseUser("student@example.com", "safe-password", "Student User", configured, async (url, init) => {
    calledUrl = url;
    calledInit = init;
    return new Response(JSON.stringify({
      user: {
        id: "user-123",
        email: "student@example.com",
        user_metadata: { full_name: "Student User", role: "admin" },
        app_metadata: {},
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(calledUrl, "https://project-id.supabase.co/auth/v1/signup");
  assert.equal(calledInit.method, "POST");
  assert.deepEqual(JSON.parse(calledInit.body), {
    email: "student@example.com",
    password: "safe-password",
    data: { full_name: "Student User", name: "Student User" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.needs_email_confirm, true);
  assert.equal(result.data.access_token, null);
  assert.equal(result.data.user.full_name, "Student User");
  assert.equal(result.data.user.role, null);
});

test("registration hides Supabase account errors and maps throttling safely", async () => {
  const duplicate = await registerSupabaseUser("student@example.com", "password123", "Student", configured, async () =>
    new Response("account already exists", { status: 422 })
  );
  assert.equal(duplicate.status, 422);
  assert.equal(duplicate.message, "Registration could not be completed");
  const limited = await registerSupabaseUser("student@example.com", "password123", "Student", configured, async () =>
    new Response("limited", { status: 429 })
  );
  assert.equal(limited.status, 429);
});


test("profile bundle uses caller JWT and returns only caller-scoped profile, roles and active groups", async () => {
  const calls = [];
  const result = await getSupabaseProfileBundle(request("Bearer valid-user-token"), configured, async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "user-123", email: "student@example.com" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    const parsed = new URL(String(url));
    assert.equal(init.headers.apikey, configured.SUPABASE_ANON_KEY);
    assert.equal(init.headers.authorization, "Bearer valid-user-token");
    assert.equal(init.redirect, "error");
    if (parsed.pathname === "/rest/v1/users") {
      assert.equal(parsed.searchParams.get("id"), "eq.user-123");
      return new Response(JSON.stringify([{
        id: "user-123", full_name: "Student", email: "student@example.com",
        avatar_url: null, course_number: 2, semester: 3,
      }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (parsed.pathname === "/rest/v1/user_roles") {
      assert.equal(parsed.searchParams.get("user_id"), "eq.user-123");
      return new Response(JSON.stringify([{ roles: { code: "student" } }]), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (parsed.pathname === "/rest/v1/group_memberships") {
      assert.equal(parsed.searchParams.get("user_id"), "eq.user-123");
      return new Response(JSON.stringify([{
        group_id: "group-1", role_in_group: "student", is_active: true,
        groups: { id: "group-1", code: "MBH-201", name: "МБХ-201", course_number: 2, admission_year: 2025, is_active: true },
      }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("Unexpected endpoint " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.user.id, "user-123");
  assert.equal(result.data.user.group_code, "MBH-201");
  assert.equal(result.data.course, 2);
  assert.equal(result.data.semester, 3);
  assert.deepEqual(result.data.roles, ["student"]);
  assert.equal(result.data.groups.length, 1);
  assert.equal(calls.length, 4);
});

test("profile bundle falls back to minimal identity when optional RLS profile queries are unavailable", async () => {
  let calls = 0;
  const result = await getSupabaseProfileBundle(request("Bearer valid-user-token"), configured, async (url) => {
    calls += 1;
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "user-123", email: "student@example.com" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return new Response("RLS denied", { status: 403 });
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.user.id, "user-123");
  assert.equal(result.data.user.email, "student@example.com");
  assert.deepEqual(result.data.roles, []);
  assert.deepEqual(result.data.groups, []);
  assert.equal(calls, 4);
});


test("search requires authentication and returns an empty contract for a blank query", async () => {
  let calls = 0;
  const result = await searchSupabaseContent(request("Bearer valid-user-token"), configured, { q: "   " }, async (url, init) => {
    calls += 1;
    assert.equal(String(url), "https://project-id.supabase.co/auth/v1/user");
    assert.equal(init.headers.authorization, "Bearer valid-user-token");
    return new Response(JSON.stringify({ id: "user-123", email: "student@example.com" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { query: "", total: 0, items: [], facets: { subjects: [], types: {} } });
  assert.equal(calls, 1);
});

test("search queries only caller-scoped published questions and normalizes facets", async () => {
  const calls = [];
  const result = await searchSupabaseContent(request("Bearer valid-user-token"), configured, {
    q: "mitosis", type: "question", limit: "10", subject_slug: "histology",
  }, async (url, init) => {
    const parsed = new URL(String(url));
    calls.push({ parsed, init });
    if (parsed.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ id: "user-123", email: "student@example.com" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    assert.equal(init.headers.authorization, "Bearer valid-user-token");
    assert.equal(init.headers.apikey, configured.SUPABASE_ANON_KEY);
    if (parsed.pathname === "/rest/v1/subjects") {
      assert.equal(parsed.searchParams.get("is_active"), "eq.true");
      return new Response(JSON.stringify([{ id: "subject-1", name: "Гистология", slug: "histology", description: "" }]), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (parsed.pathname === "/rest/v1/questions") {
      assert.equal(parsed.searchParams.get("is_published"), "eq.true");
      assert.equal(parsed.searchParams.get("archived_at"), "is.null");
      return new Response(JSON.stringify([
        { id: "q1", subject_id: "subject-1", topic: "Клеточный цикл", text: "Что такое mitosis?", answer: "Деление клетки" },
        { id: "q2", subject_id: "subject-2", topic: "Другой предмет", text: "Mitosis unrelated subject", answer: "private" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("Unexpected endpoint " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.total, 1);
  assert.equal(result.data.items[0].id, "q-q1");
  assert.equal(result.data.items[0].answer, "Деление клетки");
  assert.equal(result.data.items[0].href, "/subjects/histology?tab=practice");
  assert.deepEqual(result.data.facets.subjects, [{ subject: "Гистология", subject_slug: "histology", count: 1 }]);
  assert.deepEqual(result.data.facets.types, { question: 1 });
  assert.equal(calls.length, 3);
});

test("search rejects invalid type and maps Supabase RLS failures to a generic service error", async () => {
  const invalid = await searchSupabaseContent(request("Bearer valid-user-token"), configured, { q: "test", type: "admin" }, async () =>
    new Response(JSON.stringify({ id: "user-123" }), { status: 200, headers: { "content-type": "application/json" } })
  );
  assert.equal(invalid.status, 422);
  const denied = await searchSupabaseContent(request("Bearer valid-user-token"), configured, { q: "test", type: "subject" }, async (url) => {
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "user-123" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("RLS details must not leak", { status: 403 });
  });
  assert.equal(denied.status, 503);
  assert.equal(denied.message, "Поиск временно недоступен");
});


test("subject detail requires an authenticated caller and validates the subject id", async () => {
  const request = new Request("https://worker.example/api/v1/subjects/subject-1");
  const unauthenticated = await getSupabaseSubjectDetail(request, "subject-1", configured, async () => {
    throw new Error("should not be called");
  });
  assert.equal(unauthenticated.status, 401);
  const invalid = await getSupabaseSubjectDetail(
    new Request("https://worker.example/api/v1/subjects/subject-1", { headers: { authorization: "Bearer valid-token" } }),
    "../users",
    configured,
    async () => new Response(JSON.stringify({ id: "user-1", email: "student@example.com" }), { status: 200 })
  );
  assert.equal(invalid.status, 422);
});

test("subject detail queries only with the caller JWT and returns the PHP-compatible subject/modules shape", async () => {
  const calls = [];
  const request = new Request("https://worker.example/api/v1/subjects/subject-1", {
    headers: { authorization: "Bearer valid-token" },
  });
  const result = await getSupabaseSubjectDetail(request, "subject-1", configured, async (url, init) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, init });
    if (parsed.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ id: "user-1", email: "student@example.com" }), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/subjects") {
      return new Response(JSON.stringify([{ id: "subject-1", name: "Histology", is_active: true }]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/modules") {
      return new Response(JSON.stringify([{ id: "module-1", title: "Cell", sort_order: 1 }]), { status: 200 });
    }
    throw new Error("unexpected endpoint " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.subject.name, "Histology");
  assert.deepEqual(result.data.modules, [{ id: "module-1", title: "Cell", sort_order: 1 }]);
  const restCalls = calls.filter((call) => call.url.pathname.startsWith("/rest/v1/"));
  assert.equal(restCalls.length, 2);
  for (const call of restCalls) {
    assert.equal(call.init.headers.authorization, "Bearer valid-token");
    assert.equal(call.init.headers.apikey, configured.SUPABASE_ANON_KEY);
  }
});

test("subject detail returns 404 for missing subjects and 503 when RLS denies reads", async () => {
  const request = new Request("https://worker.example/api/v1/subjects/subject-1", {
    headers: { authorization: "Bearer valid-token" },
  });
  const missing = await getSupabaseSubjectDetail(request, "subject-1", configured, async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    return new Response("[]", { status: 200 });
  });
  assert.equal(missing.status, 404);
  const denied = await getSupabaseSubjectDetail(request, "subject-1", configured, async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    return new Response("denied", { status: 403 });
  });
  assert.equal(denied.status, 503);
});


test("schedule read is restricted to active memberships and joins schedule metadata", async () => {
  const seen = [];
  const result = await listSupabaseSchedule(request("Bearer valid-user-token"), configured, {
    from: "2026-10-12", to: "2026-10-20", group_id: "group-1",
  }, async (url, init) => {
    const parsed = new URL(String(url));
    seen.push({ path: parsed.pathname, query: parsed.search, authorization: init.headers.authorization });
    if (parsed.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    if (parsed.pathname === "/rest/v1/group_memberships") return new Response(JSON.stringify([{ group_id: "group-1", groups: { id: "group-1", name: "МБХ-201", course_number: 2 } }]), { status: 200 });
    if (parsed.pathname === "/rest/v1/schedules") return new Response(JSON.stringify([{ id: "schedule-1", group_id: "group-1", semester: 3, academic_year: "2026/2027" }]), { status: 200 });
    if (parsed.pathname === "/rest/v1/schedule_entries") return new Response(JSON.stringify([{ id: "entry-1", schedule_id: "schedule-1", subject_id: "subject-1", date: "2026-10-13", start_time: "09:00:00", end_time: "10:30:00", subject_name: "Гистология" }]), { status: 200 });
    if (parsed.pathname === "/rest/v1/subjects") return new Response(JSON.stringify([{ id: "subject-1", name: "Гистология", slug: "histology", color_hex: "#123456" }]), { status: 200 });
    return new Response(JSON.stringify([]), { status: 200 });
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].subject, "Гистология");
  assert.equal(result.data.items[0].group_id, "group-1");
  assert.ok(seen.every((item) => item.authorization === "Bearer valid-user-token"));
  assert.match(seen.find((item) => item.path === "/rest/v1/schedules").query, /group_id=in/);
});

test("schedule read rejects a group outside the caller's active memberships", async () => {
  const result = await listSupabaseSchedule(request("Bearer valid-user-token"), configured, { group_id: "other-group" }, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    if (String(url).includes("/rest/v1/group_memberships")) return new Response(JSON.stringify([{ group_id: "group-1", groups: { id: "group-1", name: "Group 1" } }]), { status: 200 });
    throw new Error("The helper should reject before querying schedules");
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, "GROUP_ACCESS_DENIED");
});

test("published test catalog never requests question answers or user attempts", async () => {
  const result = await listSupabasePublishedTests(request("Bearer valid-user-token"), configured, { limit: "10" }, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/rest/v1/tests");
    assert.ok(!parsed.searchParams.get("select").includes("answer"));
    assert.ok(!parsed.searchParams.get("select").includes("attempt"));
    return new Response(JSON.stringify([{ id: "test-1", title: "Тест", is_published: true }]), { status: 200 });
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.items[0].id, "test-1");
});
