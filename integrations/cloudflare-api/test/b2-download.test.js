import test from "node:test";
import assert from "node:assert/strict";
import { createB2DownloadUrl } from "../src/b2-download.js";

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

const env = {
  B2_KEY_ID: "key-id-test",
  B2_APPLICATION_KEY: "application-key-test",
  B2_BUCKET: "medbiohim-files",
  B2_BUCKET_ID: "bucket-id-test",
};

test("B2 signer creates a bounded short-lived URL for a DB-resolved object key", async () => {
  const calls = [];
  const result = await createB2DownloadUrl(env, "uploads/user-1/lecture notes.pdf", 900, async (url, init) => {
    const parsed = new URL(String(url));
    calls.push({ parsed, init });
    if (parsed.pathname === "/b2api/v2/b2_authorize_account") {
      assert.equal(init.headers.authorization, "Basic " + btoa("key-id-test:application-key-test"));
      return response({
        apiUrl: "https://api004.backblazeb2.com",
        downloadUrl: "https://f004.backblazeb2.com",
        authorizationToken: "account-token",
        accountId: "account-id",
      });
    }
    assert.equal(parsed.pathname, "/b2api/v2/b2_get_download_authorization");
    assert.equal(init.headers.authorization, "account-token");
    assert.deepEqual(JSON.parse(init.body), {
      bucketId: "bucket-id-test",
      fileNamePrefix: "uploads/user-1/lecture notes.pdf",
      validDurationInSeconds: 900,
    });
    return response({ authorizationToken: "download-token" });
  });
  assert.equal(result.ok, true);
  assert.equal(result.expires_in, 900);
  const url = new URL(result.url);
  assert.equal(url.hostname, "f004.backblazeb2.com");
  assert.equal(url.pathname, "/file/medbiohim-files/uploads/user-1/lecture%20notes.pdf");
  assert.equal(url.searchParams.get("Authorization"), "download-token");
  assert.equal(calls.length, 2);
});

test("B2 signer rejects missing configuration and unsafe object keys", async () => {
  const missing = await createB2DownloadUrl({}, "safe/key");
  assert.equal(missing.status, 503);
  const unsafe = await createB2DownloadUrl(env, "../secret");
  assert.equal(unsafe.status, 422);
});

test("B2 signer refuses unexpected authorization hosts and never follows redirects", async () => {
  const result = await createB2DownloadUrl(env, "safe/key", 600, async () => response({
    apiUrl: "https://attacker.example",
    downloadUrl: "https://f004.backblazeb2.com",
    authorizationToken: "account-token",
    accountId: "account-id",
  }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
});
