const test = require("node:test");
const assert = require("node:assert/strict");
const webhook = require("../api/webhook");

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function makeRequest({ method = "POST", secret = "test-secret", body = {} } = {}) {
  return {
    method,
    headers: secret ? { "x-telegram-bot-api-secret-token": secret } : {},
    body,
  };
}

test("rejects non-POST requests", async () => {
  const res = makeResponse();
  await webhook(makeRequest({ method: "GET" }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
});

test("does not operate without server-side bot secrets", async () => {
  const oldToken = process.env.TELEGRAM_BOT_TOKEN;
  const oldSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  const res = makeResponse();
  await webhook(makeRequest(), res);
  assert.equal(res.statusCode, 503);
  if (oldToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = oldToken;
  if (oldSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
  else process.env.TELEGRAM_WEBHOOK_SECRET = oldSecret;
});

test("rejects a wrong webhook secret before processing update", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_WEBHOOK_SECRET = "expected-secret";
  const res = makeResponse();
  await webhook(makeRequest({ secret: "wrong-secret", body: { message: { text: "/start", chat: { id: 1, type: "private" } } } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "UNAUTHORIZED");
});

test("rejects malformed JSON updates", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
  const res = makeResponse();
  await webhook(makeRequest({ body: "{not-json" }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "INVALID_UPDATE");
});

test("ignores group messages without calling Telegram API", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
  const oldFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; return { ok: true, status: 200 }; };
  try {
    const res = makeResponse();
    await webhook(makeRequest({ body: { message: { text: "/start", chat: { id: -100, type: "group" } } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ignored, true);
    assert.equal(called, false);
  } finally {
    global.fetch = oldFetch;
  }
});

test("replies to private public-command messages with a safe site link", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
  const oldFetch = global.fetch;
  let sent;
  global.fetch = async (url, init) => {
    assert.match(url, /bottest-token\/sendMessage$/);
    sent = JSON.parse(init.body);
    return { ok: true, status: 200 };
  };
  try {
    const res = makeResponse();
    await webhook(makeRequest({ body: JSON.stringify({ update_id: 123, message: { text: "/schedule", chat: { id: 42, type: "private" } } }) }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(sent.chat_id, 42);
    assert.equal(sent.reply_markup.inline_keyboard[0][0].url, "https://medbiohim.vercel.app/schedule");
  } finally {
    global.fetch = oldFetch;
  }
});
