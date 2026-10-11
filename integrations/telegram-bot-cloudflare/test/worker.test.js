import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../src/worker.js";

const baseEnv = { TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_WEBHOOK_SECRET: "test-secret" };
function request(path = "/api/webhook", { method = "POST", secret = "test-secret", body = {} } = {}) {
  return new Request(`https://worker.example${path}`, {
    method,
    headers: { ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}), "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
}

test("health endpoint does not require a bot token", async () => {
  const response = await handleRequest(request("/health", { method: "GET" }), {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test("rejects wrong webhook secret", async () => {
  const response = await handleRequest(request("/api/webhook", {
    secret: "wrong",
    body: { message: { text: "/start", chat: { id: 1, type: "private" } } },
  }), baseEnv);
  assert.equal(response.status, 401);
});

test("rejects non-POST webhook requests", async () => {
  const response = await handleRequest(request("/api/webhook", { method: "GET" }), baseEnv);
  assert.equal(response.status, 405);
});

test("ignores non-command private messages without Telegram API call", async () => {
  const response = await handleRequest(request("/api/webhook", {
    body: { message: { text: "привет", chat: { id: 1, type: "private" } } },
  }), baseEnv);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ignored, true);
});

test("returns 503 when secrets are missing", async () => {
  const response = await handleRequest(request(), {});
  assert.equal(response.status, 503);
});

test("rejects malformed JSON", async () => {
  const response = await handleRequest(new Request("https://worker.example/api/webhook", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "test-secret" },
    body: "{bad",
  }), baseEnv);
  assert.equal(response.status, 400);
});

test("sends /schedule reply with canonical site link", async (t) => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /bottest-token\/sendMessage$/);
    const payload = JSON.parse(init.body);
    assert.equal(payload.chat_id, 42);
    assert.equal(payload.reply_markup.inline_keyboard[0][0].url, "https://medbiohim.vercel.app/schedule");
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = oldFetch; });
  const response = await handleRequest(request("/api/webhook", {
    body: { update_id: 1, message: { text: "/schedule", chat: { id: 42, type: "private" } } },
  }), baseEnv);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test("forwards group update only to configured HTTPS relay", async (t) => {
  const oldFetch = globalThis.fetch;
  let forwarded = false;
  globalThis.fetch = async (url, init) => {
    forwarded = true;
    assert.equal(String(url), "https://api.example.test/api/v1/telegram/webhook");
    assert.equal(init.headers["x-telegram-bot-api-secret-token"], "test-secret");
    return new Response("{}", { status: 200 });
  };
  t.after(() => { globalThis.fetch = oldFetch; });
  const response = await handleRequest(request("/api/webhook", {
    body: { update_id: 2, message: { text: "homework", chat: { id: -1001, type: "supergroup" } } },
  }), { ...baseEnv, TELEGRAM_HOMEWORK_WEBHOOK_URL: "https://api.example.test/api/v1/telegram/webhook" });
  assert.equal(response.status, 200);
  assert.equal(forwarded, true);
  assert.equal((await response.json()).forwarded, true);
});

test("rejects oversized request bodies", async () => {
  const large = "x".repeat(256 * 1024 + 1);
  const response = await handleRequest(new Request("https://worker.example/api/webhook", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "test-secret", "content-type": "text/plain" },
    body: large,
  }), baseEnv);
  assert.equal(response.status, 413);
});
