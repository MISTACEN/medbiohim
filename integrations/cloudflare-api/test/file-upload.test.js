import test from "node:test";
import assert from "node:assert/strict";
import { uploadSupabaseFile } from "../src/file-upload.js";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("upload rejects missing bearer token before upstream calls", async () => {
  const request = new Request("https://worker.example/api/v1/files/upload", { method: "POST" });
  const result = await uploadSupabaseFile(request, {}, async () => {
    assert.fail("unexpected upstream request");
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.code, "UNAUTHORIZED");
});

test("upload fails closed when private storage is not configured", async () => {
  const form = new FormData();
  form.append("file", new Blob(["sample"], { type: "application/pdf" }), "sample.pdf");
  const request = new Request("https://worker.example/api/v1/files/upload", {
    method: "POST",
    headers: { authorization: "Bearer user-token" },
    body: form,
  });
  const result = await uploadSupabaseFile(request, {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "test-anon-key",
  }, async (url) => {
    if (new URL(String(url)).pathname === "/auth/v1/user") return json({ id: "user-1" });
    assert.fail("storage must not be contacted without configuration");
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, "FILE_STORAGE_NOT_CONFIGURED");
});

test("upload persists a private B2 object through the caller-scoped metadata RPC", async () => {
  const form = new FormData();
  form.append("file", new Blob(["sample"], { type: "application/pdf" }), "sample.pdf");
  const request = new Request("https://worker.example/api/v1/files/upload", {
    method: "POST",
    headers: { authorization: "Bearer valid-user-token" },
    body: form,
  });
  const env = {
    SUPABASE_URL: "https://project-id.supabase.co",
    SUPABASE_ANON_KEY: "anon-test-key",
    B2_KEY_ID: "test-key-id",
    B2_APPLICATION_KEY: "test-application-key",
    B2_BUCKET: "medbiohim-files",
    B2_BUCKET_ID: "bucket-id",
  };
  const paths = [];
  const result = await uploadSupabaseFile(request, env, async (url, init = {}) => {
    const parsed = new URL(String(url));
    paths.push(parsed.pathname);
    if (parsed.pathname === "/auth/v1/user") {
      return json({ id: "11111111-1111-4111-8111-111111111111", email: "student@example.test" });
    }
    if (parsed.pathname === "/b2api/v2/b2_authorize_account") {
      return json({ apiUrl: "https://api004.backblazeb2.com", authorizationToken: "account-token", accountId: "account-id" });
    }
    if (parsed.pathname === "/b2api/v2/b2_get_upload_url") {
      return json({ uploadUrl: "https://pod-000-1007-12.backblaze.com/b2api/v2/b2_upload_file", authorizationToken: "upload-token" });
    }
    if (parsed.hostname === "pod-000-1007-12.backblaze.com") {
      assert.equal(init.headers.authorization, "upload-token");
      assert.equal(init.headers["x-bz-content-sha1"].length, 40);
      return json({ fileId: "b2-file-id", fileName: "uploaded-object" });
    }
    if (parsed.pathname === "/rest/v1/rpc/medbiohim_create_file_record") {
      assert.equal(init.headers.authorization, "Bearer valid-user-token");
      assert.equal(init.headers.apikey, env.SUPABASE_ANON_KEY);
      const body = JSON.parse(init.body);
      assert.equal(body.p_original_name, "sample.pdf");
      assert.equal(body.p_b2_file_id, "b2-file-id");
      assert.match(body.p_sha256, /^[0-9a-f]{64}$/);
      return json({
        id: "file-id", original_name: "sample.pdf", mime_type: "application/pdf",
        size_bytes: 6, uploaded_by: "11111111-1111-4111-8111-111111111111",
        group_id: null, visibility: "group", status: "active", specialty_slug: null,
        storage_provider: "b2", processing_status: "ready", created_at: "2026-10-16T00:00:00Z",
      });
    }
    assert.fail("Unexpected upstream endpoint: " + parsed.href);
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(result.data.file.id, "file-id");
  assert.equal("object_key" in result.data.file, false);
  assert.ok(paths.includes("/b2api/v2/b2_get_upload_url"));
  assert.ok(paths.includes("/rest/v1/rpc/medbiohim_create_file_record"));
});
