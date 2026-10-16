import test from "node:test";
import assert from "node:assert/strict";
import { authenticateSupabaseRequest, getSupabaseLecture, getSupabaseProfileBundle, getSupabaseProgress, getSupabaseScheduleMeta, getSupabaseSiteContent, getSupabaseSubjectDetail, getSupabaseSubjectGradebook, getSupabaseSubjectCatalog, getSupabaseSubjectPlan, listSupabaseExamQuestions, listSupabaseGroups, listSupabaseHomeworks, listSupabaseLectures, listSupabasePublishedTests, listSupabaseQuestionSubjects, listSupabaseSchedule, listSupabaseSubjectPlans, listSupabaseSubjects, loginSupabaseUser, logoutSupabaseSession, recoverSupabasePassword, refreshSupabaseSession, registerSupabaseUser, searchSupabaseContent } from "../src/supabase-auth.js";

function request(authorization) {
  const headers = authorization ? { authorization } : {};
  return new Request("https://api-shadow.example.test/api/v1/me", { headers });
}

const configured = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
};

test("groups list uses the caller JWT, returns only active-or-null groups and preserves PHP ordering", async () => {
  const calls = [];
  const result = await listSupabaseGroups(request("Bearer valid-user-token"), configured, async (url, init) => {
    const parsed = new URL(String(url));
    calls.push({ parsed, authorization: init.headers.authorization, apikey: init.headers.apikey });
    if (parsed.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ id: "user-1", email: "student@example.com" }), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/groups") {
      assert.equal(parsed.searchParams.get("select"), "id,code,name,course_number,admission_year,is_active");
      assert.equal(parsed.searchParams.get("or"), "(is_active.eq.true,is_active.is.null)");
      assert.equal(parsed.searchParams.get("order"), "course_number.asc.nullslast,code.asc");
      return new Response(JSON.stringify([
        { id: "group-1", code: "MBH-201", name: "МБХ-201", course_number: 2, is_active: true },
        { id: "group-2", code: "LEGACY", name: "Legacy active", course_number: null, is_active: null },
      ]), { status: 200 });
    }
    throw new Error("unexpected endpoint");
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items.map((group) => group.id), ["group-1", "group-2"]);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.authorization === "Bearer valid-user-token"));
  assert.ok(calls.every((call) => call.apikey === configured.SUPABASE_ANON_KEY));
});

test("groups list fails closed when the caller's RLS does not permit reading groups", async () => {
  let calls = 0;
  const result = await listSupabaseGroups(request("Bearer valid-user-token"), configured, async (url) => {
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

test("subjects list uses the caller JWT and filters specialty-scoped subjects by active group", async () => {
  const seen = [];
  const result = await listSupabaseSubjects(request("Bearer valid-user-token"), configured, { course: "2", semester: "3" }, async (url, init) => {
    seen.push({ url: String(url), authorization: init.headers.authorization });
    if (String(url).includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "user-1", email: "student@example.com" }), { status: 200 });
    }
    if (String(url).includes("/rest/v1/group_memberships")) {
      return new Response(JSON.stringify([{ group_id: "11111111-1111-4111-8111-111111111111", groups: { specialty_slug: "mbh", is_active: true } }]), { status: 200 });
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
  assert.equal(calledInit.redirect, "manual");
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
  assert.equal(calledInit.redirect, "manual");
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
  assert.equal(calledInit.redirect, "manual");
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
  assert.equal(calledInit.redirect, "manual");
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
  assert.equal(calledInit.redirect, "manual");
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
  assert.equal(calledInit.redirect, "manual");
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
    assert.equal(init.redirect, "manual");
    if (parsed.pathname === "/rest/v1/users") {
      assert.equal(parsed.searchParams.get("id"), "eq.user-123");
      return new Response(JSON.stringify([{
        id: "user-123", full_name: "Student", email: "student@example.com",
        avatar_url: null, course_number: 2, semester: 3,
      }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (parsed.pathname === "/rest/v1/user_roles") {
      assert.equal(parsed.searchParams.get("user_id"), "eq.user-123");
      // The database may return student before admin; the API must normalize primary-role order.
      return new Response(JSON.stringify([
        { roles: { code: "student" } },
        { roles: { code: "admin" } },
        { roles: { code: "moderator" } },
      ]), { status: 200, headers: { "content-type": "application/json" } });
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
  assert.deepEqual(result.data.roles, ["admin", "moderator", "student"]);
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
        { id: "q1", subject_id: "subject-1", topic_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", text: "Что такое mitosis?", answer: "Деление клетки" },
        { id: "q2", subject_id: "subject-2", topic_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", text: "Mitosis unrelated subject", answer: "private" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (parsed.pathname === "/rest/v1/topics") {
      assert.equal(parsed.searchParams.get("select"), "id,title");
      assert.match(parsed.searchParams.get("id") || "", /^in\.\(/);
      return new Response(JSON.stringify([
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Клеточный цикл" },
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "Другой предмет" },
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
  assert.equal(calls.length, 4);
});

test("trainer search reads the sanitized public feed view, never the base table", async () => {
  const paths = [];
  const result = await searchSupabaseContent(request("Bearer valid-user-token"), configured, {
    q: "эритроцит",
    type: "trainer",
    subject_slug: "histology",
  }, async (url, init) => {
    const parsed = new URL(String(url));
    paths.push(parsed.pathname);
    if (parsed.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ id: "user-123", email: "student@example.com" }), { status: 200 });
    }
    assert.equal(init.headers.authorization, "Bearer valid-user-token");
    if (parsed.pathname === "/rest/v1/subjects") {
      return new Response(JSON.stringify([
        { id: "subject-1", name: "Гистология", slug: "histology", description: "" },
      ]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/trainer_feed_cards_public") {
      return new Response(JSON.stringify([{
        id: "card-1",
        subject_id: "subject-1",
        subject_slug: "histology",
        specialty_slug: "mbh",
        preparation: { name: "Эритроцит" },
        question: { prompt: "Определите форменные элементы крови" },
        tags: ["кровь"],
        is_published: true,
        created_at: "2026-10-14T00:00:00Z",
      }]), { status: 200 });
    }
    throw new Error("Unexpected endpoint " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.total, 1);
  assert.equal(result.data.items[0].title, "Эритроцит");
  assert.equal(result.data.items[0].href, "/trainers/feed/histology");
  assert.ok(paths.includes("/rest/v1/trainer_feed_cards_public"));
  assert.ok(!paths.includes("/rest/v1/trainer_feed_cards"));
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


test("gradebook helper checks the same active specialty access rules and reads rows with the caller JWT", async () => {
  const seen = [];
  const req = new Request("https://worker.example/api/v1/subjects/subject-1/gradebook", {
    headers: { authorization: "Bearer valid-token" },
  });
  const result = await getSupabaseSubjectGradebook(req, "subject-1", configured, async (url, init) => {
    const parsed = new URL(String(url));
    seen.push({ parsed, authorization: init.headers.authorization, apikey: init.headers.apikey });
    if (parsed.pathname === "/auth/v1/user") {
      return new Response(JSON.stringify({ id: "user-1", email: "student@example.com" }), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/subjects") {
      assert.equal(parsed.searchParams.get("id"), "eq.subject-1");
      assert.equal(parsed.searchParams.get("is_active"), "eq.true");
      return new Response(JSON.stringify([{ id: "subject-1", slug: "histology", specialty_slug: "histology", is_active: true }]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/group_memberships") {
      assert.equal(parsed.searchParams.get("user_id"), "eq.user-1");
      assert.equal(parsed.searchParams.get("is_active"), "eq.true");
      return new Response(JSON.stringify([{ group_id: "group-1", groups: { specialty_slug: "mbh", is_active: true } }]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/subject_gradebook_entries") {
      assert.equal(parsed.searchParams.get("subject_id"), "eq.subject-1");
      assert.equal(parsed.searchParams.get("select"), "id,subject_id,display_name,hours,credits,control_form,hours_scope,source_note,source_file");
      return new Response(JSON.stringify([{ id: "row-1", subject_id: "subject-1", display_name: "Основной курс" }]), { status: 200 });
    }
    throw new Error("unexpected endpoint " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items, [{ id: "row-1", subject_id: "subject-1", display_name: "Основной курс" }]);
  assert.equal(seen.length, 4);
  assert.ok(seen.every((call) => call.authorization === "Bearer valid-token"));
  assert.ok(seen.every((call) => call.apikey === configured.SUPABASE_ANON_KEY));
});

test("gradebook helper forbids unrelated specialty and does not query gradebook rows", async () => {
  const req = new Request("https://worker.example/api/v1/subjects/subject-1/gradebook", {
    headers: { authorization: "Bearer valid-token" },
  });
  let entriesRead = false;
  const result = await getSupabaseSubjectGradebook(req, "subject-1", configured, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    if (parsed.pathname === "/rest/v1/subjects") {
      return new Response(JSON.stringify([{ id: "subject-1", slug: "nursing-subject", specialty_slug: "nursing", is_active: true }]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/group_memberships") {
      return new Response(JSON.stringify([{ group_id: "group-1", groups: { specialty_slug: "mbh", is_active: true } }]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/subject_gradebook_entries") entriesRead = true;
    return new Response(JSON.stringify([]), { status: 200 });
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, "FORBIDDEN");
  assert.equal(entriesRead, false);
});

test("gradebook helper fails closed when subject or membership reads are denied", async () => {
  const req = new Request("https://worker.example/api/v1/subjects/subject-1/gradebook", {
    headers: { authorization: "Bearer valid-token" },
  });
  const subjectDenied = await getSupabaseSubjectGradebook(req, "subject-1", configured, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    return new Response("denied", { status: 403 });
  });
  assert.equal(subjectDenied.status, 503);
  assert.equal(subjectDenied.code, "DB_UNAVAILABLE");

  const membershipDenied = await getSupabaseSubjectGradebook(req, "subject-1", configured, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    if (parsed.pathname === "/rest/v1/subjects") return new Response(JSON.stringify([{ id: "subject-1", slug: "histology", specialty_slug: "histology", is_active: true }]), { status: 200 });
    return new Response("denied", { status: 403 });
  });
  assert.equal(membershipDenied.status, 503);
  assert.equal(membershipDenied.code, "DB_UNAVAILABLE");
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

test("subject detail queries modules and curriculum topics with the caller JWT", async () => {
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
      assert.equal(parsed.searchParams.get("select"), "id,title,order_index");
      assert.equal(parsed.searchParams.get("order"), "order_index.asc.nullslast,title.asc");
      return new Response(JSON.stringify([{ id: "module-1", title: "Cell", order_index: 1 }]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/topics") {
      assert.match(parsed.searchParams.get("module_id") || "", /module-1/);
      return new Response(JSON.stringify([
        { id: "topic-1", module_id: "module-1", title: "Cell membrane", order_index: 1 },
        { id: "topic-2", module_id: "module-1", title: "Cell cycle", order_index: 2 },
      ]), { status: 200 });
    }
    throw new Error("unexpected endpoint " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.subject.name, "Histology");
  assert.deepEqual(result.data.modules, [{
    id: "module-1",
    title: "Cell",
    sort_order: 1,
    topics: [
      { id: "topic-1", title: "Cell membrane", order_index: 1 },
      { id: "topic-2", title: "Cell cycle", order_index: 2 },
    ],
  }]);
  const restCalls = calls.filter((call) => call.url.pathname.startsWith("/rest/v1/"));
  assert.equal(restCalls.length, 3);
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

test("published test catalog returns linked question counts and metadata without answer keys or attempts", async () => {
  const result = await listSupabasePublishedTests(request("Bearer valid-user-token"), configured, { limit: "10" }, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    const parsed = new URL(String(url));
    if (parsed.pathname === "/rest/v1/group_memberships") return new Response("[]", { status: 200 });
    if (parsed.pathname === "/rest/v1/subjects") return new Response(JSON.stringify([{ id: "subject-1", name: "Биохимия", specialty_slug: null, is_active: true }]), { status: 200 });
    if (parsed.pathname === "/rest/v1/tests") {
      assert.ok(!parsed.searchParams.get("select").includes("answer"));
      assert.ok(!parsed.searchParams.get("select").includes("attempts("));
      assert.ok(parsed.searchParams.get("select").includes("modules(title,order_index)"));
      return new Response(JSON.stringify([{ id: "test-1", subject_id: "subject-1", title: "Тест", is_published: true, subjects: { name: "Биохимия" }, modules: { title: "Белки", order_index: 1 }, topics: { title: "Ферменты", order_index: 2 } }]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/test_questions") {
      assert.equal(parsed.searchParams.get("test_id"), "in.(test-1)");
      return new Response(JSON.stringify([{ test_id: "test-1", order_index: 0 }, { test_id: "test-1", order_index: 1 }]), { status: 200 });
    }
    throw new Error("unexpected path " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.items[0].id, "test-1");
  assert.equal(result.data.items[0].questions_count, 2);
  assert.equal(result.data.items[0].subject_name, "Биохимия");
  assert.equal(result.data.items[0].module_title, "Белки");
  assert.equal(result.data.items[0].topic_title, "Ферменты");
});


test("published tests are filtered by the selected active group's specialties", async () => {
  const groupId = "11111111-1111-4111-8111-111111111111";
  const subjectMbh = "22222222-2222-4222-8222-222222222222";
  const subjectHistology = "33333333-3333-4333-8333-333333333333";
  const subjectOther = "44444444-4444-4444-8444-444444444444";
  const testMbh = "55555555-5555-4555-8555-555555555555";
  const testOther = "66666666-6666-4666-8666-666666666666";
  const testGlobal = "77777777-7777-4777-8777-777777777777";
  const result = await listSupabasePublishedTests(request("Bearer valid-user-token"), configured, { limit: "20", group_id: groupId }, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    const parsed = new URL(String(url));
    if (parsed.pathname === "/rest/v1/group_memberships") {
      assert.equal(parsed.searchParams.get("group_id"), "eq." + groupId);
      return new Response(JSON.stringify([{ group_id: groupId, groups: { id: groupId, specialty_slug: "mbh", is_active: true } }]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/subjects") {
      return new Response(JSON.stringify([
        { id: subjectMbh, name: "Биохимия", specialty_slug: "mbh", is_active: true },
        { id: subjectHistology, name: "Гистология", specialty_slug: "histology", is_active: true },
        { id: subjectOther, name: "Чужой предмет", specialty_slug: "nursing", is_active: true },
      ]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/tests") {
      return new Response(JSON.stringify([
        { id: testMbh, subject_id: subjectMbh, title: "МБХ" },
        { id: testOther, subject_id: subjectOther, title: "Чужой тест" },
        { id: testGlobal, subject_id: null, title: "Общий тест" },
      ]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/test_questions") {
      assert.equal(parsed.searchParams.get("test_id"), "in.(" + testMbh + "," + testGlobal + ")");
      return new Response(JSON.stringify([{ test_id: testMbh, order_index: 0 }]), { status: 200 });
    }
    throw new Error("unexpected path " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items.map((item) => item.id), [testMbh, testGlobal]);
});
test("dashboard CMS read returns site defaults plus saved announcements", async () => {
  const result = await getSupabaseSiteContent(request("Bearer valid-user-token"), configured, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/rest/v1/site_content");
    assert.equal(parsed.searchParams.get("key"), "in.(site,announcements)");
    return new Response(JSON.stringify([
      { key: "site", payload: { title: "MEDBIOHIM", subtitle: "Для студентов" } },
      { key: "announcements", payload: { items: [{ id: "ann-1", title: "Обновление" }] } },
    ]), { status: 200 });
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.site.title, "MEDBIOHIM");
  assert.equal(result.data.site.subtitle, "Для студентов");
  assert.equal(result.data.announcements[0].id, "ann-1");
});


test("schedule metadata validates filters and returns calendar periods and duration rules", async () => {
  const result = await getSupabaseScheduleMeta(request("Bearer valid-user-token"), configured, { course: "2", semester: "3" }, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/academic_calendar_periods")) {
      assert.equal(parsed.searchParams.get("course_number"), "eq.2");
      assert.equal(parsed.searchParams.get("semester"), "eq.3");
      return new Response(JSON.stringify([{ id: "period-1", title: "Сессия" }]), { status: 200 });
    }
    if (parsed.pathname.endsWith("/subject_schedule_rules")) return new Response(JSON.stringify([{ id: "rule-1", subject_name: "Гистология", academic_hours: 2 }]), { status: 200 });
    throw new Error("Unexpected table");
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.periods[0].id, "period-1");
  assert.equal(result.data.duration_rules[0].id, "rule-1");
});


test("published question bank paginates and hides long answers unless explicitly requested", async () => {
  const answer = "Подробный правильный ответ ".repeat(8);
  const result = await listSupabaseExamQuestions(request("Bearer valid-user-token"), configured, {
    kind: "ticket", subject_slug: "histology", limit: "1", offset: "0",
  }, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    return new Response(JSON.stringify([
      { id: "question-1", subject_name: "Гистология", subject_slug: "histology", kind: "ticket", text: "Вопрос 1", answer },
      { id: "question-2", subject_name: "Физиология", subject_slug: "physiology", kind: "ticket", text: "Вопрос 2", answer: "Ответ" },
    ]), { status: 200 });
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.total, 1);
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].has_answer, true);
  assert.equal(result.data.items[0].answer, undefined);
  assert.ok(result.data.items[0].answer_preview.length > 120);
  assert.equal(result.data.answers_included, false);
});

test("question bank subject summary counts all published rows by subject and kind", async () => {
  const result = await listSupabaseQuestionSubjects(request("Bearer valid-user-token"), configured, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    return new Response(JSON.stringify([
      { id: "q1", subject_id: "s1", subject_name: "Гистология", subject_slug: "histology", kind: "ticket" },
      { id: "q2", subject_id: "s1", subject_name: "Гистология", subject_slug: "histology", kind: "exam" },
      { id: "q3", subject_id: "s2", subject_name: "Физиология", subject_slug: "physiology", kind: "ticket" },
    ]), { status: 200 });
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.items.find((item) => item.subject_id === "s1").count, 2);
  assert.equal(result.data.items.find((item) => item.subject_id === "s1").kinds.exam, 1);
});


test("published lectures include student-visible CMS lectures and published legacy histology lectures", async () => {
  const result = await listSupabaseLectures(request("Bearer valid-user-token"), configured, "histology", async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/site_content")) return new Response(JSON.stringify([{ payload: { items: [
      { id: "lecture-1", title: "Кровь", subject_slug: "histology", status: "published", body_md: "Контент" },
      { id: "draft-1", title: "Черновик", subject_slug: "histology", status: "draft" },
    ] } }]), { status: 200 });
    if (parsed.pathname.endsWith("/histology_lectures")) return new Response(JSON.stringify([
      { id: "legacy-1", title: "Электроннограммы", subject_slug: "histology", kind: "EM", is_published: true, body_markdown: "Текст" },
    ]), { status: 200 });
    throw new Error("Unexpected table");
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.items.length, 2);
  assert.ok(result.data.items.some((row) => row.id === "lecture-1"));
  assert.ok(result.data.items.some((row) => row.id === "histology-legacy-1"));
  assert.ok(!result.data.items.some((row) => row.id === "draft-1"));
});

test("lecture detail only returns a published matching lecture", async () => {
  const result = await getSupabaseLecture(request("Bearer valid-user-token"), "lecture-1", configured, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/site_content")) return new Response(JSON.stringify([{ payload: { items: [
      { id: "lecture-1", title: "Кровь", subject_slug: "histology", status: "published" },
    ] } }]), { status: 200 });
    if (parsed.pathname.endsWith("/histology_lectures")) return new Response(JSON.stringify([]), { status: 200 });
    throw new Error("Unexpected table");
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.lecture.title, "Кровь");
});


test("subject plan catalog only returns site_content subject_plan keys", async () => {
  const result = await listSupabaseSubjectPlans(request("Bearer valid-user-token"), configured, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/rest/v1/site_content");
    assert.equal(parsed.searchParams.get("key"), "like.subject_plan:*");
    return new Response(JSON.stringify([
      { key: "subject_plan:histology", payload: { subject: "Гистология" } },
      { key: "site", payload: { title: "Not a plan" } },
    ]), { status: 200 });
  });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.data.plans), ["subject_plan:histology"]);
});

test("subject plan is generated from live curriculum rows when no JSON plan exists", async () => {
  const subjectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const groupId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const result = await getSupabaseSubjectPlan(request("Bearer valid-user-token"), "histology", configured, async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    // Student-facing RLS denies site_content; the API must fall back to
    // curriculum rows rather than failing the entire subject plan.
    if (url.pathname === "/rest/v1/site_content") return new Response(JSON.stringify({ code: "42501" }), { status: 403 });
    if (url.pathname === "/rest/v1/group_memberships") return new Response(JSON.stringify([{
      group_id: groupId,
      groups: { id: groupId, is_active: true, specialty_slug: "mbh", course_number: 2 },
      is_active: true,
    }]), { status: 200 });
    if (url.pathname === "/rest/v1/subjects") return new Response(JSON.stringify([{
      id: subjectId, slug: "histology", name: "Гистология, цитология", specialty_slug: "mbh",
      course_number: 2, semester: 3, control_type: "Зачёт", lecture_hours: 36,
      practice_hours: 57, self_study_hours: 51, total_hours: 144, credits: 4, is_active: true,
    }]), { status: 200 });
    if (url.pathname === "/rest/v1/users") return new Response(JSON.stringify([{ course_number: 2, semester: 3 }]), { status: 200 });
    if (url.pathname === "/rest/v1/curriculum_items") return new Response(JSON.stringify([
      { id: "item-1", subject_id: subjectId, item_type: "lecture", title: "Клетка и клеточный цикл", planned_date: "2026-10-12", order_index: 1, is_required: true, metadata: { calendar_week: 4 } },
      { id: "item-2", subject_id: subjectId, item_type: "practice", title: "Микроскопия эпителия", planned_date: "2026-10-12", order_index: 2, is_required: true, metadata: { calendar_week: 4 } },
    ]), { status: 200 });
    if (url.pathname === "/rest/v1/schedules") return new Response(JSON.stringify([]), { status: 200 });
    throw new Error("unexpected path " + url.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.available, true);
  assert.equal(result.data.source, "supabase_curriculum_and_schedule");
  assert.equal(result.data.plan.subject, "Гистология, цитология");
  assert.equal(result.data.plan.weeks.length, 1);
  assert.equal(result.data.plan.weeks[0].date, "2026-10-12");
  assert.equal(result.data.plan.weeks[0].week, 4);
  assert.equal(result.data.plan.weeks[0].lecture, "Клетка и клеточный цикл");
  assert.equal(result.data.plan.weeks[0].practice, "Микроскопия эпителия");
  assert.equal(result.data.plan.weeks[0].items.length, 2);
  assert.equal(result.data.schedule_available, true);
});

test("subject plan endpoint represents a missing plan as unavailable, not an error", async () => {
  const result = await getSupabaseSubjectPlan(request("Bearer valid-user-token"), "histology", configured, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    return new Response(JSON.stringify([]), { status: 200 });
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.available, false);
  assert.equal(result.data.plan, null);
  assert.equal(result.data.schedule_count, 0);
});


test("homework progress checks the active group and writes using the verified caller identity", async () => {
  const { setSupabaseHomeworkProgress } = await import("../src/supabase-auth.js");
  const calls = [];
  const result = await setSupabaseHomeworkProgress(request("Bearer valid-user-token"), "homework-1", true, configured, async (url, init) => {
    const parsed = new URL(url);
    calls.push({ parsed, init });
    if (parsed.pathname.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-123", email: "student@example.com" }), { status: 200 });
    if (parsed.pathname.endsWith("/rest/v1/homeworks")) return new Response(JSON.stringify([{ id: "homework-1", group_id: "group-1" }]), { status: 200 });
    if (parsed.pathname.endsWith("/rest/v1/group_memberships")) return new Response(JSON.stringify([{ group_id: "group-1", groups: { id: "group-1", is_active: true } }]), { status: 200 });
    if (parsed.pathname.endsWith("/rest/v1/homework_progress")) return new Response(JSON.stringify([{ homework_id: "homework-1", user_id: "user-123", completed: true }]), { status: 201 });
    throw new Error("Unexpected upstream request");
  });
  assert.equal(result.ok, true);
  const write = calls.find((call) => call.parsed.pathname.endsWith("/rest/v1/homework_progress"));
  assert.equal(write.init.method, "POST");
  assert.equal(write.parsed.searchParams.get("on_conflict"), "homework_id,user_id");
  const payload = JSON.parse(write.init.body)[0];
  assert.equal(payload.user_id, "user-123");
  assert.equal(payload.homework_id, "homework-1");
  assert.equal(payload.completed, true);
  assert.equal(write.init.headers.authorization, "Bearer valid-user-token");
});

test("homework progress refuses a homework outside the caller's active group", async () => {
  const { setSupabaseHomeworkProgress } = await import("../src/supabase-auth.js");
  const result = await setSupabaseHomeworkProgress(request("Bearer valid-user-token"), "homework-2", false, configured, async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-123" }), { status: 200 });
    if (parsed.pathname.endsWith("/rest/v1/homeworks")) return new Response(JSON.stringify([{ id: "homework-2", group_id: "group-other" }]), { status: 200 });
    if (parsed.pathname.endsWith("/rest/v1/group_memberships")) return new Response(JSON.stringify([]), { status: 200 });
    throw new Error("Unexpected upstream request");
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});


test("progress combines caller-scoped homework and test attempts without fabricating a degraded zero", async () => {
  let attemptQuery = "";
  const result = await getSupabaseProgress(request("Bearer valid-user-token"), configured, {}, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    const parsed = new URL(String(url));
    if (parsed.pathname === "/rest/v1/group_memberships") return new Response(JSON.stringify([{ group_id: "group-1", groups: { id: "group-1", name: "МБХ-201", is_active: true } }]), { status: 200 });
    if (parsed.pathname === "/rest/v1/homeworks") return new Response(JSON.stringify([
      { id: "hw-1", group_id: "group-1", subject_id: "subject-1", title: "Задание", subjects: { name: "Гистология" } },
      { id: "hw-2", group_id: "group-1", subject_id: "subject-1", title: "Задание 2", subjects: { name: "Гистология" } },
    ]), { status: 200 });
    if (parsed.pathname === "/rest/v1/homework_progress") return new Response(JSON.stringify([{ homework_id: "hw-1", completed: true, submitted_at: "2026-10-12T09:00:00Z" }]), { status: 200 });
    if (parsed.pathname === "/rest/v1/homework_submissions") return new Response("[]", { status: 200 });
    if (parsed.pathname === "/rest/v1/test_attempts") {
      attemptQuery = parsed.search;
      assert.equal(parsed.searchParams.get("user_id"), "eq.user-1");
      assert.equal(parsed.searchParams.get("group_id"), "eq.group-1");
      return new Response(JSON.stringify([
        { id: "attempt-1", test_id: "test-1", status: "finished", score: 80, percent: 80, tests: { title: "Тест", subject_id: "subject-1" } },
        { id: "attempt-2", test_id: "test-1", status: "in_progress", percent: null, tests: { title: "Тест", subject_id: "subject-1" } },
      ]), { status: 200 });
    }
    throw new Error("unexpected endpoint " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.homework.total, 2);
  assert.equal(result.data.homework.done, 1);
  assert.equal(result.data.homework.percent, 50);
  assert.equal(result.data.tests.attempts, 2);
  assert.equal(result.data.tests.finished, 1);
  assert.equal(result.data.tests.avg_score, 80);
  assert.equal(result.data.overall_pct, 50);
  assert.ok(attemptQuery);
});


test("progress reports no overall score when the student has no homework or attempts", async () => {
  const result = await getSupabaseProgress(request("Bearer valid-user-token"), configured, {}, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    const parsed = new URL(String(url));
    if (parsed.pathname === "/rest/v1/group_memberships") return new Response(JSON.stringify([{ group_id: "group-1", groups: { id: "group-1", name: "МБХ-201", is_active: true } }]), { status: 200 });
    if (parsed.pathname === "/rest/v1/homeworks") return new Response("[]", { status: 200 });
    if (parsed.pathname === "/rest/v1/test_attempts") return new Response("[]", { status: 200 });
    throw new Error("unexpected endpoint " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.overall_pct, null);
  assert.equal(result.data.homework.total, 0);
  assert.equal(result.data.tests.attempts, 0);
  assert.equal(result.data.tests.avg_score, null);
});


test("progress does not count missing homework as zero when attempts exist", async () => {
  const result = await getSupabaseProgress(request("Bearer valid-user-token"), configured, {}, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    const parsed = new URL(String(url));
    if (parsed.pathname === "/rest/v1/group_memberships") return new Response(JSON.stringify([{ group_id: "group-1", groups: { id: "group-1", name: "МБХ-201", is_active: true } }]), { status: 200 });
    if (parsed.pathname === "/rest/v1/homeworks") return new Response("[]", { status: 200 });
    if (parsed.pathname === "/rest/v1/test_attempts") return new Response(JSON.stringify([
      { id: "attempt-1", test_id: "test-1", status: "finished", score: 80, percent: 80, tests: { title: "Тест", subject_id: "subject-1" } },
    ]), { status: 200 });
    throw new Error("unexpected endpoint " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.homework.total, 0);
  assert.equal(result.data.homework.percent, null);
  assert.equal(result.data.tests.attempts, 1);
  assert.equal(result.data.overall_pct, 100);
});

test("selected-group subject catalog also filters by the active group course", async () => {
  const groupId = "11111111-1111-4111-8111-111111111111";
  const result = await listSupabaseSubjects(request("Bearer valid-user-token"), configured, { group_id: groupId }, async (url) => {
    if (String(url).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    const parsed = new URL(String(url));
    if (parsed.pathname === "/rest/v1/group_memberships") {
      assert.equal(parsed.searchParams.get("group_id"), "eq." + groupId);
      return new Response(JSON.stringify([{
        group_id: groupId,
        groups: { specialty_slug: "mbh", course_number: 2, is_active: true },
      }]), { status: 200 });
    }
    if (parsed.pathname === "/rest/v1/subjects") return new Response(JSON.stringify([
      { id: "subject-2", name: "Курс 2", course_number: 2, specialty_slug: "mbh", is_active: true },
      { id: "subject-3", name: "Курс 3", course_number: 3, specialty_slug: "mbh", is_active: true },
      { id: "subject-general", name: "Общий", course_number: null, specialty_slug: null, is_active: true },
    ]), { status: 200 });
    throw new Error("unexpected endpoint " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items.map((item) => item.id), ["subject-2", "subject-general"]);
});


test("auth fetch rejects redirects safely without forwarding credentials", async () => {
  let calls = 0;
  const warnings = [];
  const originalError = console.error;
  console.error = (...args) => warnings.push(args);
  let result;
  try {
    result = await authenticateSupabaseRequest(request("Bearer valid-user-token"), configured, async (_url, init) => {
      calls += 1;
      assert.equal(init.redirect, "manual");
      return new Response(null, {
        status: 302,
        headers: { location: "https://redirect.example.test/not-auth" },
      });
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(calls, 1);
  assert.equal(result.status, 502);
  assert.equal(result.message, "Supabase Auth returned an unexpected redirect");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], "supabase_auth_unexpected_redirect");
  assert.deepEqual(warnings[0][1], {
    operation: "authenticateSupabaseRequest",
    status: 302,
    hasLocation: true,
    sourceIsHttps: true,
    sourceIsSupabaseDomain: true,
    sourceMatchesExpectedProject: false,
    targetIsHttps: true,
    targetSameOrigin: false,
    targetIsSupabaseDomain: false,
    targetMatchesExpectedProject: false,
    targetPathCategory: "other",
  });
  assert.equal(JSON.stringify(warnings).includes("redirect.example.test"), false);
});


test("subject catalog degrades to caller-visible subjects when optional curriculum CMS is hidden by RLS", async () => {
  const calls = [];
  const result = await getSupabaseSubjectCatalog(request("Bearer valid-user-token"), configured, async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    if (url.pathname === "/rest/v1/group_memberships") {
      return new Response(JSON.stringify([{ group_id: "group-1", groups: { specialty_slug: "mbh", is_active: true, course_number: 2 } }]), { status: 200 });
    }
    if (url.pathname === "/rest/v1/subjects") {
      return new Response(JSON.stringify([{ id: "subject-1", slug: "histology", name: "Гистология", specialty_slug: "histology", course_number: 2, is_active: true }]), { status: 200 });
    }
    if (url.pathname === "/rest/v1/site_content") return new Response(JSON.stringify({ code: "42501" }), { status: 403 });
    throw new Error("unexpected endpoint " + url.pathname);
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items.map((item) => item.id), ["subject-1"]);
  assert.deepEqual(result.data.curriculum, { items: result.data.items });
  assert.equal(result.data.curriculum_available, false);
  assert.equal(result.data.curriculum_source, "caller_subjects_fallback");
  assert.equal(result.data.degraded, true);
  assert.ok(calls.includes("/rest/v1/site_content"));
});

test("subject catalog does not hide transient curriculum backend errors", async () => {
  const result = await getSupabaseSubjectCatalog(request("Bearer valid-user-token"), configured, async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    if (url.pathname === "/rest/v1/group_memberships") return new Response(JSON.stringify([{ group_id: "group-1", groups: { specialty_slug: "mbh", is_active: true, course_number: 2 } }]), { status: 200 });
    if (url.pathname === "/rest/v1/subjects") return new Response(JSON.stringify([{ id: "subject-1", name: "Гистология", specialty_slug: "mbh", is_active: true }]), { status: 200 });
    if (url.pathname === "/rest/v1/site_content") return new Response("temporarily unavailable", { status: 503 });
    throw new Error("unexpected endpoint " + url.pathname);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, "CURRICULUM_UNAVAILABLE");
});

test("lectures fall back to caller-visible legacy histology lectures when optional CMS JSON is denied", async () => {
  const result = await listSupabaseLectures(request("Bearer valid-user-token"), configured, "histology", async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    if (url.pathname === "/rest/v1/site_content") return new Response(JSON.stringify({ code: "42501" }), { status: 403 });
    if (url.pathname === "/rest/v1/histology_lectures") return new Response(JSON.stringify([
      { id: "legacy-1", title: "Электроннограммы", subject_slug: "histology", kind: "EM", is_published: true, body_markdown: "Текст" },
    ]), { status: 200 });
    throw new Error("unexpected endpoint " + url.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].id, "histology-legacy-1");
  assert.equal(result.data.items[0].status, "published");
});

test("subject plan catalog treats expected site_content RLS denial as empty and degraded", async () => {
  const result = await listSupabaseSubjectPlans(request("Bearer valid-user-token"), configured, async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    if (url.pathname === "/rest/v1/site_content") return new Response(JSON.stringify({ code: "42501" }), { status: 403 });
    throw new Error("unexpected endpoint " + url.pathname);
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.plans, {});
  assert.equal(result.data.available, false);
  assert.equal(result.data.source, "none");
});
