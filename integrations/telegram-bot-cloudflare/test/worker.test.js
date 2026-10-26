import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../src/worker.js";

const SITE = "https://medbiohim.vercel.app";
const baseEnv = { TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_WEBHOOK_SECRET: "test-secret" };

function request(path = "/api/webhook", { method = "POST", secret = "test-secret", body = {} } = {}) {
  return new Request(`https://worker.example${path}`, {
    method,
    headers: { ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}), "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
}

function privateUpdate(text, id = 42) {
  return { message: { text, from: { id }, chat: { id, type: "private" } } };
}

// Records every outbound fetch call and answers with a Telegram-shaped ok:true.
function stubFetch(t, handler) {
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const record = {
      url: String(url),
      method: (init && init.method) || "GET",
      headers: (init && init.headers) || {},
      payload: init && init.body ? JSON.parse(init.body) : null,
    };
    calls.push(record);
    const scripted = handler ? handler(record, calls) : null;
    return scripted || new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = oldFetch; });
  return calls;
}

function sendMessageCalls(calls) {
  return calls.filter((call) => /\/sendMessage$/.test(call.url));
}

function emittedUrls(call) {
  const keyboard = call.payload?.reply_markup?.inline_keyboard || [];
  return keyboard.flat().map((button) => button.url || button.web_app?.url).filter(Boolean);
}

function makeKv() {
  const store = new Map();
  return {
    store,
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value, options) { store.set(key, { value, options }); },
  };
}

test("health endpoint does not require a bot token", async () => {
  const response = await handleRequest(request("/health", { method: "GET" }), {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test("rejects wrong webhook secret", async () => {
  const response = await handleRequest(request("/api/webhook", {
    secret: "wrong",
    body: privateUpdate("/start"),
  }), baseEnv);
  assert.equal(response.status, 401);
});

test("rejects non-POST webhook requests", async () => {
  const response = await handleRequest(request("/api/webhook", { method: "GET" }), baseEnv);
  assert.equal(response.status, 405);
});

test("ignores non-command private messages without Telegram API call", async () => {
  const response = await handleRequest(request("/api/webhook", {
    body: privateUpdate("привет"),
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

test("shows onboarding buttons and registers Telegram command menu", async (t) => {
  const calls = stubFetch(t, (call) => {
    if (call.url.endsWith("/setMyCommands")) {
      const names = call.payload.commands.map((item) => item.command);
      for (const expected of ["start", "help", "menu", "app", "login", "register", "link", "status",
        "schedule", "homework", "subjects", "materials", "tests", "tickets", "university", "cards",
        "progress", "calculators", "latin", "extension", "privacy"]) {
        assert.ok(names.includes(expected), `setMyCommands is missing /${expected}`);
      }
      assert.ok(!names.includes("oldsite"), "/oldsite must stay a hidden alias");
      assert.ok(!names.includes("main"), "/main must stay a hidden alias");
      assert.ok(!names.includes("site"), "/site must stay a hidden alias");
    } else {
      assert.match(call.url, /bottest-token\/sendMessage$/);
    }
    return null;
  });
  const response = await handleRequest(request("/api/webhook", {
    body: { update_id: 10, ...privateUpdate("/start") },
  }), baseEnv);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  const sent = sendMessageCalls(calls);
  assert.equal(sent.length, 1);
  const urls = emittedUrls(sent[0]);
  assert.equal(urls.length, 1);
  assert.equal(urls[0], `${SITE}/`);
  assert.doesNotMatch(sent[0].payload.text, /версию сайта/i);
});

test("emits a single canonical https site for every public command", async (t) => {
  const commands = ["/start", "/help", "/menu", "/app", "/login", "/register", "/link", "/status",
    "/schedule", "/homework", "/subjects", "/materials", "/tests", "/tickets", "/university",
    "/cards", "/progress", "/calculators", "/latin", "/extension", "/privacy", "/site", "/oldsite", "/main"];
  const calls = stubFetch(t);
  let updateId = 100;
  for (const command of commands) {
    const response = await handleRequest(request("/api/webhook", {
      body: { update_id: (updateId += 1), ...privateUpdate(command) },
    }), baseEnv);
    assert.equal(response.status, 200, `${command} failed`);
  }
  const sent = sendMessageCalls(calls);
  assert.equal(sent.length, commands.length);
  for (const call of sent) {
    const urls = emittedUrls(call);
    assert.ok(urls.length > 0, "every command must expose at least one site button");
    for (const url of urls) {
      assert.ok(url.startsWith(`${SITE}/`) || url === `${SITE}/`, `unexpected host in ${url}`);
      assert.equal(new URL(url).protocol, "https:");
      assert.doesNotMatch(url, /git-main|192\.168\.|preview/i);
    }
  }
});

test("/menu returns a two-column inline keyboard with the real site sections", async (t) => {
  const calls = stubFetch(t);
  const response = await handleRequest(request("/api/webhook", {
    body: { update_id: 11, ...privateUpdate("/menu") },
  }), baseEnv);
  assert.equal(response.status, 200);
  const sent = sendMessageCalls(calls);
  assert.equal(sent.length, 1);
  const keyboard = sent[0].payload.reply_markup.inline_keyboard;
  assert.ok(Array.isArray(keyboard) && keyboard.length >= 2);
  for (const row of keyboard) assert.ok(row.length <= 2, "menu grid must be at most two columns");
  const urls = emittedUrls(sent[0]);
  for (const path of ["/schedule", "/homework", "/subjects", "/materials", "/tests", "/tickets",
    "/university", "/cards", "/progress", "/calculators", "/latin", "/extension", "/login",
    "/register", "/settings"]) {
    assert.ok(urls.includes(`${SITE}${path}`), `/menu is missing ${path}`);
  }
});

test("/status points to /settings and admits the bot cannot show link state", async (t) => {
  const calls = stubFetch(t);
  const response = await handleRequest(request("/api/webhook", {
    body: { update_id: 12, ...privateUpdate("/status") },
  }), baseEnv);
  assert.equal(response.status, 200);
  const sent = sendMessageCalls(calls);
  assert.equal(emittedUrls(sent[0])[0], `${SITE}/settings`);
  assert.match(sent[0].payload.text, /токен/i);
  assert.match(sent[0].payload.text, /Настройки/);
});

test("/university and /cards link to their own canonical paths", async (t) => {
  const calls = stubFetch(t);
  await handleRequest(request("/api/webhook", { body: { update_id: 13, ...privateUpdate("/university") } }), baseEnv);
  await handleRequest(request("/api/webhook", { body: { update_id: 14, ...privateUpdate("/cards") } }), baseEnv);
  const sent = sendMessageCalls(calls);
  assert.equal(emittedUrls(sent[0])[0], `${SITE}/university`);
  assert.equal(emittedUrls(sent[1])[0], `${SITE}/cards`);
});

test("/privacy describes the real one-time account link instead of denying it", async (t) => {
  const calls = stubFetch(t);
  await handleRequest(request("/api/webhook", { body: { update_id: 15, ...privateUpdate("/privacy") } }), baseEnv);
  const text = sendMessageCalls(calls)[0].payload.text;
  assert.match(text, /привязк/i);
  assert.match(text, /48/);
  assert.match(text, /username/i);
  assert.match(text, /first_name/i);
  assert.doesNotMatch(text, /не связывает|пока не реализован|не получает личные данные/i);
});

test("falls back to the canonical origin when the configured site URL is not https", async (t) => {
  const calls = stubFetch(t);
  await handleRequest(request("/api/webhook", { body: { update_id: 16, ...privateUpdate("/schedule") } }), {
    ...baseEnv,
    MEDBIOHIM_APP_URL: "http://192.168.1.10:3000",
  });
  assert.equal(emittedUrls(sendMessageCalls(calls)[0])[0], `${SITE}/schedule`);
});

test("sends /schedule reply with canonical site link", async (t) => {
  const calls = stubFetch(t, (call) => {
    assert.match(call.url, /bottest-token\/sendMessage$/);
    assert.equal(call.payload.chat_id, 42);
    return null;
  });
  const response = await handleRequest(request("/api/webhook", {
    body: { update_id: 1, ...privateUpdate("/schedule") },
  }), baseEnv);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.equal(emittedUrls(sendMessageCalls(calls)[0])[0], `${SITE}/schedule`);
});

test("forwards group update only to configured HTTPS relay", async (t) => {
  let forwarded = false;
  stubFetch(t, (call) => {
    forwarded = true;
    assert.equal(call.url, "https://api.example.test/api/v1/telegram/webhook");
    assert.equal(call.headers["x-telegram-bot-api-secret-token"], "test-secret");
    return new Response("{}", { status: 200 });
  });
  const response = await handleRequest(request("/api/webhook", {
    body: { update_id: 2, message: { text: "homework", chat: { id: -1001, type: "supergroup" } } },
  }), { ...baseEnv, TELEGRAM_HOMEWORK_WEBHOOK_URL: "https://api.example.test/api/v1/telegram/webhook" });
  assert.equal(response.status, 200);
  assert.equal(forwarded, true);
  assert.equal((await response.json()).forwarded, true);
});

test("relay and account link share the KV dedup path when bound", async (t) => {
  const calls = stubFetch(t, (call) => {
    if (call.url === "https://api.example.test/api/v1/telegram/webhook") return new Response("{}", { status: 200 });
    return null;
  });
  const kv = makeKv();
  const env = { ...baseEnv, TELEGRAM_HOMEWORK_WEBHOOK_URL: "https://api.example.test/api/v1/telegram/webhook", TELEGRAM_UPDATES: kv };
  const update = { update_id: 500, message: { text: "homework", chat: { id: -1001, type: "supergroup" } } };
  const first = await handleRequest(request("/api/webhook", { body: update }), env);
  const second = await handleRequest(request("/api/webhook", { body: update }), env);
  assert.equal((await first.json()).forwarded, true);
  assert.equal((await second.json()).duplicate, true);
  assert.equal(calls.length, 1);
});

test("confirms a one-time account link through the HTTPS PHP relay", async (t) => {
  const calls = stubFetch(t, (call) => {
    if (call.url === "https://api.example.test/api/v1/telegram/account-link/confirm") {
      assert.equal(call.payload.token, "a".repeat(48));
      assert.equal(call.payload.telegram_user_id, "42");
      assert.equal(call.payload.username, "student_test");
      assert.equal(call.headers["x-telegram-bot-api-secret-token"], "test-secret");
      return new Response(JSON.stringify({ ok: true, data: { linked: true } }), { status: 200 });
    }
    assert.match(call.url, /bottest-token\/sendMessage$/);
    assert.match(call.payload.text, /успешно привязан/i);
    return null;
  });
  const response = await handleRequest(request("/api/webhook", {
    body: { update_id: 9, message: {
      text: "/start link_" + "a".repeat(48),
      from: { id: 42, username: "student_test", first_name: "Student" },
      chat: { id: 42, type: "private" },
    } },
  }), { ...baseEnv, TELEGRAM_ACCOUNT_LINK_WEBHOOK_URL: "https://api.example.test/api/v1/telegram/account-link/confirm" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).accountLink, true);
  assert.equal(calls.length, 2);
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


test("ignores commands addressed to another bot username", async (t) => {
  let called = false;
  stubFetch(t, () => { called = true; return null; });
  const response = await handleRequest(request("/api/webhook", {
    body: privateUpdate("/start@some_other_bot", 8),
  }), { ...baseEnv, TELEGRAM_BOT_USERNAME: "medbiohim_bot" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ignored, true);
  assert.equal(called, false);
});

test("ignores an account-link command addressed to another bot username", async (t) => {
  let called = false;
  stubFetch(t, () => { called = true; return null; });
  const response = await handleRequest(request("/api/webhook", {
    body: { update_id: 91, message: {
      text: `/start@other_bot link_${"b".repeat(48)}`,
      from: { id: 42, username: "student_test" },
      chat: { id: 42, type: "private" },
    } },
  }), { ...baseEnv, TELEGRAM_BOT_USERNAME: "medbiohim_bot", TELEGRAM_ACCOUNT_LINK_WEBHOOK_URL: "https://api.example.test/confirm" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ignored, true);
  assert.equal(called, false);
});

test("rejects insecure HTTP homework relay URL without making a request", async (t) => {
  let called = false;
  stubFetch(t, () => { called = true; return new Response("{}", { status: 200 }); });
  const response = await handleRequest(request("/api/webhook", {
    body: { message: { text: "Задание на завтра", chat: { id: -42, type: "group", title: "МБХ-201" } } },
  }), { ...baseEnv, TELEGRAM_HOMEWORK_WEBHOOK_URL: "http://insecure.example/api/v1/telegram/webhook" });
  assert.equal(response.status, 502);
  assert.equal(called, false);
});

test("skips a repeated update_id when the optional KV binding is present", async (t) => {
  const calls = stubFetch(t);
  const kv = makeKv();
  const env = { ...baseEnv, TELEGRAM_UPDATES: kv };
  const update = { update_id: 777, ...privateUpdate("/schedule") };
  const first = await handleRequest(request("/api/webhook", { body: update }), env);
  const second = await handleRequest(request("/api/webhook", { body: update }), env);
  const firstBody = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstBody.ok, true);
  assert.equal(firstBody.duplicate, undefined);
  assert.equal((await second.json()).duplicate, true);
  assert.equal(sendMessageCalls(calls).length, 1);
  const stored = kv.store.get("telegram:update:777");
  assert.ok(stored, "update_id must be recorded in KV");
  assert.ok(stored.options.expirationTtl > 0, "dedup entry must expire");
});

test("processes repeated update_ids normally when no KV binding exists", async (t) => {
  const calls = stubFetch(t);
  const update = { update_id: 778, ...privateUpdate("/schedule") };
  await handleRequest(request("/api/webhook", { body: update }), baseEnv);
  const second = await handleRequest(request("/api/webhook", { body: update }), baseEnv);
  assert.equal((await second.json()).duplicate, undefined);
  assert.equal(sendMessageCalls(calls).length, 2);
});

test("works without KV even when deduplication is not configured at all", async (t) => {
  const calls = stubFetch(t);
  const response = await handleRequest(request("/api/webhook", {
    body: { update_id: 779, ...privateUpdate("/help") },
  }), baseEnv);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.equal(sendMessageCalls(calls).length, 1);
});
