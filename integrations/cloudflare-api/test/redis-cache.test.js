import test from "node:test";
import assert from "node:assert/strict";
import { getRedisJsonCache, setRedisJsonCache } from "../src/redis-cache.js";

const env = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "test-only-token",
};

test("Redis cache GET parses JSON and uses bearer auth without logging values", async () => {
  const value = await getRedisJsonCache(env, "medbiohim:trainer-feed:user-1:histology:mbh:30:0", async (url, init) => {
    assert.equal(new URL(String(url)).href, "https://example.upstash.io/");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.get("authorization"), "Bearer test-only-token");
    assert.deepEqual(JSON.parse(init.body), ["GET", "medbiohim:trainer-feed:user-1:histology:mbh:30:0"]);
    return new Response(JSON.stringify({ result: JSON.stringify({ items: [{ id: "card-1" }] }) }), { status: 200 });
  });
  assert.deepEqual(value, { items: [{ id: "card-1" }] });
});

test("Redis cache SET applies bounded TTL and ignores unavailable cache", async () => {
  const result = await setRedisJsonCache(env, "medbiohim:trainer-feed:user-1:all:all:30:0", { items: [] }, 1000, async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), ["SET", "medbiohim:trainer-feed:user-1:all:all:30:0", JSON.stringify({ items: [] }), "EX", "60"]);
    return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
  });
  assert.equal(result, true);
  assert.equal(await getRedisJsonCache({}, "medbiohim:x", async () => { throw new Error("must not fetch"); }), null);
  assert.equal(await setRedisJsonCache(env, "other-prefix:key", { value: 1 }, 15, async () => { throw new Error("must not fetch"); }), false);
});

test("Redis cache fails open on upstream failures and rejects invalid values", async () => {
  assert.equal(await getRedisJsonCache(env, "medbiohim:broken", async () => new Response("bad", { status: 503 })), null);
  assert.equal(await getRedisJsonCache(env, "medbiohim:broken", async () => new Response(JSON.stringify({ result: "not-json" }))), null);
  assert.equal(await setRedisJsonCache(env, "medbiohim:huge", { text: "x".repeat(260000) }, 15, async () => { throw new Error("must not fetch"); }), false);
});
