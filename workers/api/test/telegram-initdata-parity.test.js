/**
 * PARITY: the two implementations of Telegram `initData` validation must agree.
 *
 * There are deliberately two copies of the algorithm:
 *   - `workers/api/src/lib/telegram-initdata.ts` — used when the API Worker holds
 *     its own `TELEGRAM_BOT_TOKEN`;
 *   - `integrations/telegram-bot-cloudflare/src/initdata.js` — used by the bot
 *     Worker, which owns the token, for the `/api/verify-initdata` endpoint.
 *
 * A missing fix in one of them would silently split behaviour (for example the
 * field-ordering bug found as T9-1). This suite signs nothing itself: it feeds
 * the same input to both and requires identical verdicts on every case.
 *
 * Run: node --test test/telegram-initdata-parity.test.js
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import * as api from "../src/lib/telegram-initdata.ts";
import * as bot from "../../../integrations/telegram-bot-cloudflare/src/initdata.js";

const NOW = 1_700_000_000;
const TOKEN = "7654321:PARITY-TOKEN";
const OTHER_TOKEN = "7654321:OTHER-TOKEN";
const USER = { id: 279058397, first_name: "Влад", username: "vdlav" };

function hashOf(fields, botToken = TOKEN) {
  const dataCheckString = Object.keys(fields)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

function sign(fields, botToken = TOKEN) {
  return { ...fields, hash: hashOf(fields, botToken) };
}

function encode(fields) {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

const base = (extra = {}, authDate = NOW - 10) => ({
  auth_date: String(authDate),
  query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
  user: JSON.stringify(USER),
  ...extra,
});

const CASES = [
  ["valid", { initData: encode(sign(base())), token: TOKEN }],
  ["valid with a key set whose names are prefix-related (a / a1)", { initData: encode(sign(base({ a: "1", a1: "2" }))), token: TOKEN }],
  ["valid with chat_type and chat_instance (underscore suffix)", { initData: encode(sign(base({ chat_type: "private", chat_instance: "-1" }))), token: TOKEN }],
  ["valid at the exact age boundary", { initData: encode(sign(base({}, NOW - 86400))), token: TOKEN }],
  ["valid with a plus in a value", { initData: encode(sign(base({ start_param: "a+b c" }))), token: TOKEN }],
  ["valid with a percent-encoded value", { initData: encode(sign(base({ start_param: "x%20y" }))), token: TOKEN }],
  ["tampered user", { initData: encode({ ...sign(base()), user: JSON.stringify({ ...USER, id: 1 }) }), token: TOKEN }],
  ["signed by another token", { initData: encode(sign(base(), OTHER_TOKEN)), token: TOKEN }],
  ["uppercase hash", { initData: encode({ ...sign(base()), hash: hashOf(base()).toUpperCase() }), token: TOKEN }],
  ["expired by one second", { initData: encode(sign(base({}, NOW - 86401))), token: TOKEN }],
  ["future beyond the skew allowance", { initData: encode(sign(base({}, NOW + 61))), token: TOKEN }],
  ["future inside the skew allowance", { initData: encode(sign(base({}, NOW + 60))), token: TOKEN }],
  ["duplicate key", { initData: `auth_date=${NOW - 10}&auth_date=${NOW - 10}&user=${encodeURIComponent(JSON.stringify(USER))}&hash=${hashOf(base())}`, token: TOKEN }],
  ["missing hash", { initData: encode(base()), token: TOKEN }],
  ["missing auth_date", { initData: `user=${encodeURIComponent(JSON.stringify(USER))}&hash=${hashOf({ user: JSON.stringify(USER) })}`, token: TOKEN }],
  ["missing user", { initData: encode(sign({ auth_date: String(NOW - 10), query_id: "x" })), token: TOKEN }],
  ["broken percent encoding", { initData: `user=%E0%A4%A&hash=${hashOf(base())}`, token: TOKEN }],
  ["empty and oversized input", { initData: "", token: TOKEN }],
  ["oversized", { initData: "x".repeat(16385), token: TOKEN }],
  ["no token at all", { initData: encode(sign(base())), token: "" }],
  ["user id as a numeric string", { initData: encode(sign(base({ user: JSON.stringify({ id: "279058397" }) }))), token: TOKEN }],
  ["user id zero", { initData: encode(sign(base({ user: JSON.stringify({ id: 0 }) }))), token: TOKEN }],
  ["user id negative", { initData: encode(sign(base({ user: JSON.stringify({ id: -5 }) }))), token: TOKEN }],
  ["user id fractional", { initData: encode(sign(base({ user: JSON.stringify({ id: 42.5 }) }))), token: TOKEN }],
  ["user is an array", { initData: encode(sign(base({ user: "[1,2]" }))), token: TOKEN }],
  ["user is broken JSON", { initData: encode(sign(base({ user: "{oops" }))), token: TOKEN }],
  ["auth_date is not numeric", { initData: encode(sign(base({ auth_date: "tomorrow" }))), token: TOKEN }],
];

test("both initData validators agree on every case", async (t) => {
  for (const [name, { initData, token }] of CASES) {
    await t.test(name, async () => {
      const fromApi = await api.validateTelegramInitData(initData, token, NOW);
      const fromBot = await bot.validateTelegramInitData(initData, token, NOW);
      assert.deepEqual(
        fromBot,
        fromApi,
        `${name}: implementations disagree — api=${JSON.stringify(fromApi)} bot=${JSON.stringify(fromBot)}`
      );
    });
  }
});

test("the parity matrix actually exercises both verdicts", async () => {
  const results = [];
  for (const [, { initData, token }] of CASES) {
    results.push(await api.validateTelegramInitData(initData, token, NOW));
  }
  const accepted = results.filter((result) => result.ok).length;
  const rejected = results.length - accepted;
  assert.ok(accepted >= 5, `expected several accepted cases, got ${accepted}`);
  assert.ok(rejected >= 10, `expected several rejected cases, got ${rejected}`);
});

test("the field-ordering case is really covered (T9-1 regression)", async () => {
  const initData = encode(sign(base({ a: "1", a1: "2" })));
  const fromApi = await api.validateTelegramInitData(initData, TOKEN, NOW);
  const fromBot = await bot.validateTelegramInitData(initData, TOKEN, NOW);
  assert.equal(fromApi.ok, true, "the API validator must accept a spec-signed prefix-digit key set");
  assert.equal(fromBot.ok, true, "the bot validator must accept it too");
});
