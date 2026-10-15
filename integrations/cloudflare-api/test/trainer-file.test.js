import test from "node:test";
import assert from "node:assert/strict";
import { getSupabaseTrainerImageUrl } from "../src/trainer-file.js";

const env = {
  SUPABASE_URL: "https://project-id.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key-for-test-only",
  B2_KEY_ID: "key-id-test",
  B2_APPLICATION_KEY: "application-key-test",
  B2_BUCKET: "medbiohim-files",
  B2_BUCKET_ID: "bucket-id-test",
};
function request(authorization = "Bearer valid-user-token") {
  return new Request("https://api-shadow.example.test/api/v1/trainers/feed/card-1/image", {
    headers: authorization ? { authorization } : {},
  });
}
function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("trainer image URL reads only the safe published view and signs its active B2 file", async () => {
  const calls = [];
  const result = await getSupabaseTrainerImageUrl(request(), env, "card-1", async (url, init) => {
    const parsed = new URL(String(url));
    calls.push({ parsed, init });
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/trainer_feed_cards_public") {
      assert.equal(init.headers.authorization, "Bearer valid-user-token");
      return response([{ id: "card-1", subject_slug: "chemistry", specialty_slug: null, source_file_id: "file-1", source_key: "trainer/cards/card-1.png", is_published: true }]);
    }
    if (parsed.pathname === "/rest/v1/files") return response([{ id: "file-1", object_key: "trainer/cards/card-1.png", group_id: null, status: "active" }]);
    if (parsed.pathname === "/b2api/v2/b2_authorize_account") {
      return response({ apiUrl: "https://api004.backblazeb2.com", downloadUrl: "https://f004.backblazeb2.com", authorizationToken: "account-token", accountId: "account-id" });
    }
    if (parsed.pathname === "/b2api/v2/b2_get_download_authorization") {
      assert.deepEqual(JSON.parse(init.body), { bucketId: "bucket-id-test", fileNamePrefix: "trainer/cards/card-1.png", validDurationInSeconds: 600 });
      return response({ authorizationToken: "download-token" });
    }
    assert.fail("Unexpected endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.mode, "presigned");
  assert.equal(result.data.card_id, "card-1");
  assert.equal(new URL(result.data.url).searchParams.get("Authorization"), "download-token");
  assert.equal(calls.length, 5);
});

test("trainer image URL denies MBH media without active specialty membership", async () => {
  let b2Calls = 0;
  const result = await getSupabaseTrainerImageUrl(request(), env, "card-1", async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/trainer_feed_cards_public") return response([{ id: "card-1", subject_slug: "histology", specialty_slug: "mbh", source_file_id: "file-1", source_key: "histology/image.png", is_published: true }]);
    if (parsed.pathname === "/rest/v1/files") return response([{ id: "file-1", object_key: "histology/image.png", group_id: null, status: "active" }]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response([]);
    if (parsed.hostname.endsWith(".backblazeb2.com")) b2Calls += 1;
    assert.fail("Unexpected endpoint: " + parsed.pathname);
  });
  assert.equal(result.status, 403);
  assert.equal(result.code, "FORBIDDEN");
  assert.equal(b2Calls, 0);
});

test("trainer image URL can use the published histology source key during file-table backfill", async () => {
  const result = await getSupabaseTrainerImageUrl(request(), env, "card-1", async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/trainer_feed_cards_public") {
      return response([{ id: "card-1", subject_slug: "histology", specialty_slug: "mbh", source_file_id: null, source_key: "electronograms/images/test.png", is_published: true }]);
    }
    if (parsed.pathname === "/rest/v1/group_memberships") {
      return response([{ group_id: "group-1", groups: { specialty_slug: "mbh", is_active: true } }]);
    }
    if (parsed.pathname === "/b2api/v2/b2_authorize_account") {
      return response({ apiUrl: "https://api004.backblazeb2.com", downloadUrl: "https://f004.backblazeb2.com", authorizationToken: "account-token", accountId: "account-id" });
    }
    if (parsed.pathname === "/b2api/v2/b2_get_download_authorization") {
      assert.deepEqual(JSON.parse(init.body), { bucketId: "bucket-id-test", fileNamePrefix: "electronograms/images/test.png", validDurationInSeconds: 600 });
      return response({ authorizationToken: "download-token" });
    }
    assert.fail("Unexpected endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.mode, "presigned");
  assert.equal(new URL(result.data.url).searchParams.get("Authorization"), "download-token");
});

test("trainer image URL prefers a private Upstash Blob object when it exists", async () => {
  let b2Calls = 0;
  const envWithBlob = {
    ...env,
    UPSTASH_BLOB_TOKEN: "test-only-token",
    FILE_STORAGE: {
      async head(key) {
        assert.equal(key, "electronograms/images/test.png");
        return { size: 123, httpMetadata: { contentType: "image/png" } };
      },
      async signedReadUrl(key, options) {
        assert.equal(key, "electronograms/images/test.png");
        assert.equal(options.expiresIn, "5m");
        return { url: "https://blob.example.test/signed-read", expiresAt: "2026-10-14T00:05:00Z" };
      },
    },
  };
  const result = await getSupabaseTrainerImageUrl(request(), envWithBlob, "card-1", async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/trainer_feed_cards_public") {
      return response([{ id: "card-1", subject_slug: "histology", specialty_slug: "mbh", source_file_id: null, source_key: "electronograms/images/test.png", is_published: true }]);
    }
    if (parsed.pathname === "/rest/v1/group_memberships") {
      return response([{ group_id: "group-1", groups: { specialty_slug: "mbh", is_active: true } }]);
    }
    if (parsed.hostname.endsWith(".backblazeb2.com")) b2Calls += 1;
    assert.fail("Unexpected endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.mode, "upstash-blob");
  assert.equal(result.data.url, "https://blob.example.test/signed-read");
  assert.equal(b2Calls, 0);
});

test("trainer image URL resolves legacy preparation hash keys to uploaded archive paths", async () => {
  const checked = [];
  let listed = false;
  const expectedKey = "5_Фотографии препаратов/цитология, эмбриология и общая гистология/4.Эпителий. Многорядный эпителий.jpg";
  const envWithBlob = {
    ...env,
    UPSTASH_BLOB_TOKEN: "test-only-token",
    FILE_STORAGE: {
      async list({ prefix }) {
        listed = true;
        return { blobs: expectedKey.startsWith(prefix) ? [{ path: expectedKey, size: 123 }] : [], cursor: null };
      },
      async head(key) {
        checked.push(key);
        return key === expectedKey ? { size: 123, httpMetadata: { contentType: "image/jpeg" } } : null;
      },
      async signedReadUrl(key, options) {
        assert.equal(key, expectedKey);
        assert.equal(options.expiresIn, "5m");
        return { url: "https://blob.example.test/preparation-photo", expiresAt: "2026-10-14T00:05:00Z" };
      },
    },
  };
  const result = await getSupabaseTrainerImageUrl(request(), envWithBlob, "card-prep-1", async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/trainer_feed_cards_public") {
      return response([{
        id: "card-prep-1",
        mode_set: "preparation",
        subject_slug: "histology",
        specialty_slug: "mbh",
        source_file_id: null,
        source_key: "histology-photo-legacy-hash",
        preparation: { imagePath: "4.Эпителий. Многорядный эпителий.jpg" },
        is_published: true,
      }]);
    }
    if (parsed.pathname === "/rest/v1/group_memberships") {
      return response([{ group_id: "group-1", groups: { specialty_slug: "mbh", is_active: true } }]);
    }
    assert.fail("Unexpected endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.mode, "upstash-blob");
  assert.equal(result.data.url, "https://blob.example.test/preparation-photo");
  assert.equal(listed, true);
  assert.ok(checked.length > 0);
  assert.equal(checked.includes(expectedKey), false);
});

test("trainer image URL rejects malformed card IDs before database access", async () => {
  let calls = 0;
  const result = await getSupabaseTrainerImageUrl(request(), env, "../secret", async (url) => { calls += 1; assert.equal(new URL(String(url)).pathname, "/auth/v1/user"); return response({ id: "user-1" }); });
  assert.equal(result.status, 422);
  assert.equal(calls, 1);
});


test("trainer image URL refuses ambiguous preparation basenames instead of choosing a random file", async () => {
  const envWithBlob = {
    ...env,
    B2_KEY_ID: "",
    B2_APPLICATION_KEY: "",
    B2_BUCKET: "",
    UPSTASH_BLOB_TOKEN: "test-only-token",
    FILE_STORAGE: {
      async head() { return null; },
      async list() {
        return { blobs: [
          { path: "5_Фотографии препаратов/стом. гистология/эпителий.jpg", size: 100 },
          { path: "5_Фотографии препаратов/частная гистология/эпителий.jpg", size: 200 },
        ], cursor: null };
      },
      async signedReadUrl() { assert.fail("ambiguous basename must not be signed"); },
    },
  };
  const result = await getSupabaseTrainerImageUrl(request(), envWithBlob, "card-ambiguous", async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/trainer_feed_cards_public") {
      return response([{
        id: "card-ambiguous", mode_set: "preparation", subject_slug: "histology",
        specialty_slug: "mbh", source_file_id: null, source_key: "histology-photo-ambiguous",
        preparation: { imagePath: "эпителий.jpg" }, is_published: true,
      }]);
    }
    if (parsed.pathname === "/rest/v1/group_memberships") {
      return response([{ group_id: "group-1", groups: { specialty_slug: "mbh", is_active: true } }]);
    }
    if (parsed.hostname.endsWith(".backblazeb2.com")) {
      return response({ apiUrl: "https://api004.backblazeb2.com", downloadUrl: "https://f004.backblazeb2.com", authorizationToken: "account-token", accountId: "account-id" });
    }
    if (parsed.pathname === "/b2api/v2/b2_authorize_account") {
      return response({ apiUrl: "https://api004.backblazeb2.com", downloadUrl: "https://f004.backblazeb2.com", authorizationToken: "account-token", accountId: "account-id" });
    }
    if (parsed.pathname === "/b2api/v2/b2_list_buckets") {
      return response({ buckets: [{ bucketName: "medbiohim-files", bucketId: "bucket-id-test" }] });
    }
    if (parsed.pathname === "/b2api/v2/b2_get_download_authorization") {
      return response({ authorizationToken: "download-token" });
    }
    assert.fail("Unexpected endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "MEDIA_NOT_MIGRATED");
});

test("trainer corpus resolves private Blob objects uploaded under the histology/ prefix", async () => {
  const target = "histology/5_Фотографии препаратов/частная гистология/epithelium.jpg";
  const checked = [];
  const envWithBlob = {
    ...env,
    UPSTASH_BLOB_TOKEN: "test-only-token",
    FILE_STORAGE: {
      async head(key) { checked.push(key); return key === target ? { size: 100 } : null; },
      async signedReadUrl(key, options) {
        assert.equal(key, target);
        assert.equal(options.expiresIn, "5m");
        return { url: "https://blob.example.test/histology-photo", expiresAt: "2026-10-15T00:05:00Z" };
      },
    },
  };
  const result = await getSupabaseTrainerImageUrl(request(), envWithBlob, "card-prefixed", async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/auth/v1/user") return response({ id: "user-1" });
    if (parsed.pathname === "/rest/v1/trainer_feed_cards_public") return response([{
      id: "card-prefixed", mode_set: "preparation", subject_slug: "histology", specialty_slug: "mbh",
      source_file_id: null, source_key: "legacy-photo-id", preparation: { imagePath: "5_Фотографии препаратов/частная гистология/epithelium.jpg" }, is_published: true,
    }]);
    if (parsed.pathname === "/rest/v1/group_memberships") return response([{ group_id: "group-1", groups: { specialty_slug: "mbh", is_active: true } }]);
    assert.fail("Unexpected endpoint: " + parsed.pathname);
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.mode, "upstash-blob");
  assert.equal(result.data.url, "https://blob.example.test/histology-photo");
  assert.ok(checked.includes(target));
});
