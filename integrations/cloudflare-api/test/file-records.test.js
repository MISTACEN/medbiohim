import test from "node:test";
import assert from "node:assert/strict";
import { getSupabaseFileDownload, getSupabaseFileRecord } from "../src/file-records.js";

const env = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  B2_KEY_ID: "key-id-test",
  B2_APPLICATION_KEY: "application-key-test",
  B2_BUCKET: "medbiohim-files",
  B2_BUCKET_ID: "bucket-id-test",
};
function request(authorization = "Bearer valid-user-token") {
  return new Request("https://api-shadow.example.test/api/v1/files/file-1", {
    headers: authorization ? { authorization } : {},
  });
}
function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("file metadata returns only safe fields after owner access check", async () => {
  const result = await getSupabaseFileRecord(request(), env, "file-1", async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/files") {
      assert.equal(init.headers.authorization, "Bearer valid-user-token");
      return response([{
        id: "file-1", original_name: "notes.pdf", mime_type: "application/pdf", size_bytes: 123,
        object_key: "private/path/notes.pdf", b2_file_id: "b2-secret-id", uploaded_by: "user-1",
        group_id: null, visibility: "group", status: "active", specialty_slug: null,
        sha256: "private-hash", storage_provider: "b2", processing_status: "ready", created_at: "2026-01-01",
      }]);
    }
    if (parsed.pathname === "/rest/v1/materials") return response([]);
    assert.fail("Unexpected endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.file.original_name, "notes.pdf");
  assert.equal(result.data.file.size_bytes, 123);
  assert.equal("object_key" in result.data.file, false);
  assert.equal("b2_file_id" in result.data.file, false);
  assert.equal("sha256" in result.data.file, false);
  assert.equal(result.data.download.status, "unavailable");
});

test("file metadata does not disclose a group-private file to a non-member", async () => {
  const result = await getSupabaseFileRecord(request(), env, "file-1", async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-2" });
    if (parsed.pathname === "/rest/v1/files") return response([{
      id: "file-1", uploaded_by: "user-1", visibility: "group", group_id: "group-1",
      status: "active", specialty_slug: null,
    }]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response([]);
    assert.fail("Unexpected endpoint: " + parsed.pathname);
  });
  assert.equal(result.status, 404);
  assert.equal(result.code, "NOT_FOUND");
});

test("file metadata requires active MBH membership even when the file is owned by the caller", async () => {
  const result = await getSupabaseFileRecord(request(), env, "file-1", async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/files") return response([{
      id: "file-1", uploaded_by: "user-1", visibility: "group", group_id: null,
      status: "active", specialty_slug: "mbh",
    }]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response([]);
    assert.fail("Unexpected endpoint: " + parsed.pathname);
  });
  assert.equal(result.status, 403);
  assert.equal(result.code, "FORBIDDEN");
});

test("file download returns a short-lived B2 URL only after access checks", async () => {
  const result = await getSupabaseFileDownload(request(), env, "file-1", async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/files") return response([{
      id: "file-1", uploaded_by: "user-1", visibility: "group", group_id: null,
      status: "active", specialty_slug: null, object_key: "uploads/user-1/file.pdf",
    }]);
    if (parsed.pathname === "/rest/v1/materials") return response([]);
    if (parsed.pathname === "/b2api/v2/b2_authorize_account") return response({
      apiUrl: "https://api004.backblazeb2.com", downloadUrl: "https://f004.backblazeb2.com",
      authorizationToken: "account-token", accountId: "account-id",
    });
    if (parsed.pathname === "/b2api/v2/b2_get_download_authorization") {
      assert.deepEqual(JSON.parse(init.body), {
        bucketId: "bucket-id-test", fileNamePrefix: "uploads/user-1/file.pdf", validDurationInSeconds: 600,
      });
      return response({ authorizationToken: "download-token" });
    }
    assert.fail("Unexpected endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.mode, "presigned");
  assert.equal(result.data.expires_in, 600);
  assert.equal(new URL(result.data.url).searchParams.get("Authorization"), "download-token");
});

test("file download rejects malformed IDs before reading file metadata", async () => {
  let fileReads = 0;
  const result = await getSupabaseFileDownload(request(), env, "../secret", async (url) => {
    const pathname = new URL(String(url)).pathname;
    if (pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (pathname === "/rest/v1/files") fileReads += 1;
    return response([]);
  });
  assert.equal(result.status, 422);
  assert.equal(fileReads, 0);
});
