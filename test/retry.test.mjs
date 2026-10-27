import test from "node:test";
import assert from "node:assert/strict";

import {
  isTemporaryAuthFailure,
  isTemporaryFailure,
  retryDelay,
  withRetry,
} from "../src/lib/retry.ts";
import { safeNextPath } from "../src/lib/navigation.ts";

test("only temporary codes are retryable", () => {
  for (const code of ["NETWORK", "TIMEOUT", "BAD_RESPONSE", "UPSTREAM", "DB_UNAVAILABLE"]) {
    assert.equal(isTemporaryFailure(code), true, code);
  }
  for (const code of ["VALIDATION_ERROR", "FORBIDDEN", "NOT_FOUND", "UNAUTHORIZED", "INVALID_REFRESH"]) {
    assert.equal(isTemporaryFailure(code), false, code);
  }
  assert.equal(isTemporaryFailure(undefined), false);
});

test("the auth retry vocabulary has one home", () => {
  assert.equal(isTemporaryAuthFailure("DB_UNAVAILABLE"), true);
  assert.equal(isTemporaryAuthFailure("FORBIDDEN"), false);
});

test("backoff grows exponentially and stays inside the cap", () => {
  const options = { baseDelayMs: 100, maxDelayMs: 1000, random: () => 1 };
  assert.equal(retryDelay(0, options), 100);
  assert.equal(retryDelay(1, options), 200);
  assert.equal(retryDelay(2, options), 400);
  assert.equal(retryDelay(5, options), 1000);
});

test("jitter keeps parallel callers apart", () => {
  const options = { baseDelayMs: 400, maxDelayMs: 4000, random: () => 0 };
  assert.equal(retryDelay(0, options), 200);
  assert.equal(retryDelay(0, { ...options, random: () => 1 }), 400);
});

test("a retryable result is asked twice and then returned", async () => {
  const calls = [];
  const result = await withRetry(
    async () => ({ ok: false, code: "NETWORK", n: calls.push(1) }),
    () => true,
    { attempts: 2, sleep: async () => {} }
  );
  assert.equal(calls.length, 2);
  assert.equal(result.code, "NETWORK");
});

test("a non-retryable result is asked exactly once", async () => {
  let calls = 0;
  await withRetry(
    async () => {
      calls += 1;
      return { ok: false, code: "VALIDATION_ERROR" };
    },
    (result) => result.code === "NETWORK",
    { attempts: 3, sleep: async () => {} }
  );
  assert.equal(calls, 1);
});

test("a successful first attempt is never repeated", async () => {
  let calls = 0;
  const value = await withRetry(
    async () => {
      calls += 1;
      return { ok: true };
    },
    (result) => !result.ok,
    { attempts: 3, sleep: async () => {} }
  );
  assert.equal(calls, 1);
  assert.equal(value.ok, true);
});

test("the post-login redirect never leaves the site", () => {
  assert.equal(safeNextPath("/search?q=abc"), "/search?q=abc");
  assert.equal(safeNextPath("/materials"), "/materials");
  for (const hostile of ["https://evil.example", "//evil.example", "/\\evil", "javascript:alert(1)", "", null, undefined]) {
    assert.equal(safeNextPath(hostile), "/", String(hostile));
  }
  assert.equal(safeNextPath("relative", "/fallback"), "/fallback");
});

test("a recovered retry returns the healthy answer", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      return calls === 1 ? { ok: false, code: "NETWORK" } : { ok: true, code: "" };
    },
    (value) => !value.ok,
    { attempts: 3, sleep: async () => {} }
  );
  assert.equal(calls, 2);
  assert.equal(result.ok, true);
});
