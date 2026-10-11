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

test("does not treat an unsuccessful Telegram API payload as delivered", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
  const oldFetch = global.fetch;
  const oldError = console.error;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: false }) });
  console.error = () => {};
  try {
    const res = makeResponse();
    await webhook(makeRequest({ body: { message: { text: "/site", chat: { id: 42, type: "private" } } } }), res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, "TELEGRAM_DELIVERY_FAILED");
  } finally {
    global.fetch = oldFetch;
    console.error = oldError;
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
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
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


test("forwards group homework updates to the PHP API using the webhook secret", async () => {
  const previous = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    secret: process.env.TELEGRAM_WEBHOOK_SECRET,
    endpoint: process.env.TELEGRAM_HOMEWORK_WEBHOOK_URL,
  };
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
  process.env.TELEGRAM_HOMEWORK_WEBHOOK_URL = "https://api.example.test/api/v1/telegram/webhook";
  const oldFetch = global.fetch;
  let forwarded;
  global.fetch = async (url, init) => {
    assert.equal(url, process.env.TELEGRAM_HOMEWORK_WEBHOOK_URL);
    forwarded = { headers: init.headers, body: JSON.parse(init.body) };
    return { ok: true, status: 200 };
  };
  try {
    const update = { update_id: 987, message: { message_id: 2, chat: { id: -100123, type: "supergroup" }, text: "К следующему занятию выучить тему" } };
    const res = makeResponse();
    await webhook(makeRequest({ body: update }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.forwarded, true);
    assert.equal(forwarded.headers["x-telegram-bot-api-secret-token"], "test-secret");
    assert.deepEqual(forwarded.body, update);
  } finally {
    global.fetch = oldFetch;
    if (previous.token === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous.token;
    if (previous.secret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET; else process.env.TELEGRAM_WEBHOOK_SECRET = previous.secret;
    if (previous.endpoint === undefined) delete process.env.TELEGRAM_HOMEWORK_WEBHOOK_URL; else process.env.TELEGRAM_HOMEWORK_WEBHOOK_URL = previous.endpoint;
  }
});

test("does not relay group updates when homework integration is not configured", async () => {
  const previous = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    secret: process.env.TELEGRAM_WEBHOOK_SECRET,
    endpoint: process.env.TELEGRAM_HOMEWORK_WEBHOOK_URL,
  };
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
  delete process.env.TELEGRAM_HOMEWORK_WEBHOOK_URL;
  const oldFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; return { ok: true, status: 200 }; };
  try {
    const res = makeResponse();
    await webhook(makeRequest({ body: { message: { message_id: 3, chat: { id: -100123, type: "group" }, text: "Домашнее задание" } } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.forwarded, false);
    assert.equal(called, false);
  } finally {
    global.fetch = oldFetch;
    if (previous.token === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous.token;
    if (previous.secret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET; else process.env.TELEGRAM_WEBHOOK_SECRET = previous.secret;
    if (previous.endpoint === undefined) delete process.env.TELEGRAM_HOMEWORK_WEBHOOK_URL; else process.env.TELEGRAM_HOMEWORK_WEBHOOK_URL = previous.endpoint;
  }
});
