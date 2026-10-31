/**
 * PARITY: the two implementations of Telegram Login Widget validation must agree.
 *
 * There are deliberately two copies of the algorithm:
 *   - `workers/api/src/lib/telegram-widget.ts` — used when the API Worker holds
 *     its own `TELEGRAM_BOT_TOKEN`;
 *   - `integrations/telegram-bot-cloudflare/src/loginwidget.js` — used by the bot
 *     Worker, which owns the token, for the `/api/verify-widget` endpoint.
 *
 * This suite signs nothing itself: it feeds the same payload to both and
 * requires identical verdicts on every case. The widget signature differs from
 * initData on purpose: secret_key = SHA256(bot_token), fields are scalars.
 *
 * Run: node --test test/telegram-loginwidget-parity.test.js
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";

import * as api from "../src/lib/telegram-widget.ts";
import * as bot from "../../../integrations/telegram-bot-cloudflare/src/loginwidget.js";

const NOW = 1_700_000_000;
const TOKEN = "7654321:PARITY-TOKEN";
const OTHER_TOKEN = "7654321:OTHER-TOKEN";

function hashOf(fields, botToken = TOKEN) {
  const dataCheckString = Object.keys(fields)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

function sign(fields, botToken = TOKEN) {
  return { ...fields, hash: hashOf(fields, botToken) };
}

const base = (extra = {}, authDate = NOW - 10) => ({
  id: 279058397,
  first_name: "Влад",
  username: "vdlav",
  auth_date: authDate,
  ...extra,
});

const CASES = [
  ["valid", { payload: sign(base()), token: TOKEN }],
  ["valid with photo_url (url characters)", { payload: sign(base({ photo_url: "https://t.me/i/user.jpg?size=x" })), token: TOKEN }],
  ["valid with a numeric-string id", { payload: sign(base({ id: "279058397" })), token: TOKEN }],
  ["valid at the exact age boundary", { payload: sign(base({}, NOW - 86400)), token: TOKEN }],
  ["future inside the skew allowance", { payload: sign(base({}, NOW + 60)), token: TOKEN }],
  ["uppercase hash", { payload: { ...sign(base()), hash: hashOf(base()).toUpperCase() }, token: TOKEN }],
  ["tampered username", { payload: { ...sign(base()), username: "hijack" }, token: TOKEN }],
  ["signed by another token", { payload: sign(base(), OTHER_TOKEN), token: TOKEN }],
  ["expired by one second", { payload: sign(base({}, NOW - 86401)), token: TOKEN }],
  ["future beyond the skew allowance", { payload: sign(base({}, NOW + 61)), token: TOKEN }],
  ["missing hash", { payload: base(), token: TOKEN }],
  ["missing auth_date", { payload: { id: 279058397, first_name: "Влад", hash: hashOf({ id: 279058397, first_name: "Влад" }) }, token: TOKEN }],
  ["id zero", { payload: sign(base({ id: 0 })), token: TOKEN }],
  ["id negative", { payload: sign(base({ id: -5 })), token: TOKEN }],
  ["id fractional", { payload: sign(base({ id: 42.5 })), token: TOKEN }],
  ["a non-scalar value is rejected", { payload: { ...sign(base({ user: "forged" })), user: { id: 1 } }, token: TOKEN }],
  ["empty payload", { payload: {}, token: TOKEN }],
  ["payload is null", { payload: null, token: TOKEN }],
  ["payload is an array", { payload: ["id", "279058397"], token: TOKEN }],
  ["auth_date is not numeric", { payload: sign(base({ auth_date: "tomorrow" })), token: TOKEN }],
  ["no token at all", { payload: sign(base()), token: "" }],
];

test("both Login Widget validators agree on every case", async (t) => {
  for (const [name, { payload, token }] of CASES) {
    await t.test(name, async () => {
      const fromApi = await api.validateTelegramLoginWidget(payload, token, NOW);
      const fromBot = await bot.validateTelegramLoginWidget(payload, token, NOW);
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
  for (const [, { payload, token }] of CASES) {
    results.push(await api.validateTelegramLoginWidget(payload, token, NOW));
  }
  const accepted = results.filter((result) => result.ok).length;
  const rejected = results.length - accepted;
  assert.ok(accepted >= 4, `expected several accepted cases, got ${accepted}`);
  assert.ok(rejected >= 12, `expected several rejected cases, got ${rejected}`);
});

test("the widget signature really uses SHA256(bot_token), not HMAC(WebAppData, …)", async () => {
  // Cross-check: signing with the initData scheme must be REJECTED by both.
  const fields = base();
  const dataCheckString = Object.keys(fields)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const initDataSchemeHash = createHmac("sha256", createHmac("sha256", "WebAppData").update(TOKEN).digest())
    .update(dataCheckString)
    .digest("hex");
  const wrongPayload = { ...fields, hash: initDataSchemeHash };
  const fromApi = await api.validateTelegramLoginWidget(wrongPayload, TOKEN, NOW);
  const fromBot = await bot.validateTelegramLoginWidget(wrongPayload, TOKEN, NOW);
  assert.equal(fromApi.ok, false);
  assert.equal(fromBot.ok, false);
});
