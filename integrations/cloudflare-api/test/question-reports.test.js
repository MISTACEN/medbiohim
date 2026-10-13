import test from "node:test";
import assert from "node:assert/strict";
import { submitSupabaseQuestionReport } from "../src/question-reports.js";

const env = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
};
const questionId = "a94f7d20-4c6a-4f4a-8e22-731f2b8f57c1";
function request(token = "Bearer valid-user-token") {
  return new Request("https://api-shadow.example.test/api/v1/questions/" + questionId + "/report", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: token } : {}) },
    body: JSON.stringify({ category: "typo", message: "Опечатка" }),
  });
}
function response(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function question(slug = "chemistry", specialty = null, overrides = {}) {
  return {
    id: questionId,
    subject_id: "subject-1",
    is_published: true,
    archived_at: null,
    subjects: { slug, specialty_slug: specialty, is_active: true },
    ...overrides,
  };
}
function membership(specialty = "mbh", active = true) {
  return { group_id: "group-1", groups: { specialty_slug: specialty, is_active: active } };
}
function report(overrides = {}) {
  return {
    id: "report-1",
    question_id: questionId,
    reporter_user_id: "user-1",
    category: "typo",
    message: "Опечатка",
    status: "new",
    work_id: null,
    created_at: "2026-10-13T00:00:00Z",
    ...overrides,
  };
}

test("question report inserts caller-owned report with valid category and no trust in payload user id", async () => {
  let inserted;
  const result = await submitSupabaseQuestionReport(request(), env, questionId, {
    category: "typo", message: "  Опечатка  ", reporter_user_id: "attacker-id",
  }, async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/questions") {
      assert.equal(parsed.searchParams.get("id"), "eq." + questionId);
      assert.equal(parsed.searchParams.get("is_published"), "eq.true");
      assert.equal(parsed.searchParams.get("archived_at"), "is.null");
      return response([question()]);
    }
    if (parsed.pathname === "/rest/v1/question_reports" && init.method === "GET") {
      assert.equal(parsed.searchParams.get("reporter_user_id"), "eq.user-1");
      assert.equal(parsed.searchParams.get("status"), "in.(new,reviewing)");
      assert.equal(parsed.searchParams.get("category"), "eq.typo");
      return response([]);
    }
    if (parsed.pathname === "/rest/v1/question_reports" && init.method === "POST") {
      inserted = JSON.parse(init.body);
      assert.equal(init.headers.authorization, "Bearer valid-user-token");
      return response([report(inserted)]);
    }
    assert.fail("unexpected REST request: " + init.method + " " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(result.data.duplicate, false);
  assert.equal(result.data.item.reporter_user_id, "user-1");
  assert.equal(inserted.reporter_user_id, "user-1");
  assert.notEqual(inserted.reporter_user_id, "attacker-id");
  assert.equal(inserted.message, "Опечатка");
});

test("duplicate open question report is returned without another insert", async () => {
  let insertCalls = 0;
  const result = await submitSupabaseQuestionReport(request(), env, questionId, {
    category: "typo", message: "again",
  }, async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/questions") return response([question()]);
    if (parsed.pathname === "/rest/v1/question_reports" && init.method === "GET") return response([report()]);
    if (parsed.pathname === "/rest/v1/question_reports" && init.method === "POST") {
      insertCalls += 1;
      return response([report()]);
    }
    assert.fail("unexpected REST request: " + init.method + " " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.duplicate, true);
  assert.equal(result.data.item.id, "report-1");
  assert.equal(insertCalls, 0);
});

test("question reports reject invalid categories, non-UUID identifiers and long messages", async (t) => {
  await t.test("invalid category", async () => {
    let tableReads = 0;
    const result = await submitSupabaseQuestionReport(request(), env, questionId, {
      category: "admin_override", message: "x",
    }, async (url) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/auth/v1/user") return response({ id: "user-1" });
      tableReads += 1;
      return response([]);
    });
    assert.equal(result.status, 422);
    assert.equal(tableReads, 0);
  });
  await t.test("invalid ID", async () => {
    let tableReads = 0;
    const result = await submitSupabaseQuestionReport(request(), env, "../private", { category: "typo" }, async (url) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/auth/v1/user") return response({ id: "user-1" });
      tableReads += 1;
      return response([]);
    });
    assert.equal(result.status, 422);
    assert.equal(tableReads, 0);
  });
  await t.test("long message", async () => {
    let tableReads = 0;
    const result = await submitSupabaseQuestionReport(request(), env, questionId, {
      category: "typo", message: "x".repeat(2001),
    }, async (url) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/auth/v1/user") return response({ id: "user-1" });
      tableReads += 1;
      return response([]);
    });
    assert.equal(result.status, 422);
    assert.equal(tableReads, 0);
  });
});

test("question reports cannot attach to unpublished or archived questions", async () => {
  const unpublished = await submitSupabaseQuestionReport(request(), env, questionId, { category: "typo" }, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/questions") return response([]);
    assert.fail("hidden question must stop report creation");
  });
  const archived = await submitSupabaseQuestionReport(request(), env, questionId, { category: "typo" }, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/questions") return response([question("chemistry", null, { archived_at: "2026-01-01T00:00:00Z" })]);
    assert.fail("archived question must stop report creation");
  });
  assert.equal(unpublished.status, 404);
  assert.equal(archived.status, 404);
});

test("Histology reports require an explicitly active MBH membership", async (t) => {
  await t.test("inactive group is forbidden", async () => {
    let reportReads = 0;
    const result = await submitSupabaseQuestionReport(request(), env, questionId, { category: "typo" }, async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
      if (parsed.pathname === "/rest/v1/questions") return response([question("histology", null)]);
      if (parsed.pathname === "/rest/v1/group_memberships") return response([membership("mbh", false)]);
      if (parsed.pathname === "/rest/v1/question_reports") reportReads += 1;
      return response([]);
    });
    assert.equal(result.status, 403);
    assert.equal(reportReads, 0);
  });
  await t.test("membership lookup failure is fail-closed", async () => {
    const result = await submitSupabaseQuestionReport(request(), env, questionId, { category: "typo" }, async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
      if (parsed.pathname === "/rest/v1/questions") return response([question("histology", null)]);
      if (parsed.pathname === "/rest/v1/group_memberships") return response({ message: "denied" }, 403);
      assert.fail("membership failure must stop writes");
    });
    assert.equal(result.status, 503);
  });
});

test("invalid bearer credential is rejected before reading or writing reports", async () => {
  let tableReads = 0;
  const result = await submitSupabaseQuestionReport(request("Bearer invalid"), env, questionId, { category: "typo" }, async (url) => {
    if (new URL(String(url)).pathname === "/auth/v1/user") return response({ message: "invalid token" }, 401);
    tableReads += 1;
    return response([]);
  });
  assert.equal(result.status, 401);
  assert.equal(tableReads, 0);
});
