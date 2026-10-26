import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  constantTimeEqual,
  validateTelegramInitData,
  TELEGRAM_INIT_DATA_MAX_LENGTH,
} from "../src/lib/telegram-initdata.ts";

const NOW = 1_700_000_000;
const TEST_BOT_TOKEN = "7654321:TEST-TOKEN-for-initdata-verification";
const VALID_USER = {
  id: 279058397,
  first_name: "Влад Петров",
  username: "vdlav",
  language_code: "ru",
  allows_write_to_pm: true,
};

/**
 * Signing is implemented here independently of the module under test so a
 * regression in either implementation cannot hide behind the other.
 */
function sign(fields, botToken = TEST_BOT_TOKEN) {
  const dataCheckString = Object.keys(fields)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

function baseFields(authDate = NOW - 10, user = VALID_USER) {
  return {
    auth_date: String(authDate),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify(user),
  };
}

/** Build initData exactly like Telegram: urlencoded query string + hash. */
function buildInitData(fields, { botToken = TEST_BOT_TOKEN, hash } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) params.set(key, value);
  params.set("hash", hash ?? sign(fields, botToken));
  return params.toString();
}

test("telegram initData: accepts a spec-correct signature and returns the identity", async () => {
  const initData = buildInitData(baseFields(NOW - 10));
  const result = await validateTelegramInitData(initData, TEST_BOT_TOKEN, NOW);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.auth_date, NOW - 10);
  assert.equal(result.user.id, 279058397);
  assert.equal(result.user.username, "vdlav");
  assert.equal(result.user.first_name, "Влад Петров");
  // The result must never echo the bot token.
  assert.ok(!JSON.stringify(result).includes(TEST_BOT_TOKEN));
});

test("telegram initData: accepts an uppercased hash and a string user id", async () => {
  const fields = baseFields(NOW - 1, { id: "279058397", username: "vdlav" });
  const hash = sign(fields).toUpperCase();
  const result = await validateTelegramInitData(buildInitData(fields, { hash }), TEST_BOT_TOKEN, NOW);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.user.id, 279058397);
  assert.equal(result.user.first_name, null);
});

test("telegram initData: a single flipped byte in the hash is rejected", async () => {
  const hash = sign(baseFields(NOW - 10));
  // Flip the last hex nibble; the hash stays 64 hex characters.
  const flipped = hash.slice(0, 63) + (hash[63] === "0" ? "1" : "0");
  assert.notEqual(flipped, hash);
  const result = await validateTelegramInitData(
    buildInitData(baseFields(NOW - 10), { hash: flipped }),
    TEST_BOT_TOKEN,
    NOW
  );
  assert.deepEqual(result, { ok: false, error: "invalid_hash" });
});

test("telegram initData: a tampered field keeps the old hash and is rejected", async () => {
  const original = baseFields(NOW - 10);
  const hash = sign(original);
  const tampered = { ...original, user: JSON.stringify({ ...VALID_USER, id: 279058398 }) };
  const result = await validateTelegramInitData(buildInitData(tampered, { hash }), TEST_BOT_TOKEN, NOW);
  assert.deepEqual(result, { ok: false, error: "invalid_hash" });
});

test("telegram initData: a signature made with another bot token is rejected", async () => {
  const initData = buildInitData(baseFields(NOW - 10), { botToken: "999:ATTACKER" });
  const result = await validateTelegramInitData(initData, TEST_BOT_TOKEN, NOW);
  assert.deepEqual(result, { ok: false, error: "invalid_hash" });
});

test("telegram initData: expired and future auth_date are rejected, boundaries hold", async () => {
  const expired = await validateTelegramInitData(buildInitData(baseFields(NOW - 86401)), TEST_BOT_TOKEN, NOW);
  assert.deepEqual(expired, { ok: false, error: "init_data_expired" });

  const boundaryPast = await validateTelegramInitData(buildInitData(baseFields(NOW - 86400)), TEST_BOT_TOKEN, NOW);
  assert.equal(boundaryPast.ok, true, JSON.stringify(boundaryPast));

  const future = await validateTelegramInitData(buildInitData(baseFields(NOW + 61)), TEST_BOT_TOKEN, NOW);
  assert.deepEqual(future, { ok: false, error: "auth_date_in_future" });

  const boundaryFuture = await validateTelegramInitData(buildInitData(baseFields(NOW + 60)), TEST_BOT_TOKEN, NOW);
  assert.equal(boundaryFuture.ok, true, JSON.stringify(boundaryFuture));
});

test("telegram initData: duplicate keys are rejected", async () => {
  const fields = baseFields(NOW - 10);
  const hash = sign(fields);
  const initData = `auth_date=${NOW - 10}&auth_date=${NOW - 10}&query_id=${encodeURIComponent(
    fields.query_id
  )}&user=${encodeURIComponent(fields.user)}&hash=${hash}`;
  const result = await validateTelegramInitData(initData, TEST_BOT_TOKEN, NOW);
  assert.deepEqual(result, { ok: false, error: "invalid_init_data" });
});

test("telegram initData: missing user, hash or auth_date are rejected", async () => {
  const withoutUser = { auth_date: String(NOW - 10), query_id: "AAHdF6IQAAAAAN0XohDhrOrc" };
  const noUser = await validateTelegramInitData(buildInitData(withoutUser), TEST_BOT_TOKEN, NOW);
  assert.deepEqual(noUser, { ok: false, error: "missing_user" });

  const fields = baseFields(NOW - 10);
  const noHash = new URLSearchParams(fields).toString();
  const missingHash = await validateTelegramInitData(noHash, TEST_BOT_TOKEN, NOW);
  assert.deepEqual(missingHash, { ok: false, error: "missing_required_fields" });

  const shortHash = await validateTelegramInitData(
    buildInitData(fields, { hash: "abcdef" }),
    TEST_BOT_TOKEN,
    NOW
  );
  assert.deepEqual(shortHash, { ok: false, error: "missing_required_fields" });

  const noAuthDate = await validateTelegramInitData(
    buildInitData({ query_id: fields.query_id, user: fields.user }),
    TEST_BOT_TOKEN,
    NOW
  );
  assert.deepEqual(noAuthDate, { ok: false, error: "missing_required_fields" });

  const junkAuthDate = await validateTelegramInitData(
    buildInitData({ auth_date: "17e9", user: fields.user }),
    TEST_BOT_TOKEN,
    NOW
  );
  assert.deepEqual(junkAuthDate, { ok: false, error: "missing_required_fields" });
});

test("telegram initData: invalid user ids are rejected", async () => {
  for (const id of [0, -5, 1.5, 2 ** 53, "123abc", "0", "", null, true, [279058397], { id: 1 }]) {
    const fields = baseFields(NOW - 10, { id, username: "vdlav" });
    const result = await validateTelegramInitData(buildInitData(fields), TEST_BOT_TOKEN, NOW);
    assert.deepEqual(result, { ok: false, error: "invalid_user" }, `id=${JSON.stringify(id)}`);
  }

  const notJson = await validateTelegramInitData(
    buildInitData({ auth_date: String(NOW - 10), user: "not-json" }),
    TEST_BOT_TOKEN,
    NOW
  );
  assert.deepEqual(notJson, { ok: false, error: "invalid_user" });

  // Present but empty/null user values are "invalid", not "missing" (PHP parity).
  const emptyUser = await validateTelegramInitData(
    buildInitData({ auth_date: String(NOW - 10), user: "" }),
    TEST_BOT_TOKEN,
    NOW
  );
  assert.deepEqual(emptyUser, { ok: false, error: "invalid_user" });

  const nullUser = await validateTelegramInitData(
    buildInitData({ auth_date: String(NOW - 10), user: "null" }),
    TEST_BOT_TOKEN,
    NOW
  );
  assert.deepEqual(nullUser, { ok: false, error: "invalid_user" });
});

test("telegram initData: empty, oversized and malformed input is rejected", async () => {
  const empty = await validateTelegramInitData("", TEST_BOT_TOKEN, NOW);
  assert.deepEqual(empty, { ok: false, error: "invalid_init_data" });

  const oversized = await validateTelegramInitData(
    `user=${"x".repeat(TELEGRAM_INIT_DATA_MAX_LENGTH)}`,
    TEST_BOT_TOKEN,
    NOW
  );
  assert.deepEqual(oversized, { ok: false, error: "invalid_init_data" });

  const malformed = await validateTelegramInitData(
    `user=%zz&hash=${sign({ user: "%zz" })}&auth_date=${NOW - 10}`,
    TEST_BOT_TOKEN,
    NOW
  );
  assert.deepEqual(malformed, { ok: false, error: "invalid_init_data" });

  const emptyKey = await validateTelegramInitData(
    `=value&auth_date=${NOW - 10}&hash=${sign({ auth_date: String(NOW - 10) })}`,
    TEST_BOT_TOKEN,
    NOW
  );
  assert.deepEqual(emptyKey, { ok: false, error: "invalid_init_data" });
});

test("telegram initData: a missing bot token short-circuits before parsing", async () => {
  const initData = buildInitData(baseFields(NOW - 10));
  for (const token of [undefined, null, "", "   "]) {
    const result = await validateTelegramInitData(initData, token, NOW);
    assert.deepEqual(result, { ok: false, error: "bot_not_configured" }, `token=${JSON.stringify(token)}`);
  }
});

test("telegram initData: hash comparison is constant-time", () => {
  assert.equal(constantTimeEqual("a".repeat(64), "a".repeat(64)), true);
  assert.equal(constantTimeEqual("a".repeat(64), "a".repeat(63) + "b"), false);
  assert.equal(constantTimeEqual("a".repeat(64), "a".repeat(63)), false);
  assert.equal(constantTimeEqual("", "a"), false);
});

test("telegram initData module stays dependency-free and log-free", async () => {
  const source = await readFile(new URL("../src/lib/telegram-initdata.ts", import.meta.url), "utf8");
  assert.ok(source.includes("WebAppData"));
  assert.ok(source.includes('"HMAC"'));
  assert.ok(source.includes('"SHA-256"'));
  assert.ok(source.includes("crypto") && source.includes("subtle"));
  assert.ok(source.includes("constantTimeEqual"));
  assert.ok(!/console\./.test(source), "validator must never log");
  assert.ok(!/^import /m.test(source), "validator must not import dependencies");
});

test("telegram webapp route uses the validator, the linked account and a server-issued session", async () => {
  const authSource = await readFile(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
  const indexSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");

  assert.ok(indexSource.includes('v1.route("/auth", auth)'));
  assert.ok(authSource.includes('auth.post("/telegram/webapp"'));
  assert.ok(authSource.includes('from "../lib/telegram-initdata"'));
  assert.ok(authSource.includes("validateTelegramInitData("));
  assert.ok(authSource.includes("createServiceClient"));
  assert.ok(authSource.includes('from("telegram_accounts")'));
  assert.ok(authSource.includes('.eq("telegram_user_id", String(verification.user.id))'));
  assert.ok(authSource.includes('generateLink({ type: "magiclink", email })'));
  assert.ok(authSource.includes('verifyOtp({ type: "magiclink", token_hash: tokenHash })'));
  assert.ok(authSource.includes("normalizeSession(otp.session)"));

  // Error contract.
  assert.ok(/TELEGRAM_NOT_CONFIGURED"[^)]*503/.test(authSource.replace(/\n/g, " ")));
  assert.ok(/INVALID_INIT_DATA"[^)]*401/.test(authSource.replace(/\n/g, " ")));
  assert.ok(authSource.includes("TELEGRAM_NOT_LINKED"));
  assert.ok(/TELEGRAM_NOT_LINKED[\s\S]{0,120}409/.test(authSource));
  assert.ok(authSource.includes("Привяжите аккаунт в Настройках → Telegram."));
  assert.ok(authSource.includes("TELEGRAM_NO_EMAIL"));
  assert.ok(authSource.includes("rateLimit(c.env, `auth:telegram-webapp:${ip}`, 20, 60)"));
  assert.ok(authSource.includes("createAnonClient(c.env)"));

  // The Mini App login must reuse the /login envelope for the shared client.
  const envelopes = authSource.match(/ok\(\{ \.\.\.session, session \}, rid\)/g) || [];
  assert.ok(envelopes.length >= 2, "telegram webapp must mirror the /login envelope");
  assert.ok(authSource.includes("function normalizeSession("));
  assert.ok(authSource.includes('auth.post("/login"'));
  assert.ok(authSource.includes('auth.post("/register"'));
  assert.ok(authSource.includes('auth.post("/refresh"'));;

  // No secret or personal data may reach the logs.
  const consoleCalls = authSource.match(/console\.[a-z]+\([\s\S]*?\);/g) || [];
  for (const call of consoleCalls) {
    for (const forbidden of ["init_data", "initData", "tokenHash", "hashed_token", "access_token", "refresh_token", "email", "hash"]) {
      assert.ok(!call.includes(forbidden), `log statement leaks ${forbidden}: ${call.slice(0, 120)}`);
    }
  }
  assert.ok(!authSource.includes("console.log("));
  assert.ok(!/console\.[a-z]+\([^)]*body\.init_data/.test(authSource));
});
