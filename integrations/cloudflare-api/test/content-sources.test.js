import test from "node:test";
import assert from "node:assert/strict";
import { getSupabaseContentSource } from "../src/content-sources.js";

const env = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
};
const sourceId = "a94f7d20-4c6a-4f4a-8e22-731f2b8f57c1";

function request(token = "Bearer valid-user-token") {
  return new Request("https://api-shadow.example.test/api/v1/content-sources/" + sourceId, {
    headers: token ? { authorization: token } : {},
  });
}
function response(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function sourceRow(overrides = {}) {
  return {
    id: sourceId,
    title: "Lecture source",
    source_path: "content/chemistry/lecture.pdf",
    mime_type: "application/pdf",
    original_format: "pdf",
    source_archive: null,
    note: null,
    file_id: null,
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

test("content source metadata uses the caller JWT and mirrors the PHP metadata shape", async () => {
  const calls = [];
  const result = await getSupabaseContentSource(request(), env, sourceId, async (url, init) => {
    const parsed = new URL(String(url));
    calls.push({ parsed, authorization: init.headers.authorization, apikey: init.headers.apikey });
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1", email: "student@example.com" });
    if (parsed.pathname === "/rest/v1/content_sources") {
      assert.equal(parsed.searchParams.get("id"), "eq." + sourceId);
      assert.equal(parsed.searchParams.get("limit"), "1");
      return response([sourceRow()]);
    }
    if (parsed.pathname === "/rest/v1/materials") {
      assert.equal(parsed.searchParams.get("source_key"), "eq." + sourceId);
      return response([{ subject_id: "subject-1", subjects: { slug: "chemistry", specialty_slug: null, is_active: true } }]);
    }
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    source: sourceRow(),
    download: null,
  });
  assert.equal(calls.every((call) => call.authorization === "Bearer valid-user-token"), true);
  assert.equal(calls.every((call) => call.apikey === env.SUPABASE_ANON_KEY), true);
});

test("histology content source is forbidden without an active MBH group membership", async () => {
  const paths = [];
  const result = await getSupabaseContentSource(request(), env, sourceId, async (url) => {
    const parsed = new URL(String(url));
    paths.push(parsed.pathname);
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/content_sources") return response([sourceRow()]);
    if (parsed.pathname === "/rest/v1/materials") return response([
      { subject_id: "subject-1", subjects: { slug: "histology", specialty_slug: null, is_active: true } },
    ]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response([
      { group_id: "group-1", groups: { specialty_slug: "chemistry", is_active: true } },
      { group_id: "group-2", groups: { specialty_slug: "mbh", is_active: false } },
    ]);
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, "FORBIDDEN");
  assert.equal(paths.includes("/rest/v1/group_memberships"), true);
});

test("active MBH membership allows source metadata but still never fabricates a download URL", async () => {
  const result = await getSupabaseContentSource(request(), env, sourceId, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/content_sources") {
      return response([sourceRow({ source_path: "features/histology-content/5_Фотографии препаратов/a.jpg", mime_type: "image/jpeg" })]);
    }
    if (parsed.pathname === "/rest/v1/materials") return response([]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response([
      { group_id: "group-1", groups: { specialty_slug: "mbh", is_active: true } },
    ]);
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.source.mime_type, "image/jpeg");
  assert.equal(result.data.source.source_path, "features/histology-content/5_Фотографии препаратов/a.jpg");
  assert.equal(result.data.download, null);
});

test("source metadata fails closed when linked-material access cannot be checked", async () => {
  const result = await getSupabaseContentSource(request(), env, sourceId, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/content_sources") return response([sourceRow()]);
    if (parsed.pathname === "/rest/v1/materials") return response({ message: "RLS denied" }, 403);
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, "CONTENT_SOURCE_UNAVAILABLE");
});

test("invalid bearer credentials are rejected before source or material queries", async () => {
  let reads = 0;
  const result = await getSupabaseContentSource(request("Bearer invalid"), env, sourceId, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ message: "invalid token" }, 401);
    reads += 1;
    return response([]);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(reads, 0);
});

test("invalid content source ids are rejected before REST queries", async () => {
  let reads = 0;
  const result = await getSupabaseContentSource(request(), env, "../private", async (url) => {
    if (new URL(String(url)).pathname === "/auth/v1/user") {
      reads += 1;
      return response({ id: "user-1" });
    }
    reads += 1;
    return response([]);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(reads, 1);
});
