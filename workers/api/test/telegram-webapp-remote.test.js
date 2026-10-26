/**
 * The API Worker must be able to verify Mini App `initData` WITHOUT holding the
 * bot token: it delegates to the bot Worker's `/api/verify-initdata`.
 *
 * These tests stub `fetch`, so they assert the exact request that leaves this
 * Worker (URL, method, header, body) and every mapping of the answer — including
 * that an infrastructure failure is never reported as a bad signature.
 *
 * Run: node --test test/telegram-webapp-remote.test.js
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  hasRemoteVerifier,
  internalSecretValue,
  verifyTelegramInitDataRemote,
  verifyUrl,
} from "../src/lib/telegram-initdata.ts";

const VERIFY_URL = "https://medbiohim-telegram.ryazansevegor.workers.dev/api/verify-initdata";
const INIT_DATA = "auth_date=1700000000&user=%7B%22id%22%3A42%7D&hash=abc";

function withFetch(handler, run) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
  return Promise.resolve()
    .then(() => run(calls))
    .finally(() => {
      globalThis.fetch = original;
    });
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function env(extra = {}) {
  return { TELEGRAM_BOT_VERIFY_URL: VERIFY_URL, TELEGRAM_INTERNAL_SECRET: "internal-secret-value", ...extra };
}

test("remote verification is only considered configured with a secret and an allowed URL", () => {
  assert.equal(hasRemoteVerifier(env()), true);
  assert.equal(hasRemoteVerifier({ TELEGRAM_BOT_VERIFY_URL: VERIFY_URL }), false, "no secret");
  assert.equal(hasRemoteVerifier({ TELEGRAM_INTERNAL_SECRET: "s" }), false, "no url");
  assert.equal(hasRemoteVerifier(env({ TELEGRAM_BOT_VERIFY_URL: "http://medbiohim-telegram.ryazansevegor.workers.dev/api/verify-initdata" })), false, "http is refused");
  assert.equal(hasRemoteVerifier(env({ TELEGRAM_BOT_VERIFY_URL: "https://evil.example.com/api/verify-initdata" })), false, "foreign host is refused");
  assert.equal(hasRemoteVerifier(env({ TELEGRAM_BOT_VERIFY_URL: "https://medbiohim-telegram.ryazansevegor.workers.dev/other" })), false, "wrong path is refused");
  assert.equal(hasRemoteVerifier(env({ TELEGRAM_BOT_VERIFY_URL: "not a url" })), false);
  assert.equal(verifyUrl(env()), VERIFY_URL);
});

test("a dedicated internal secret wins over the webhook secret", () => {
  assert.equal(internalSecretValue({ TELEGRAM_INTERNAL_SECRET: "a", TELEGRAM_WEBHOOK_SECRET: "b" }), "a");
  assert.equal(internalSecretValue({ TELEGRAM_WEBHOOK_SECRET: "b" }), "b");
  assert.equal(internalSecretValue({}), "");
});

test("a verified answer is mapped to the identity, and the request carries only the shared secret", async () => {
  await withFetch(
    () => jsonResponse({ ok: true, user: { id: 279058397, username: "vdlav", first_name: "Влад" }, auth_date: 1700000000 }),
    async (calls) => {
      const result = await verifyTelegramInitDataRemote(INIT_DATA, env());
      assert.deepEqual(result, {
        ok: true,
        auth_date: 1700000000,
        user: { id: 279058397, username: "vdlav", first_name: "Влад" },
      });

      assert.equal(calls.length, 1);
      const [call] = calls;
      assert.equal(call.url, VERIFY_URL);
      assert.equal(call.init.method, "POST");
      assert.equal(call.init.headers["x-medbiohim-internal"], "internal-secret-value");
      assert.deepEqual(Object.keys(call.init.headers).sort(), ["content-type", "x-medbiohim-internal"]);
      assert.deepEqual(JSON.parse(call.init.body), { init_data: INIT_DATA });
      // No token-shaped material can leak: this Worker never has one to send.
      assert.ok(!String(call.init.body).includes("bot"), "the body must only carry init_data");
    }
  );
});

test("a proven bad signature becomes a credential failure", async () => {
  await withFetch(() => jsonResponse({ ok: false, error: "INVALID_INIT_DATA" }, 401), async () => {
    assert.deepEqual(await verifyTelegramInitDataRemote(INIT_DATA, env()), { ok: false, error: "invalid_hash" });
  });
});

test("infrastructure failures are never reported as a bad signature", async () => {
  const cases = [
    ["unauthorized (wrong shared secret)", () => jsonResponse({ ok: false, error: "UNAUTHORIZED" }, 401)],
    ["bot internal not configured", () => jsonResponse({ ok: false, error: "INTERNAL_NOT_CONFIGURED" }, 503)],
    ["bot not configured", () => jsonResponse({ ok: false, error: "BOT_NOT_CONFIGURED" }, 503)],
    ["server error", () => jsonResponse({ ok: false, error: "BOOM" }, 500)],
    ["ok:false with 200", () => jsonResponse({ ok: false }, 200)],
    ["gateway html instead of json", () => new Response("<html>502</html>", { status: 502 })],
    ["network failure", () => { throw new Error("ECONNRESET"); }],
  ];
  for (const [name, handler] of cases) {
    await withFetch(handler, async () => {
      assert.deepEqual(await verifyTelegramInitDataRemote(INIT_DATA, env()), { ok: false, error: "internal_unavailable" }, name);
    });
  }
});

test("a malformed success payload is rejected instead of trusted", async () => {
  const cases = [
    ["no user", { ok: true, auth_date: 1 }],
    ["id missing", { ok: true, user: { username: "x" }, auth_date: 1 }],
    ["id as string", { ok: true, user: { id: "42" }, auth_date: 1 }],
    ["id zero", { ok: true, user: { id: 0 }, auth_date: 1 }],
    ["id negative", { ok: true, user: { id: -1 }, auth_date: 1 }],
    ["id fractional", { ok: true, user: { id: 1.5 }, auth_date: 1 }],
  ];
  for (const [name, payload] of cases) {
    await withFetch(() => jsonResponse(payload), async () => {
      assert.deepEqual(await verifyTelegramInitDataRemote(INIT_DATA, env()), { ok: false, error: "internal_unavailable" }, name);
    });
  }
});

test("unexpected extra fields in the answer are ignored, not echoed", async () => {
  await withFetch(
    () => jsonResponse({ ok: true, user: { id: 7, username: null, first_name: null }, auth_date: 5, hash: "leak", token: "leak" }),
    async () => {
      const result = await verifyTelegramInitDataRemote(INIT_DATA, env());
      assert.deepEqual(result, { ok: true, auth_date: 5, user: { id: 7, username: null, first_name: null } });
      assert.deepEqual(Object.keys(result).sort(), ["auth_date", "ok", "user"]);
      assert.deepEqual(Object.keys(result.user).sort(), ["first_name", "id", "username"]);
    }
  );
});

test("an unconfigured remote verifier makes no network call at all", async () => {
  await withFetch(
    () => jsonResponse({ ok: true, user: { id: 1 } }),
    async (calls) => {
      assert.deepEqual(await verifyTelegramInitDataRemote(INIT_DATA, { TELEGRAM_BOT_VERIFY_URL: VERIFY_URL }), {
        ok: false,
        error: "internal_not_configured",
      });
      assert.deepEqual(await verifyTelegramInitDataRemote(INIT_DATA, { TELEGRAM_INTERNAL_SECRET: "s" }), {
        ok: false,
        error: "internal_not_configured",
      });
      assert.deepEqual(await verifyTelegramInitDataRemote(INIT_DATA, env({ TELEGRAM_BOT_VERIFY_URL: "https://evil.example.com/api/verify-initdata" })), {
        ok: false,
        error: "internal_not_configured",
      });
      assert.equal(calls.length, 0, "a misconfigured verifier must not be called");
    }
  );
});

test("a hanging verifier is cut off by the timeout", async () => {
  // A real fetch rejects with AbortError when the signal fires; the stub has to
  // honour `init.signal` the same way, otherwise it would prove nothing.
  await withFetch(
    (_url, init) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(jsonResponse({ ok: true, user: { id: 1 } })), 5000);
        init.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
        });
      }),
    async () => {
      const started = Date.now();
      const result = await verifyTelegramInitDataRemote(INIT_DATA, env(), 150);
      assert.deepEqual(result, { ok: false, error: "internal_unavailable" });
      assert.ok(Date.now() - started < 3000, "the timeout must fire quickly");
    }
  );
});