import test from "node:test";
import assert from "node:assert/strict";
import { listSupabaseSubjectMaterials } from "../src/materials.js";

const env = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
};
function request(authorization = "Bearer valid-user-token") {
  return new Request("https://api-shadow.example.test/api/v1/subject-materials", {
    headers: authorization ? { authorization } : {},
  });
}
function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
function subjectRow({ slug = "chemistry", specialty_slug = null } = {}) {
  return {
    id: "material-1", subject_id: "subject-1", module_id: "module-1", topic_id: "topic-1",
    type: "lecture", title: "Основы", file_id: null, external_url: null, content_html: "<p>Тема</p>",
    order_index: 1, is_published: true, source_key: "source-1",
    subjects: { name: "Химия", slug, specialty_slug, is_active: true },
    content_sources: { id: "source-1", source_path: "content/example.pdf", original_format: "pdf", mime_type: "application/pdf" },
    modules: { title: "Модуль 1" }, topics: { title: "Тема 1" },
  };
}

test("subject materials use caller JWT, preserve filters, and return PHP-compatible item fields", async () => {
  const calls = [];
  const result = await listSupabaseSubjectMaterials(request(), env, {
    subject_slug: "chemistry", type: "lecture", q: "Основы <script>",
  }, async (url, init) => {
    const parsed = new URL(String(url));
    calls.push({ parsed, authorization: init.headers.authorization, apikey: init.headers.apikey });
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1", email: "student@example.com" });
    if (parsed.pathname === "/rest/v1/materials") {
      assert.equal(parsed.searchParams.get("subjects.slug"), "eq.chemistry");
      assert.equal(parsed.searchParams.get("type"), "eq.lecture");
      assert.equal(parsed.searchParams.get("is_published"), "eq.true");
      assert.equal(parsed.searchParams.get("subjects.is_active"), "eq.true");
      assert.match(parsed.searchParams.get("or"), /Основы/);
      assert.equal(parsed.searchParams.get("or").includes("<"), false);
      assert.equal(parsed.searchParams.get("or").includes(">"), false);
      return response([subjectRow()]);
    }
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.source, "supabase_rest");
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].subject_slug, "chemistry");
  assert.equal(result.data.items[0].module_title, "Модуль 1");
  assert.equal(result.data.items[0].topic_title, "Тема 1");
  assert.equal(result.data.items[0].source.download_url, null);
  assert.equal(calls.every((call) => call.authorization === "Bearer valid-user-token"), true);
  assert.equal(calls.every((call) => call.apikey === env.SUPABASE_ANON_KEY), true);
});

test("subject materials hide histology rows without an active MBH group membership", async () => {
  const paths = [];
  const result = await listSupabaseSubjectMaterials(request(), env, {}, async (url) => {
    const parsed = new URL(String(url));
    paths.push(parsed.pathname);
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/materials") return response([subjectRow({ slug: "histology", specialty_slug: "mbh" })]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response([
      { group_id: "group-1", groups: { specialty_slug: "chemistry", is_active: true } },
    ]);
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.items, []);
  assert.equal(paths.includes("/rest/v1/group_memberships"), true);
});

test("subject materials fail closed when membership verification is unavailable", async () => {
  const result = await listSupabaseSubjectMaterials(request(), env, {}, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/materials") return response([subjectRow({ slug: "histology", specialty_slug: "mbh" })]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response({ message: "RLS denied" }, 403);
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, "DB_UNAVAILABLE");
});

test("subject materials reject invalid bearer credentials before reading rows", async () => {
  let materialReads = 0;
  const result = await listSupabaseSubjectMaterials(request("Bearer invalid"), env, {}, async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ message: "invalid token" }, 401);
    if (parsed.pathname === "/rest/v1/materials") materialReads++;
    return response([]);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(materialReads, 0);
});


test("subject materials resolve UUID source metadata without fabricating download URLs", async () => {
  const sourceId = "a94f7d20-4c6a-4f4a-8e22-731f2b8f57c1";
  const result = await listSupabaseSubjectMaterials(request(), env, {}, async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/materials") {
      return response([{ ...subjectRow(), source_key: sourceId }]);
    }
    if (parsed.pathname === "/rest/v1/content_sources") {
      assert.equal(parsed.searchParams.get("id"), "in.(" + sourceId + ")");
      assert.equal(parsed.searchParams.get("select"), "id,source_path,original_format,mime_type");
      assert.equal(init.headers.authorization, "Bearer valid-user-token");
      return response([{
        id: sourceId,
        source_path: "content/chemistry/example.pdf",
        original_format: "pdf",
        mime_type: "application/pdf",
      }]);
    }
    assert.fail("unexpected REST endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].source.id, sourceId);
  assert.equal(result.data.items[0].source.source_path, "content/chemistry/example.pdf");
  assert.equal(result.data.items[0].source.mime_type, "application/pdf");
  assert.equal(result.data.items[0].source.download_url, null);
});
