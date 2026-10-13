import test from "node:test";
import assert from "node:assert/strict";
import {
  listSupabaseHistologySourceMaterials,
  getSupabaseHistologySourceFile,
} from "../src/histology-source-materials.js";

const userId = "11111111-1111-4111-8111-111111111111";
const objectKey = "source-materials/Учебники/Атлас.pdf";
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-publishable-key",
  B2_KEY_ID: "key-id-test",
  B2_APPLICATION_KEY: "application-key-test",
  B2_BUCKET: "medbiohim-files",
  B2_BUCKET_ID: "bucket-id-test",
};
const request = (path = objectKey, authorization = "Bearer test-access-token") => new Request(
  "https://api-shadow.example.test/api/v1/histology/source-file?path=" + encodeURIComponent(path),
  { headers: authorization ? { authorization } : {} },
);
const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
const b2File = { fileName: objectKey, contentLength: 1234, uploadTimestamp: 1791840000000 };

function fetcherFactory(options = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const parsed = new URL(String(url));
    calls.push({ parsed, init });
    if (parsed.pathname === "/auth/v1/user") return json({ id: userId, email: "student@example.test" });
    if (parsed.pathname === "/rest/v1/group_memberships") {
      return json(options.member === false ? [] : [{ group_id: "group-1", groups: { specialty_slug: "mbh", is_active: true } }]);
    }
    if (parsed.pathname === "/b2api/v2/b2_authorize_account") {
      return json({ apiUrl: "https://api004.backblazeb2.com", downloadUrl: "https://f004.backblazeb2.com", authorizationToken: "account-token", accountId: "account-id" });
    }
    if (parsed.pathname === "/b2api/v2/b2_list_file_names") {
      const body = JSON.parse(init.body);
      if (options.empty) return json({ files: [] });
      return json({ files: body.prefix === "source-materials/Учебники/" ? [b2File] : [] });
    }
    if (parsed.pathname === "/b2api/v2/b2_get_download_authorization") {
      assert.deepEqual(JSON.parse(init.body), {
        bucketId: "bucket-id-test",
        fileNamePrefix: objectKey,
        validDurationInSeconds: 600,
      });
      return json({ authorizationToken: "download-token" });
    }
    if (parsed.hostname === "f004.backblazeb2.com") {
      assert.equal(parsed.searchParams.get("Authorization"), "download-token");
      return new Response(new Uint8Array([37, 80, 68, 70, 45]), { status: 200, headers: { "content-type": "application/pdf", "content-length": "5" } });
    }
    assert.fail("Unexpected request: " + parsed.href);
  };
  return { fetcher, calls };
}

test("textbook listing requires MBH membership and returns legacy item fields", async () => {
  const { fetcher, calls } = fetcherFactory();
  const result = await listSupabaseHistologySourceMaterials(request(), env, { folder: "Учебники" }, fetcher);
  assert.equal(result.ok, true);
  assert.equal(result.data.source, "backblaze-b2");
  assert.equal(result.data.status, "ready");
  assert.deepEqual(result.data.items[0], {
    name: "Атлас.pdf",
    path: objectKey,
    mime_type: "application/pdf",
    size_bytes: 1234,
    updated_at: new Date(b2File.uploadTimestamp).toISOString(),
  });
  assert.ok(calls.some((call) => call.parsed.pathname === "/b2api/v2/b2_list_file_names"));
});

test("textbook listing denies users outside MBH before B2 access", async () => {
  const { fetcher, calls } = fetcherFactory({ member: false });
  const result = await listSupabaseHistologySourceMaterials(request(), env, { folder: "Учебники" }, fetcher);
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(calls.some((call) => call.parsed.hostname.endsWith(".backblazeb2.com")), false);
});

test("textbook listing refuses arbitrary directories", async () => {
  let calls = 0;
  const result = await listSupabaseHistologySourceMaterials(request(), env, { folder: "../" }, async () => {
    calls += 1;
    return json([]);
  });
  assert.equal(result.status, 400);
  assert.equal(calls, 0);
});

test("textbook file delivery streams a private B2 PDF after checking membership", async () => {
  const { fetcher } = fetcherFactory();
  const response = await getSupabaseHistologySourceFile(request(objectKey), env, { path: objectKey }, fetcher);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.match(response.headers.get("content-disposition"), /Атлас.pdf/);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [37, 80, 68, 70, 45]);
});

test("textbook downloads reject traversal and unsupported extensions", async () => {
  const traversal = await getSupabaseHistologySourceFile(request("../secrets.pdf"), env, { path: "../secrets.pdf" }, async () => {
    assert.fail("Traversal must be rejected before network access");
  });
  assert.equal(traversal.status, 400);

  const nonPdf = await getSupabaseHistologySourceFile(request("Учебники/password.txt"), env, { path: "Учебники/password.txt" }, async () => {
    assert.fail("Non-PDF must be rejected before network access");
  });
  assert.equal(nonPdf.status, 400);
});
