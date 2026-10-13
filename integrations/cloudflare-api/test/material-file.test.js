import test from "node:test";
import assert from "node:assert/strict";
import { getSupabaseMaterialFileUrl } from "../src/material-file.js";

const env = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  B2_KEY_ID: "key-id-test",
  B2_APPLICATION_KEY: "application-key-test",
  B2_BUCKET: "medbiohim-files",
  B2_BUCKET_ID: "bucket-id-test",
};

function request(authorization = "Bearer valid-user-token") {
  return new Request("https://api-shadow.example.test/api/v1/materials/material-1/file-url", {
    headers: authorization ? { authorization } : {},
  });
}
function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("material file URL checks publication and uses the caller JWT before signing a private B2 object", async () => {
  const calls = [];
  const result = await getSupabaseMaterialFileUrl(request(), env, "material-1", async (url, init) => {
    const parsed = new URL(String(url));
    calls.push({ parsed, init });
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/materials") {
      assert.equal(init.headers.authorization, "Bearer valid-user-token");
      assert.equal(parsed.searchParams.get("is_published"), "eq.true");
      return response([{ id: "material-1", subject_id: "subject-1", file_id: "file-1", is_published: true }]);
    }
    if (parsed.pathname === "/rest/v1/subjects") {
      return response([{ id: "subject-1", slug: "chemistry", specialty_slug: null, is_active: true }]);
    }
    if (parsed.pathname === "/rest/v1/files") {
      return response([{ id: "file-1", object_key: "uploads/user-1/notes.pdf", group_id: null, status: "active" }]);
    }
    if (parsed.pathname === "/b2api/v2/b2_authorize_account") {
      return response({ apiUrl: "https://api004.backblazeb2.com", downloadUrl: "https://f004.backblazeb2.com", authorizationToken: "account-token", accountId: "account-id" });
    }
    if (parsed.pathname === "/b2api/v2/b2_get_download_authorization") {
      assert.deepEqual(JSON.parse(init.body), { bucketId: "bucket-id-test", fileNamePrefix: "uploads/user-1/notes.pdf", validDurationInSeconds: 600 });
      return response({ authorizationToken: "download-token" });
    }
    assert.fail("Unexpected endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.mode, "presigned");
  assert.equal(result.data.expires_in, 600);
  assert.equal(new URL(result.data.url).searchParams.get("Authorization"), "download-token");
  assert.equal(calls.length, 6);
});

test("material file URL denies MBH materials when active specialty membership is absent", async () => {
  let b2Calls = 0;
  const result = await getSupabaseMaterialFileUrl(request(), env, "material-1", async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/materials") return response([{ id: "material-1", subject_id: "subject-1", file_id: "file-1", is_published: true }]);
    if (parsed.pathname === "/rest/v1/subjects") return response([{ id: "subject-1", slug: "histology", specialty_slug: "mbh", is_active: true }]);
    if (parsed.pathname === "/rest/v1/files") return response([{ id: "file-1", object_key: "histology/image.png", group_id: null, status: "active" }]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response([]);
    if (parsed.hostname.endsWith(".backblazeb2.com")) b2Calls += 1;
    assert.fail("Unexpected endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, "FORBIDDEN");
  assert.equal(b2Calls, 0);
});

test("material file URL fails closed when B2 signing secrets are not configured", async () => {
  const result = await getSupabaseMaterialFileUrl(request(), { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY }, "material-1", async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (pathname === "/rest/v1/materials") return response([{ id: "material-1", subject_id: "subject-1", file_id: "file-1", is_published: true }]);
    if (pathname === "/rest/v1/subjects") return response([{ id: "subject-1", slug: "chemistry", specialty_slug: null, is_active: true }]);
    if (pathname === "/rest/v1/files") return response([{ id: "file-1", object_key: "uploads/user-1/notes.pdf", group_id: null, status: "active" }]);
    assert.fail("Unexpected endpoint: " + pathname);
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, "FILE_STORAGE_NOT_CONFIGURED");
});

test("material file URL rejects invalid IDs and never accepts user-supplied object keys", async () => {
  let calls = 0;
  const result = await getSupabaseMaterialFileUrl(request(), env, "../secret", async () => { calls += 1; return response({ id: "user-1" }); });
  assert.equal(result.status, 422);
  assert.equal(calls, 0);
});
