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
