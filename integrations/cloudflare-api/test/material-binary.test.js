import test from "node:test";
import assert from "node:assert/strict";
import { streamSupabaseMaterialFile } from "../src/material-binary.js";

const env = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  B2_KEY_ID: "test-b2-key-id",
  B2_APPLICATION_KEY: "test-b2-application-key",
  B2_BUCKET: "medbiohim-files",
  B2_BUCKET_ID: "test-bucket-id",
};
const userId = "11111111-1111-4111-8111-111111111111";

function request(options = {}) {
  const headers = new Headers({ authorization: "Bearer valid-user-token" });
  if (options.range) headers.set("range", options.range);
  return new Request("https://api-shadow.example.test/api/v1/materials/material-1/file", { headers });
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
function rowResponse(url) {
  if (url.pathname === "/auth/v1/user") return json({ id: userId });
  if (url.pathname === "/rest/v1/materials") {
    return json([{ id: "material-1", subject_id: "subject-1", file_id: "file-1", source_key: null }]);
  }
  if (url.pathname === "/rest/v1/subjects") {
    return json([{ id: "subject-1", slug: "biochemistry", specialty_slug: null, is_active: true }]);
  }
  if (url.pathname === "/rest/v1/files") {
    return json([{ id: "file-1", object_key: "uploads/course/test.pdf", group_id: null, status: "active" }]);
  }
  return null;
}
function fetcherFactory(options = {}) {
  const calls = [];
  const fetcher = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const row = rowResponse(url);
    if (row) return row;
    if (url.hostname === "api.backblazeb2.com" && url.pathname.endsWith("/b2_authorize_account")) {
      return json({
        apiUrl: "https://api123.backblazeb2.com",
        downloadUrl: "https://f123.backblazeb2.com",
        authorizationToken: "account-auth-token",
        accountId: "test-account-id",
      });
    }
    if (url.hostname === "api123.backblazeb2.com" && url.pathname.endsWith("/b2_get_download_authorization")) {
      const body = JSON.parse(init.body);
      assert.equal(body.bucketId, env.B2_BUCKET_ID);
      assert.equal(body.fileNamePrefix, "uploads/course/test.pdf");
      return json({ authorizationToken: "temporary-file-token" });
    }
    if (url.hostname === "f123.backblazeb2.com") {
      assert.equal(url.pathname, "/file/medbiohim-files/uploads/course/test.pdf");
      assert.equal(url.searchParams.get("Authorization"), "temporary-file-token");
      if (options.upstreamFail) return new Response("unavailable", { status: 404 });
      if (options.range) {
        assert.equal(init.headers.range, options.range);
        return new Response("PDF", {
          status: 206,
          headers: {
            "content-type": "application/pdf",
            "content-length": "3",
            "content-range": "bytes 0-2/9",
          },
        });
      }
      return new Response("PDF bytes", {
        status: 200,
        headers: { "content-type": "application/pdf", "content-length": "9" },
      });
    }
    throw new Error("Unexpected request URL: " + url.origin + url.pathname);
  };
  return { fetcher, calls };
}

test("binary material route streams the verified private B2 object without exposing its signed URL", async () => {
  const { fetcher, calls } = fetcherFactory();
  const result = await streamSupabaseMaterialFile(request(), env, "material-1", fetcher);
  assert.equal(result.ok, true);
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get("content-type"), "application/pdf");
  assert.equal(result.response.headers.get("content-disposition"), "inline");
  assert.equal(result.response.headers.get("cache-control"), "private, no-store");
  assert.equal(await result.response.text(), "PDF bytes");
  assert.equal(calls.filter((call) => call.url.hostname === "f123.backblazeb2.com").length, 1);
});

test("binary material route forwards one byte range and streams 206 content", async () => {
  const range = "bytes=0-2";
  const { fetcher } = fetcherFactory({ range });
  const result = await streamSupabaseMaterialFile(request({ range }), env, "material-1", fetcher);
  assert.equal(result.ok, true);
  assert.equal(result.response.status, 206);
  assert.equal(result.response.headers.get("content-range"), "bytes 0-2/9");
  assert.equal(result.response.headers.get("content-length"), "3");
  assert.equal(await result.response.text(), "PDF");
});

test("binary material route rejects malformed/multiple ranges", async () => {
  let calls = 0;
  const result = await streamSupabaseMaterialFile(request({ range: "bytes=0-2,5-7" }), env, "material-1", async () => {
    calls += 1;
    throw new Error("must not reach data/storage");
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 416);
  assert.equal(calls, 0);
});

test("binary material route refuses histology files without explicit active MBH membership before B2 calls", async () => {
  let b2Calls = 0;
  const { fetcher: baseFetcher } = fetcherFactory();
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/rest/v1/subjects") {
      return json([{ id: "subject-1", slug: "histology", specialty_slug: null, is_active: true }]);
    }
    if (url.pathname === "/rest/v1/group_memberships") return json([]);
    if (url.hostname.endsWith("backblazeb2.com")) b2Calls += 1;
    return baseFetcher(input, init);
  };
  const result = await streamSupabaseMaterialFile(request(), env, "material-1", fetcher);
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, "FORBIDDEN");
  assert.equal(b2Calls, 0);
});

test("binary material route fails closed when B2 configuration is absent", async () => {
  const { fetcher, calls } = fetcherFactory();
  const incomplete = { ...env, B2_KEY_ID: "", B2_APPLICATION_KEY: "" };
  const result = await streamSupabaseMaterialFile(request(), incomplete, "material-1", fetcher);
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, "FILE_STORAGE_NOT_CONFIGURED");
  assert.equal(calls.some((call) => call.url.hostname === "f123.backblazeb2.com"), false);
});

test("binary material route maps an upstream object failure to a safe service error", async () => {
  const { fetcher } = fetcherFactory({ upstreamFail: true });
  const result = await streamSupabaseMaterialFile(request(), env, "material-1", fetcher);
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, "FILE_STREAM_UNAVAILABLE");
  assert.doesNotMatch(result.message, /temporary-file-token|uploads\/course/);
});

test("binary material route rejects missing auth before data reads", async () => {
  const noAuthRequest = new Request("https://api-shadow.example.test/api/v1/materials/material-1/file");
  let calls = 0;
  const result = await streamSupabaseMaterialFile(noAuthRequest, env, "material-1", async () => {
    calls += 1;
    throw new Error("must not be called without auth");
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(calls, 0);
});
