/**
 * task-9 — independent verification of the Telegram bot (task-6) and Mini App
 * login (task-7). Written by tg-verify, who did not write the implementation.
 *
 * Rules this file follows:
 *   - Signing is implemented HERE from the Telegram spec (node:crypto). The
 *     module under test is imported only to compare decisions, never to derive
 *     the expected signature.
 *   - Every expectation about the module's *internal* string building is
 *     re-derived independently (see implOrderDataCheckString) and then checked
 *     against the module's actual decisions.
 *   - Two tests are intentionally RED. They are defect reproductions, named
 *     "DEFECT T9-n", and are the minimal repro demanded by the task brief.
 *
 * Scope: this file writes nothing outside workers/api/test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

import {
  constantTimeEqual,
  validateTelegramInitData,
} from "../src/lib/telegram-initdata.ts";

// ---------------------------------------------------------------------------
// Module loading: auth.ts / index.ts use extensionless relative imports and a
// JSON import, which bare Node rejects. The hooks below are harness plumbing
// only; they never alter the implementation's text or behaviour.
// ---------------------------------------------------------------------------
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        /* fall through to the real resolver */
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      const source = readFileSync(fileURLToPath(url), "utf8");
      return { format: "module", source: `export default ${source};`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
test.after(() => hooks.deregister());

// ---------------------------------------------------------------------------
// Constants — all secrets here are obviously fake and local to this file.
// ---------------------------------------------------------------------------
const BOT_TOKEN = "123456:FAKE-VERIFY-TOKEN-not-a-real-secret";
const OTHER_TOKEN = "999999:FAKE-ATTACKER-TOKEN";
const NOW = 1_700_000_000;
const ANON_KEY = "fake-anon-key";
const SERVICE_KEY = "fake-service-role-key";
const LINKED_USER_ID = "11111111-1111-4111-8111-111111111111";
const LINKED_EMAIL = "linked.student@example.com";
const HAS_TOKEN_HASH = "fake-hashed-token-verify";
const ACCESS_TOKEN = "fake-access-token-verify";
const REFRESH_TOKEN = "fake-refresh-token-verify";
const SUPABASE_ORIGIN = "https://project.supabase.test";
const VALID_USER = { id: 279058397, username: "vdlav", first_name: "Влад", language_code: "ru" };

// ===========================================================================
// Independent signing (Telegram spec, exactly as documented)
//   secret_key        = HMAC_SHA256(key="WebAppData", message=bot_token)
//   data_check_string = fields except hash, SORTED BY KEY, "key=value" joined "\n"
//   hash              = HMAC_SHA256(key=secret_key, message=data_check_string)
// ===========================================================================
function keySortedFields(fields) {
  return Object.keys(fields)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => [key, String(fields[key])]);
}

function telegramDataCheckString(fields) {
  return keySortedFields(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function hmacHex(secretKey, message) {
  return createHmac("sha256", secretKey).update(message).digest("hex");
}

function telegramSecret(token = BOT_TOKEN) {
  return createHmac("sha256", "WebAppData").update(token).digest();
}

function telegramHash(fields, token = BOT_TOKEN) {
  return hmacHex(telegramSecret(token), telegramDataCheckString(fields));
}

/**
 * Re-derivation of the algorithm the module appears to implement
 * (telegram-initdata.ts:166-172): sort whole `key=value` strings.
 * Used only to predict/compare, never as an oracle for correctness.
 */
function implOrderDataCheckString(fields) {
  const parts = Object.keys(fields)
    .filter((key) => key !== "hash")
    .map((key) => `${key}=${String(fields[key])}`);
  parts.sort();
  return parts.join("\n");
}

function implOrderHash(fields, token = BOT_TOKEN) {
  return hmacHex(telegramSecret(token), implOrderDataCheckString(fields));
}

function buildInitData(fields, { token = BOT_TOKEN, hash, signer = telegramHash } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) params.set(key, String(value));
  params.set("hash", hash ?? signer(fields, token));
  return params.toString();
}

function baseFields(authDate = NOW - 10, user = VALID_USER) {
  return {
    auth_date: String(authDate),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify(user),
  };
}

/** Fields signed for "just now", because the route calls the validator without a clock. */
function liveFields(user = VALID_USER) {
  return baseFields(Math.floor(Date.now() / 1000) - 10, user);
}

async function validate(initData, { token = BOT_TOKEN, now = NOW } = {}) {
  return validateTelegramInitData(initData, token, now);
}

// ===========================================================================
// A — telegram-initdata.ts
// ===========================================================================

test("A1: the documented construction is the only one accepted (WebAppData -> token -> HMAC -> dcs)", async () => {
  const fields = baseFields();
  assert.equal((await validate(buildInitData(fields))).ok, true);

  const dcs = telegramDataCheckString(fields);
  const variants = {
    // secret = HMAC(key=token, message="WebAppData") — arguments swapped
    swappedSecret: hmacHex(createHmac("sha256", BOT_TOKEN).update("WebAppData").digest(), dcs),
    // secret = SHA256(token + "WebAppData") — the old, pre-2019 recipe
    legacySecret: hmacHex(
      createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest("hex"),
      "WebAppData"
    ),
    // hash = HMAC(key=token, message=dcs) — secret key step skipped
    tokenAsFinalKey: hmacHex(BOT_TOKEN, dcs),
    // hash = HMAC(key=secret, message=dcs + extra)
    extraMessage: hmacHex(telegramSecret(), `${dcs}\n`),
  };
  for (const [name, hash] of Object.entries(variants)) {
    const result = await validate(buildInitData(fields, { hash }));
    assert.deepEqual(result, { ok: false, error: "invalid_hash" }, `variant ${name} must be rejected`);
  }

  // The exact dcs the module must sign: key order, decoded values.
  assert.equal(
    dcs,
    `auth_date=${NOW - 10}\nquery_id=AAHdF6IQAAAAAN0XohDhrOrc\nuser=${JSON.stringify(VALID_USER)}`
  );
});

test("A2: hash formatting — case-insensitive hex only, never padded or truncated", async () => {
  const fields = baseFields();
  const hash = telegramHash(fields);
  assert.match(hash, /^[a-f0-9]{64}$/);

  assert.equal((await validate(buildInitData(fields, { hash: hash.toUpperCase() }))).ok, true);
  for (const bad of [
    hash.slice(0, 63),
    `${hash}0`,
    `${hash} `.trimEnd() + " ",
    hash.replace(hash[0], "g"),
    ` ${hash}`,
    hash.replace(hash.slice(0, 2), "%68%69"),
    "",
  ]) {
    const result = await validate(buildInitData(fields, { hash: bad }));
    assert.equal(result.ok, false, `hash ${JSON.stringify(bad)} must be rejected`);
    assert.ok(
      ["missing_required_fields", "invalid_init_data"].includes(result.error),
      `hash ${JSON.stringify(bad)} gave ${result.error}`
    );
  }
});

test("A3: values containing '=', raw '+' (space) and %2B are decoded like form data", async () => {
  // '=' inside a value: only the first '=' separates key and value.
  const eqFields = { auth_date: String(NOW - 1), query_id: "a=b=c", user: JSON.stringify(VALID_USER) };
  assert.equal((await validate(buildInitData(eqFields))).ok, true);

  // Raw '+' must decode to a space (application/x-www-form-urlencoded).
  const plusOverSpace = `auth_date=${NOW - 1}&query_id=a+b&user=${encodeURIComponent(JSON.stringify(VALID_USER))}&hash=${telegramHash({ auth_date: String(NOW - 1), query_id: "a b", user: JSON.stringify(VALID_USER) })}`;
  assert.equal((await validate(plusOverSpace)).ok, true, "'+' must be treated as a space");

  const plusOverPlus = `auth_date=${NOW - 1}&query_id=a+b&user=${encodeURIComponent(JSON.stringify(VALID_USER))}&hash=${telegramHash({ auth_date: String(NOW - 1), query_id: "a+b", user: JSON.stringify(VALID_USER) })}`;
  assert.deepEqual(await validate(plusOverPlus), { ok: false, error: "invalid_hash" });

  // A literal plus must travel as %2B and be signed as '+'.
  const encodedPlus = `auth_date=${NOW - 1}&query_id=a%2Bb&user=${encodeURIComponent(JSON.stringify(VALID_USER))}&hash=${telegramHash({ auth_date: String(NOW - 1), query_id: "a+b", user: JSON.stringify(VALID_USER) })}`;
  assert.equal((await validate(encodedPlus)).ok, true);

  // Broken percent-encoding is refused before the signature is even computed.
  const broken = `auth_date=${NOW - 1}&query_id=%zz&user=${encodeURIComponent(JSON.stringify(VALID_USER))}&hash=${"a".repeat(64)}`;
  assert.deepEqual(await validate(broken), { ok: false, error: "invalid_init_data" });
});

test("A4: duplicate keys, empty keys and 'hash' variants are refused", async () => {
  const fields = baseFields();
  const good = `auth_date=${NOW - 1}&query_id=${fields.query_id}&user=${encodeURIComponent(fields.user)}&hash=${telegramHash({ ...fields, auth_date: String(NOW - 1) })}`;

  const duplicates = [
    good.replace("auth_date=", "auth_date=1&auth_date="),
    `${good}&hash=${telegramHash(fields)}`,
    `${good}&user=${encodeURIComponent(fields.user)}`,
  ];
  for (const initData of duplicates) {
    assert.deepEqual(await validate(initData), { ok: false, error: "invalid_init_data" }, initData.slice(0, 80));
  }

  const emptyKey = `=value&${good}`;
  assert.deepEqual(await validate(emptyKey), { ok: false, error: "invalid_init_data" });

  // A valueless part is a key with an empty value: it is part of the signed set.
  const valueless = `noValue&auth_date=${NOW - 1}&user=${encodeURIComponent(JSON.stringify(VALID_USER))}&hash=${telegramHash({ noValue: "", auth_date: String(NOW - 1), user: JSON.stringify(VALID_USER) })}`;
  const accepted = await validate(valueless);
  assert.equal(accepted.ok, true, "a valueless key must be signed as `key=` and then accepted");
  const ignored = `noValue&auth_date=${NOW - 1}&user=${encodeURIComponent(JSON.stringify(VALID_USER))}&hash=${telegramHash({ auth_date: String(NOW - 1), user: JSON.stringify(VALID_USER) })}`;
  assert.deepEqual(await validate(ignored), { ok: false, error: "invalid_hash" });

  // Trailing/leading separators are empty parts and are skipped.
  assert.equal((await validate(`&${good}&`)).ok, true);
});

// --- the sorting question the Lead asked to settle -------------------------

test("A5a: the module's sort order really differs from the Telegram spec for prefix+digit keys", async (t) => {
  const fields = {
    a: "1",
    a1: "2",
    auth_date: String(NOW),
    user: JSON.stringify(VALID_USER),
  };
  const spec = telegramDataCheckString(fields);
  const impl = implOrderDataCheckString(fields);
  assert.notEqual(spec, impl, "the two orderings must differ for this key set (precondition of the defect)");
  assert.ok(spec.startsWith("a=1\na1=2"), `spec order unexpected: ${JSON.stringify(spec)}`);
  assert.ok(impl.startsWith("a1=2\na=1"), `impl order unexpected: ${JSON.stringify(impl)}`);
  t.diagnostic(`A5a spec dcs  = ${JSON.stringify(spec)}`);
  t.diagnostic(`A5a impl dcs  = ${JSON.stringify(impl)}`);

  // Near-miss check with real Telegram field names: 'chat' is a prefix of
  // 'chat_instance', but '_' (0x5F) > '=' (0x3D), so both orders agree.
  const real = {
    auth_date: String(NOW),
    chat: JSON.stringify({ id: -1001, type: "group", title: "МБХ-201" }),
    chat_instance: "-1234567890",
    chat_type: "supergroup",
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify(VALID_USER),
  };
  assert.equal(
    telegramDataCheckString(real),
    implOrderDataCheckString(real),
    "documented Telegram field names must not trigger the ordering divergence"
  );
});

test("DEFECT T9-1: a spec-correct signature is rejected when a key is a prefix of another followed by a digit", async () => {
  const fields = {
    a: "1",
    a1: "2",
    auth_date: String(NOW - 10),
    user: JSON.stringify(VALID_USER),
  };
  const initData = buildInitData(fields); // signed the way Telegram signs
  const result = await validate(initData);
  assert.deepEqual(
    result,
    { ok: true, auth_date: NOW - 10, user: { id: VALID_USER.id, username: "vdlav", first_name: "Влад" } },
    [
      "DEFECT T9-1 at src/lib/telegram-initdata.ts:171 (`checkParts.sort()` sorts whole `key=value`",
      "strings, the spec sorts by key). Telegram signs `a=1\\na1=2\\n...`; the module compares against",
      "`a1=2\\na=1\\n...`, so a valid Mini App login is refused.",
      `minimal repro: validateTelegramInitData(initDataWithKeys({a,a1,auth_date,user}) signed by the spec, "${BOT_TOKEN.slice(0, 6)}...") -> ${JSON.stringify(result)}`,
    ].join(" ")
  );
});

test("A5b: with the sort fixed the spec order verifies in any query order and forgeries still fail", async () => {
  const fields = {
    a: "1",
    a1: "2",
    auth_date: String(NOW - 10),
    user: JSON.stringify(VALID_USER),
  };

  // 1. This test originally characterised the T9-1 defect: it asserted that a
  //    signature over the module's own (buggy) `key=value` ordering was
  //    accepted. The Lead fixed the ordering (spec sorts by key), so the
  //    invariant is inverted: the spec order verifies and the old buggy
  //    ordering no longer does.
  assert.deepEqual(
    await validate(buildInitData(fields)),
    { ok: true, auth_date: NOW - 10, user: { id: VALID_USER.id, username: "vdlav", first_name: "Влад" } },
    "the spec-signed payload must be accepted"
  );
  assert.deepEqual(
    await validate(buildInitData(fields, { signer: implOrderHash })),
    { ok: false, error: "invalid_hash" },
    "the pre-fix `key=value` ordering must no longer verify"
  );

  // 2. Only the field set is signed — the query-string order is irrelevant.
  const specHash = telegramHash(fields);
  const permutations = [
    `a=1&a1=2&auth_date=${NOW - 10}&user=${encodeURIComponent(fields.user)}&hash=${specHash}`,
    `a1=2&a=1&auth_date=${NOW - 10}&user=${encodeURIComponent(fields.user)}&hash=${specHash}`,
    `user=${encodeURIComponent(fields.user)}&hash=${specHash}&a1=2&auth_date=${NOW - 10}&a=1`,
  ];
  for (const initData of permutations) {
    assert.equal((await validate(initData)).ok, true, initData.slice(0, 60));
  }

  // 3. Tampering with the identity still fails, now against a spec-signed payload.
  const specSigned = buildInitData(fields);
  const tampered = specSigned.replace(encodeURIComponent(fields.user), encodeURIComponent(JSON.stringify({ ...VALID_USER, id: 279058398 })));
  assert.deepEqual(await validate(tampered), { ok: false, error: "invalid_hash" });

  // 4. Signing with an attacker's own token still gains nothing.
  assert.deepEqual(
    await validate(buildInitData(fields, { token: OTHER_TOKEN })),
    { ok: false, error: "invalid_hash" },
    "a signature from a different bot token must never be accepted"
  );
});

test("A5c: bounded search for an identity-swapping collision in the string builder", async (t) => {
  // Two distinct field sets with the same data_check_string would let one
  // signature be replayed for another identity. Enumerate a small space and
  // check whether any collision also survives validation.
  const attackerIds = [279058398, 279058399];
  const extraKeys = ["a", "a1", "x"];
  const plainValues = ["", "1", "2", "x"];
  const newlineValues = ["\n", "\nuser={\"id\":2}", "x\nuser={\"id\":2}"];

  const legitSets = [];
  for (const id of [279058397]) {
    for (const extraKey of [...extraKeys, null]) {
      for (const value of plainValues) {
        const set = { auth_date: String(NOW - 10), user: JSON.stringify({ id, username: "vdlav" }) };
        if (extraKey) set[extraKey] = value;
        legitSets.push(set);
      }
    }
  }
  const forgedSets = [];
  for (const id of attackerIds) {
    for (const extraKey of [...extraKeys, null]) {
      for (const value of [...plainValues, ...newlineValues]) {
        const set = { auth_date: String(NOW - 10), user: JSON.stringify({ id }) };
        if (extraKey) set[extraKey] = value;
        forgedSets.push(set);
      }
    }
  }

  const legitByString = new Map();
  for (const set of legitSets) {
    const key = telegramDataCheckString(set); // what Telegram would have signed
    if (!legitByString.has(key)) legitByString.set(key, set);
  }

  const collisions = [];
  const accepted = [];
  for (const forged of forgedSets) {
    const implString = implOrderDataCheckString(forged);
    if (!legitByString.has(implString)) continue;
    collisions.push({ legit: legitByString.get(implString), forged });
    const hash = telegramHash(legitByString.get(implString));
    const result = await validate(buildInitData(forged, { hash }));
    if (result.ok) accepted.push({ forged: forged.user, result });
  }

  assert.equal(
    accepted.length,
    0,
    `forged identifiers accepted without knowing the token: ${JSON.stringify(accepted)}`
  );
  // Diagnostic (informational only): how many builder collisions exist in this space.
  t.diagnostic(
    `A5c measured: legit=${legitByString.size} forged=${forgedSets.length} collisions=${collisions.length} accepted=${accepted.length}`
  );
  assert.ok(
    collisions.length === 0,
    `informational: ${collisions.length} builder collision(s) found in the enumerated space, none of them accepted`
  );
});

test("A5d: exhaustive builder-ambiguity search — a signed string is never accepted for another identity", async (t) => {
  // Worst case: the *signed* (legitimate) session itself carries a value with a
  // newline, which is the only way the join-on-newline builder can be ambiguous.
  const plainValues = ["", "1", "2", "x"];
  const newlineValues = ["\n", "\nuser={\"id\":2}", "user={\"id\":2}", "1\nuser={\"id\":2}", "\nuser={\"id\":3}"];
  const keys = ["a", "a1", "b", "aa"];

  const build = (id, value, extraKey, secondKey, secondValue) => {
    const set = { auth_date: String(NOW - 10), user: JSON.stringify({ id, username: "vdlav" }) };
    if (extraKey) set[extraKey] = value;
    if (secondKey) set[secondKey] = secondValue;
    return set;
  };

  const legitSets = [];
  for (const key of [null, ...keys]) {
    for (const value of [...plainValues, ...newlineValues]) {
      for (const secondKey of [null, ...keys]) {
        for (const secondValue of plainValues) {
          if (secondKey === key && secondValue === value) continue;
          legitSets.push(build(279058397, value, key, secondKey, secondValue));
        }
      }
    }
  }

  const legitByString = new Map();
  for (const set of legitSets) {
    const key = telegramDataCheckString(set);
    if (!legitByString.has(key)) legitByString.set(key, set);
  }

  let collisions = 0;
  const accepted = [];
  for (const forgedId of [279058398, 279058399]) {
    for (const key of [null, ...keys]) {
      for (const value of [...plainValues, ...newlineValues]) {
        const forged = build(forgedId, value, key, null, null);
        const implString = implOrderDataCheckString(forged);
        const legit = legitByString.get(implString);
        if (!legit) continue;
        collisions += 1;
        const hash = telegramHash(legit);
        const result = await validate(buildInitData(forged, { hash }));
        if (result.ok) accepted.push({ legit, forged, result });
      }
    }
  }

  assert.equal(
    accepted.length,
    0,
    [
      "the newline-join builder let a signed string stand for another Telegram identity:",
      JSON.stringify(accepted.slice(0, 2)),
    ].join(" ")
  );
  // Evidence for the report: how many string-builder collisions the search hit,
  // and how many of them passed validation.
  t.diagnostic(
    `A5d measured: legitSets=${legitByString.size} collisions=${collisions} accepted=${accepted.length}`
  );
  assert.equal(accepted.length, 0, "every collision stayed fail-closed");
});

// --- auth_date boundaries --------------------------------------------------

test("A6: auth_date boundaries and malformed auth_date values", async () => {
  const cases = [
    [NOW - 86400, true, "exactly 24h old is still valid"],
    [NOW - 86401, "init_data_expired"],
    [NOW + 60, true, "60s of clock skew allowed"],
    [NOW + 61, "auth_date_in_future"],
    [0, "init_data_expired"],
    [-1, "missing_required_fields"],
    [1.5, "missing_required_fields"],
    ["1e9", "missing_required_fields"],
    [" 1700000000", "missing_required_fields"],
    ["1700000000 ", "missing_required_fields"],
    ["", "missing_required_fields"],
    ["99999999999999999999", "invalid_init_data"],
  ];
  for (const [authDate, expected] of cases) {
    const fields = { auth_date: String(authDate), user: JSON.stringify(VALID_USER) };
    const result = await validate(buildInitData(fields));
    if (expected === true) {
      assert.equal(result.ok, true, `auth_date=${JSON.stringify(authDate)} -> ${JSON.stringify(result)}`);
      assert.equal(result.auth_date, Number(authDate));
    } else {
      assert.equal(result.ok, false, `auth_date=${JSON.stringify(authDate)} must be rejected`);
    }
  }

  // 'auth_date' is checked before the signature: a forger must not learn which
  // check failed (the route collapses all of these to one 401 — see B5).
  const expiredWrongHash = await validate(
    `auth_date=${NOW - 99999}&user=${encodeURIComponent(JSON.stringify(VALID_USER))}&hash=${"a".repeat(64)}`
  );
  assert.deepEqual(expiredWrongHash, { ok: false, error: "init_data_expired" });
});

// --- user payload ----------------------------------------------------------

test("A7: the `user` payload is strictly validated", async () => {
  const hashFor = (user) => telegramHash({ auth_date: String(NOW - 1), user });
  const check = async (user) => validate(buildInitData({ auth_date: String(NOW - 1), user }, { hash: hashFor(user) }));

  for (const user of [
    undefined, // covered separately below
    "not-json",
    "null",
    "",
    "[]",
    "[{\"id\":1}]",
    "\"279058397\"",
    "{}",
    "{\"id\":0}",
    "{\"id\":-5}",
    "{\"id\":1.5}",
    "{\"id\":9007199254740993}",
    "{\"id\":\"0\"}",
    "{\"id\":\"123abc\"}",
    "{\"id\":\"\"}",
    "{\"id\":\" 1\"}",
    "{\"id\":null}",
    "{\"id\":true}",
    "{\"id\":[279058397]}",
    "{\"id\":{\"id\":1}}",
  ]) {
    if (user === undefined) continue;
    const result = await check(user);
    assert.equal(result.ok, false, `user=${user} must be rejected`);
    assert.equal(result.error, "invalid_user", `user=${user} gave ${result.error}`);
  }

  // Absent vs present-but-empty are different errors.
  const withoutUser = { auth_date: String(NOW - 1), query_id: "q" };
  assert.deepEqual(
    await validate(buildInitData(withoutUser, { hash: telegramHash(withoutUser) })),
    { ok: false, error: "missing_user" }
  );

  // Accepted forms: numeric id and decimal string id.
  for (const id of [279058397, "279058397", 1]) {
    const result = await check(JSON.stringify({ id }));
    assert.equal(result.ok, true, `id=${JSON.stringify(id)} -> ${JSON.stringify(result)}`);
    assert.equal(result.user.id, Number(id));
  }

  // Optional strings: non-strings and blank strings become null; long values are capped.
  const strings = await check(
    JSON.stringify({ id: 1, username: 12345, first_name: { a: 1 }, last_name: "ignored" })
  );
  assert.equal(strings.ok, true);
  assert.equal(strings.user.username, null);
  assert.equal(strings.user.first_name, null);

  const blank = await check(JSON.stringify({ id: 1, username: "   ", first_name: "\t\n" }));
  assert.equal(blank.user.username, null);
  assert.equal(blank.user.first_name, null);

  const long = await check(JSON.stringify({ id: 1, username: "u".repeat(1000), first_name: "f".repeat(1000) }));
  assert.equal(long.user.username.length, 64);
  assert.equal(long.user.first_name.length, 128);

  const padded = await check(JSON.stringify({ id: 1, username: "  vdlav  " }));
  assert.equal(padded.user.username, "vdlav");

  // Lenient-but-safe: exponential JSON numbers are finite safe positive integers.
  assert.equal((await check("{\"id\":1e9}")).user.id, 1000000000);
});

test("A8: init_data envelope limits, missing token and constant-time compare", async () => {
  for (const token of [undefined, null, "", "   "]) {
    assert.deepEqual(await validateTelegramInitData("x", token, NOW), { ok: false, error: "bot_not_configured" });
    assert.deepEqual(await validateTelegramInitData("", token, NOW), { ok: false, error: "bot_not_configured" });
  }

  assert.deepEqual(await validate(""), { ok: false, error: "invalid_init_data" });
  assert.deepEqual(await validate("x".repeat(16385)), { ok: false, error: "invalid_init_data" });
  assert.deepEqual(await validate(undefined), { ok: false, error: "invalid_init_data" });

  assert.equal(constantTimeEqual("a".repeat(64), "a".repeat(64)), true);
  assert.equal(constantTimeEqual(`${"a".repeat(63)}b`, `${"a".repeat(63)}c`), false);
  assert.equal(constantTimeEqual("a".repeat(63), "a".repeat(64)), false);

  const source = readFileSync(new URL("../src/lib/telegram-initdata.ts", import.meta.url), "utf8");
  assert.ok(!/console\./.test(source), "the validator must never log");
  assert.ok(!/^import /m.test(source), "the validator must stay dependency-free");
  assert.ok(
    source.includes("authDate > now + TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS") &&
      source.includes("authDate < now - TELEGRAM_INIT_DATA_MAX_AGE_SECONDS"),
    "expiry boundaries must stay inclusive (line 159/162)"
  );
});

// ===========================================================================
// B — POST /api/v1/auth/telegram/webapp on the real composed app
// ===========================================================================

let appPromise;
function realApp() {
  appPromise ??= import("../src/index.ts").then((module) => module.default);
  return appPromise;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sessionFixture() {
  return {
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    expires_in: 3600,
    expires_at: NOW + 3600,
    token_type: "bearer",
    user: { id: LINKED_USER_ID, email: LINKED_EMAIL, app_metadata: { role: "student" } },
  };
}

/**
 * Records every outbound HTTP call and answers the Supabase endpoints the
 * route uses. Any request that is not explicitly scripted is marked
 * `unmatched` so a test can fail on unexpected network access.
 */
function supabaseStub(options = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = String(init.method || "GET").toUpperCase();
    const body = init.body ? String(init.body) : "";
    const record = { url, method, body, matched: true };
    calls.push(record);

    if (url.includes("/rest/v1/telegram_accounts")) {
      if (options.accountLookupError) return jsonResponse({ message: "db down", code: "57P01" }, 500);
      return jsonResponse(options.linkedUserId ? [{ user_id: options.linkedUserId }] : []);
    }
    if (url.includes("/auth/v1/admin/users/")) {
      if (options.adminUserMissing) return jsonResponse({ message: "User not found" }, 404);
      if (options.adminUserNoEmail) {
        return jsonResponse({ id: LINKED_USER_ID, email: null, app_metadata: { role: "student" } });
      }
      return jsonResponse({ id: LINKED_USER_ID, email: LINKED_EMAIL, app_metadata: { role: "student" } });
    }
    if (url.includes("/auth/v1/admin/generate_link")) {
      if (options.generateLinkError) return jsonResponse({ message: "generate failed" }, 500);
      // GoTrue answers flat; supabase-js exposes that body as `data.properties`.
      return jsonResponse({
        action_link: "https://project.supabase.test/auth/v1/verify?token=fake",
        email_otp: "123456",
        hashed_token: HAS_TOKEN_HASH,
        redirect_to: "https://medbiohim.vercel.app/auth/callback",
        verification_type: "magiclink",
        user: { id: LINKED_USER_ID, email: LINKED_EMAIL, app_metadata: { role: "student" } },
      });
    }
    if (url.includes("/auth/v1/verify")) {
      if (options.verifyOtpError) return jsonResponse({ message: "token expired" }, 403);
      return jsonResponse(options.session ?? sessionFixture());
    }
    if (url.includes("/auth/v1/token")) {
      if (options.passwordError) return jsonResponse({ error: "invalid_grant", error_description: "bad" }, 400);
      return jsonResponse(options.passwordSession ?? sessionFixture());
    }
    if (url.includes("/upstash.example")) {
      const count = options.redisCount ?? 1;
      // @upstash/redis auto-pipelines commands as an array of arrays.
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = null;
      }
      if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
        return jsonResponse(parsed.map(() => ({ result: count })));
      }
      return jsonResponse({ result: count });
    }
    record.matched = false;
    return jsonResponse({ message: `unmatched request: ${method} ${url}` }, 404);
  };
  return { calls, fetchImpl };
}

function env(overrides = {}) {
  return {
    SUPABASE_URL: SUPABASE_ORIGIN,
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    ...overrides,
  };
}

async function postRoute(path, { body, bindings = env(), fetchImpl, headers = {} } = {}) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const app = await realApp();
    const response = await app.request(
      `https://api.example.test${path}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      },
      bindings
    );
    return { status: response.status, body: await response.json(), response };
  } finally {
    globalThis.fetch = previousFetch;
  }
}

function captureConsole() {
  const lines = [];
  const original = {};
  for (const method of ["log", "info", "warn", "error", "debug"]) {
    original[method] = console[method];
    console[method] = (...args) => {
      lines.push(
        args
          .map((arg) => {
            if (typeof arg === "string") return arg;
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          })
          .join(" ")
      );
    };
  }
  return {
    lines,
    restore() {
      for (const method of Object.keys(original)) console[method] = original[method];
    },
  };
}

const WEBAPP = "/api/v1/auth/telegram/webapp";

test("B1: 503 without a configured bot token, before any parsing or network", async () => {
  for (const token of [undefined, "", "   "]) {
    const stub = supabaseStub();
    const result = await postRoute(WEBAPP, {
      body: { init_data: buildInitData(baseFields()) },
      bindings: env({ TELEGRAM_BOT_TOKEN: token }),
      fetchImpl: stub.fetchImpl,
    });
    assert.equal(result.status, 503, `token=${JSON.stringify(token)}`);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.error.code, "TELEGRAM_NOT_CONFIGURED");
    assert.equal(stub.calls.length, 0, "no upstream call may happen without a token");
  }
});

test("B2: 400 when init_data is absent, empty or not a string (body read first)", async () => {
  const cases = [
    {},
    { init_data: "" },
    { init_data: null },
    { init_data: 123 },
    { init_data: { nested: true } },
    { init_data: ["x"] },
    { other: "x" },
  ];
  for (const body of cases) {
    const result = await postRoute(WEBAPP, { body, fetchImpl: supabaseStub().fetchImpl });
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(result.body.error.code, "VALIDATION");
  }

  const invalidJson = await postRoute(WEBAPP, { body: "{not json", fetchImpl: supabaseStub().fetchImpl });
  assert.equal(invalidJson.status, 400);

  // The 16 KiB body cap fires before the validator's own 16384-char cap.
  const huge = await postRoute(WEBAPP, {
    body: JSON.stringify({ init_data: "x".repeat(17000) }),
    fetchImpl: supabaseStub().fetchImpl,
  });
  assert.equal(huge.status, 400);
  assert.equal(huge.body.error.code, "VALIDATION");

  // Just under the body cap the request reaches the validator and gets 401.
  const big = await postRoute(WEBAPP, {
    body: JSON.stringify({ init_data: "x".repeat(16000) }),
    fetchImpl: supabaseStub().fetchImpl,
  });
  assert.equal(big.status, 401);
});

test("B3: every verification failure collapses into one indistinguishable 401", async () => {
  const user = JSON.stringify(VALID_USER);
  const q = (value) => encodeURIComponent(value);
  const liveNow = Math.floor(Date.now() / 1000);
  const badInputs = [
    "garbage",
    `auth_date=${liveNow - 10}&user=${q(user)}&hash=${"a".repeat(64)}`,
    buildInitData(liveFields(), { token: OTHER_TOKEN }),
    buildInitData(baseFields(liveNow - 86401)),
    buildInitData(baseFields(liveNow + 61)),
    buildInitData({ query_id: "q", user }),
    buildInitData({ auth_date: String(liveNow - 10), user: "not-json" }),
    buildInitData({ auth_date: String(liveNow - 10), user: "{\"id\":0}" }),
    buildInitData({ auth_date: String(liveNow - 10), user: "[]" }),
    `auth_date=${liveNow - 10}&auth_date=${liveNow - 10}&user=${q(user)}&hash=${"a".repeat(64)}`,
    "auth_date=1e9&user={}&hash=deadbeef",
    `=v&auth_date=${liveNow - 10}&hash=${"a".repeat(64)}`,
    "x".repeat(16000),
    `${buildInitData(liveFields())}&extra=${q("\nuser={\"id\":1}")}`,
  ];

  const seen = [];
  for (const initData of badInputs) {
    const stub = supabaseStub({ linkedUserId: LINKED_USER_ID });
    const result = await postRoute(WEBAPP, { body: { init_data: initData }, fetchImpl: stub.fetchImpl });
    assert.equal(result.status, 401, `input ${initData.slice(0, 60)} -> ${result.status}`);
    assert.equal(result.body.ok, false);
    assert.deepEqual(Object.keys(result.body.error).sort(), ["code", "message"], "no details on errors");
    assert.equal(result.body.error.code, "INVALID_INIT_DATA");
    assert.equal(result.body.error.message, "Не удалось подтвердить данные Telegram");
    assert.deepEqual(Object.keys(result.body).sort(), ["error", "ok", "requestId"]);
    assert.match(result.body.requestId, /^[0-9a-f]{16}$/);
    assert.equal(stub.calls.length, 0, "a rejected signature must not touch Supabase");
    seen.push({ ...result.body, requestId: "<rid>" });
  }
  for (const body of seen.slice(1)) {
    assert.deepEqual(body, seen[0], "every rejection must be byte-identical apart from the request id");
  }
});

test("B4: 503 when the service client is not configured, only after the signature check", async () => {
  const bindings = env({ SUPABASE_SERVICE_ROLE_KEY: undefined });
  const stub = supabaseStub({ linkedUserId: LINKED_USER_ID });

  const valid = await postRoute(WEBAPP, {
    body: { init_data: buildInitData(liveFields()) },
    bindings,
    fetchImpl: stub.fetchImpl,
  });
  assert.equal(valid.status, 503);
  assert.equal(valid.body.error.code, "TELEGRAM_LOGIN_UNAVAILABLE");
  assert.equal(stub.calls.length, 0);

  const invalid = await postRoute(WEBAPP, {
    body: { init_data: "garbage" },
    bindings,
    fetchImpl: stub.fetchImpl,
  });
  assert.equal(invalid.status, 401, "the signature check must run before the service-client check");
});

test("B5: 409 when the Telegram account is not linked, and the lookup is by telegram_user_id", async () => {
  const stub = supabaseStub({ linkedUserId: null });
  const result = await postRoute(WEBAPP, {
    body: { init_data: buildInitData(liveFields()) },
    fetchImpl: stub.fetchImpl,
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, "TELEGRAM_NOT_LINKED");
  assert.match(result.body.error.message, /Настройках/);

  assert.equal(stub.calls.length, 1);
  const [lookup] = stub.calls;
  assert.equal(lookup.method, "GET");
  assert.ok(lookup.url.includes("/rest/v1/telegram_accounts"), lookup.url);
  assert.ok(lookup.url.includes("select=user_id"), lookup.url);
  assert.ok(lookup.url.includes(`telegram_user_id=eq.${VALID_USER.id}`), lookup.url);
  assert.ok(!lookup.url.includes(BOT_TOKEN), "the bot token must never be sent upstream in a URL");
});

test("B6: success envelope is identical in shape to /login and is server-issued", async () => {
  const stub = supabaseStub({ linkedUserId: LINKED_USER_ID });
  const webapp = await postRoute(WEBAPP, {
    body: { init_data: buildInitData(liveFields()) },
    fetchImpl: stub.fetchImpl,
  });
  assert.equal(webapp.status, 200, JSON.stringify(webapp.body));
  assert.equal(webapp.body.ok, true);

  const login = await postRoute("/api/v1/auth/login", {
    body: { email: LINKED_EMAIL, password: "fake-password" },
    fetchImpl: supabaseStub().fetchImpl,
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));

  assert.deepEqual(
    Object.keys(webapp.body.data).sort(),
    Object.keys(login.body.data).sort(),
    "webapp and /login must expose the same top-level keys"
  );
  assert.deepEqual(Object.keys(webapp.body.data).sort(), [
    "access_token",
    "expires_at",
    "expires_in",
    "refresh_token",
    "session",
    "token_type",
    "user",
  ]);
  assert.deepEqual(
    Object.keys(webapp.body.data.session).sort(),
    ["access_token", "expires_at", "expires_in", "refresh_token", "token_type", "user"]
  );
  assert.deepEqual(webapp.body.data.session, {
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    expires_in: 3600,
    expires_at: NOW + 3600,
    token_type: "bearer",
    user: { id: LINKED_USER_ID, email: LINKED_EMAIL, role: "student" },
  });
  for (const key of ["access_token", "refresh_token", "expires_in", "expires_at", "token_type", "user"]) {
    assert.deepEqual(webapp.body.data[key], webapp.body.data.session[key], `data.${key} must mirror data.session`);
  }
  assert.deepEqual(webapp.body.data, login.body.data, "the two envelopes must carry the same normalised session");

  // The session comes from the magic-link exchange, not from initData.
  const verifyCall = stub.calls.find((call) => call.url.includes("/auth/v1/verify"));
  assert.ok(verifyCall, "the route must exchange a server-generated token");
  const verifyBody = JSON.parse(verifyCall.body);
  assert.equal(verifyBody.type, "magiclink");
  assert.equal(verifyBody.token_hash, HAS_TOKEN_HASH);
  assert.ok(
    !/init_data|telegram_user_id|access_token/.test(verifyCall.body),
    "no client-supplied identity may be forwarded to the token exchange"
  );
  const serialized = JSON.stringify(webapp.body);
  assert.ok(!serialized.includes(BOT_TOKEN));
  assert.ok(!serialized.includes(SERVICE_KEY));
  assert.ok(!serialized.includes(ANON_KEY));
  assert.ok(!serialized.includes(HAS_TOKEN_HASH));
});

test("B7: upstream failures stay generic and never leak the reason", async () => {
  const validInitData = buildInitData(liveFields());
  const scenarios = [
    ["account lookup error", supabaseStub({ accountLookupError: true }), 503, "TELEGRAM_LOGIN_UNAVAILABLE"],
    ["admin user missing", supabaseStub({ linkedUserId: LINKED_USER_ID, adminUserMissing: true }), 503, "AUTH_UPSTREAM"],
    ["profile without email", supabaseStub({ linkedUserId: LINKED_USER_ID, adminUserNoEmail: true }), 409, "TELEGRAM_NO_EMAIL"],
    ["generate link failed", supabaseStub({ linkedUserId: LINKED_USER_ID, generateLinkError: true }), 503, "AUTH_UPSTREAM"],
    ["verify otp failed", supabaseStub({ linkedUserId: LINKED_USER_ID, verifyOtpError: true }), 503, "AUTH_UPSTREAM"],
  ];
  for (const [name, stub, status, code] of scenarios) {
    const result = await postRoute(WEBAPP, { body: { init_data: validInitData }, fetchImpl: stub.fetchImpl });
    assert.equal(result.status, status, name);
    assert.equal(result.body.error.code, code, name);
    assert.equal(result.body.error.details, undefined, name);
    assert.ok(!/57P01|invalid_grant|not found|expired|generate failed/i.test(JSON.stringify(result.body)), name);
  }
});

test("B8: the route consults the rate limiter and answers 429 before any work", async () => {
  const stub = supabaseStub({ linkedUserId: LINKED_USER_ID, redisCount: 21 });
  const result = await postRoute(WEBAPP, {
    body: { init_data: buildInitData(liveFields()) },
    bindings: env({ UPSTASH_REDIS_REST_URL: "https://upstash.example", UPSTASH_REDIS_REST_TOKEN: "fake" }),
    fetchImpl: stub.fetchImpl,
  });
  assert.equal(result.status, 429);
  assert.equal(result.body.error.code, "RATE_LIMIT");
  assert.ok(!stub.calls.some((call) => call.url.includes("supabase")), "no Supabase call after a 429");

  const allowed = await postRoute(WEBAPP, {
    body: { init_data: "garbage" },
    bindings: env({ UPSTASH_REDIS_REST_URL: "https://upstash.example", UPSTASH_REDIS_REST_TOKEN: "fake" }),
    fetchImpl: supabaseStub({ redisCount: 3 }).fetchImpl,
  });
  assert.equal(allowed.status, 401);
});

test("B9: no log line contains init_data, hash, tokens, the email or the session", async () => {
  const validInitData = buildInitData(liveFields());
  const capture = captureConsole();
  try {
    const runs = [
      { body: { init_data: "garbage" }, stub: supabaseStub() },
      { body: { init_data: validInitData }, stub: supabaseStub({ linkedUserId: null }) },
      { body: { init_data: validInitData }, stub: supabaseStub({ linkedUserId: LINKED_USER_ID }) },
      { body: { init_data: validInitData }, stub: supabaseStub({ accountLookupError: true }) },
      { body: { init_data: validInitData }, stub: supabaseStub({ linkedUserId: LINKED_USER_ID, verifyOtpError: true }) },
      { body: { init_data: validInitData }, stub: supabaseStub({ linkedUserId: LINKED_USER_ID, adminUserNoEmail: true }) },
    ];
    for (const run of runs) {
      await postRoute(WEBAPP, { body: run.body, fetchImpl: run.stub.fetchImpl });
    }
  } finally {
    capture.restore();
  }

  const logText = capture.lines.join("\n");
  const forbidden = [
    validInitData,
    validInitData.slice(0, 40),
    BOT_TOKEN,
    SERVICE_KEY,
    ANON_KEY,
    LINKED_EMAIL,
    ACCESS_TOKEN,
    REFRESH_TOKEN,
    HAS_TOKEN_HASH,
    telegramHash(baseFields(NOW - 10)),
  ];
  for (const secret of forbidden) {
    assert.ok(!logText.includes(secret), `log leaked ${secret.slice(0, 24)}…`);
  }
  for (const line of capture.lines) {
    assert.ok(!/(user|auth_date|query_id)=/.test(line), `log printed a field set: ${line.slice(0, 120)}`);
  }
  // The route logs structure only: stage + code + requestId.
  for (const line of capture.lines.filter((entry) => entry.includes("[auth:telegram-webapp]"))) {
    const payload = JSON.parse(line.slice(line.indexOf("{")));
    assert.ok(
      Object.keys(payload).every((key) => ["code", "requestId", "stage"].includes(key)),
      `unexpected log payload: ${line}`
    );
    assert.ok(payload.stage && payload.requestId, `log payload must carry stage and requestId: ${line}`);
  }
});

test("B10: the route is reachable through the composed app and rejects other methods", async () => {
  const app = await realApp();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = supabaseStub().fetchImpl;
  try {
    const get = await app.request(`https://api.example.test${WEBAPP}`, { method: "GET" }, env());
    // GET is not routed to the POST handler; the composed app's v1.all("*")
    // fallback answers 501 ROUTE_NOT_IMPLEMENTED (observed, not assumed).
    assert.equal(get.status, 501);
    assert.equal((await get.json()).error.code, "ROUTE_NOT_IMPLEMENTED");

    const options = await app.request(`https://api.example.test${WEBAPP}`, { method: "OPTIONS" }, env());
    assert.equal(options.status, 204);
    assert.equal(options.headers.get("access-control-allow-origin"), "*");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

// ===========================================================================
// C — integrations/telegram-bot-cloudflare/src/worker.js
// ===========================================================================

const { handleRequest } = await import("../../../integrations/telegram-bot-cloudflare/src/worker.js");

const CANONICAL = "https://medbiohim.vercel.app";
const WEBHOOK_SECRET = "fake-webhook-secret-verify";
const BOT_SOURCE_URL = new URL("../../../integrations/telegram-bot-cloudflare/src/worker.js", import.meta.url);
const BOT_README_URL = new URL("../../../integrations/telegram-bot-cloudflare/README.md", import.meta.url);
const WRANGLER_URL = new URL("../../../integrations/telegram-bot-cloudflare/wrangler.toml", import.meta.url);

function botEnv(overrides = {}) {
  return {
    TELEGRAM_BOT_TOKEN: "123456:FAKE-BOT-TOKEN",
    TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    MEDBIOHIM_APP_URL: CANONICAL,
    ...overrides,
  };
}

function privateUpdate(text, id = 42) {
  return { message: { text, from: { id, username: "student_test", first_name: "Student" }, chat: { id, type: "private" } } };
}

function botRequest({ path = "/api/webhook", method = "POST", secret = WEBHOOK_SECRET, body } = {}) {
  return new Request(`https://bot.example${path}`, {
    method,
    headers: {
      ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}),
      "content-type": "application/json",
    },
    body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function runBot(update, bindings = botEnv()) {
  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: String(init.method || "GET").toUpperCase(),
      payload: init.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const response = await handleRequest(botRequest({ body: update }), bindings);
    return { status: response.status, body: await response.json(), calls };
  } finally {
    globalThis.fetch = previousFetch;
  }
}

function emittedUrls(call) {
  const keyboard = call.payload?.reply_markup?.inline_keyboard || [];
  return keyboard.flat().map((button) => button.url || button.web_app?.url).filter(Boolean);
}

const PUBLIC_COMMANDS = [
  "start", "help", "menu", "app", "login", "register", "link", "status",
  "schedule", "homework", "subjects", "materials", "tests", "tickets", "university",
  "cards", "progress", "calculators", "latin", "extension", "privacy",
];
const HIDDEN_ALIASES = ["site", "oldsite", "main"];

test("C1: the bot emits exactly one site version, and never a preview/private/plain-HTTP host", async () => {
  const source = readFileSync(BOT_SOURCE_URL, "utf8");
  const wrangler = readFileSync(WRANGLER_URL, "utf8");
  const readme = readFileSync(BOT_README_URL, "utf8");
  assert.ok(!/git-main/.test(source), "worker.js must not name a branch preview host");
  assert.ok(!/192\.168\./.test(source), "worker.js must not name a private host");
  assert.ok(!/http:\/\//.test(source), "worker.js must not contain a plain-HTTP URL");
  assert.match(wrangler, /MEDBIOHIM_APP_URL\s*=\s*"https:\/\/medbiohim\.vercel\.app"/);

  for (const command of [...PUBLIC_COMMANDS, ...HIDDEN_ALIASES]) {
    const { status, calls } = await runBot({ update_id: 900, ...privateUpdate(`/${command}`) });
    assert.equal(status, 200, `/${command}`);
    const sent = calls.filter((call) => call.url.endsWith("/sendMessage"));
    assert.equal(sent.length, 1, `/${command} must send exactly one message`);
    const urls = emittedUrls(sent[0]);
    assert.ok(urls.length >= 1, `/${command} must expose a site button`);
    for (const url of urls) {
      assert.equal(new URL(url).origin, CANONICAL, `/${command} emitted ${url}`);
      assert.equal(new URL(url).protocol, "https:");
      assert.ok(!/git-main|192\.168\.|preview|localhost|workers\.dev/i.test(url), `/${command} emitted ${url}`);
    }
    assert.ok(!/git-main|192\.168\.|http:\/\//i.test(sent[0].payload.text), `/${command} text`);
  }

  // setMyCommands is sent only from a menu-bearing reply; assert its contents.
  const start = await runBot({ update_id: 901, ...privateUpdate("/start") });
  const setCommands = start.calls.filter((call) => call.url.endsWith("/setMyCommands"));
  assert.equal(setCommands.length, 1, "/start must register the command menu");
  const names = setCommands[0].payload.commands.map((entry) => entry.command);
  assert.deepEqual(names, PUBLIC_COMMANDS, "setMyCommands must publish exactly the public command set");
  for (const alias of HIDDEN_ALIASES) {
    assert.ok(!names.includes(alias), `/${alias} must stay a hidden alias`);
  }
  assert.match(readme, /medbiohim\.vercel\.app/, "the readme must document the canonical origin");
  assert.match(readme, /Preview-URL/, "the readme keeps the single-site claim this suite tests");
});

test("C2: /menu returns a two-column inline keyboard with the real sections", async () => {
  const { body, calls } = await runBot({ update_id: 910, ...privateUpdate("/menu") });
  assert.equal(body.ok, true);
  const sent = calls.filter((call) => call.url.endsWith("/sendMessage"));
  assert.equal(sent.length, 1);
  const keyboard = sent[0].payload.reply_markup?.inline_keyboard;
  assert.ok(Array.isArray(keyboard) && keyboard.length >= 2, "/menu must send an inline keyboard");
  for (const row of keyboard) assert.ok(row.length <= 2, "menu grid must be at most two columns");
  const urls = emittedUrls(sent[0]);
  for (const path of [
    "/schedule", "/homework", "/subjects", "/materials", "/tests", "/tickets", "/university",
    "/cards", "/progress", "/calculators", "/latin", "/extension", "/login", "/register", "/settings",
  ]) {
    assert.ok(urls.includes(`${CANONICAL}${path}`), `/menu is missing ${path}`);
  }
});

test("C3: /status points to /settings and admits the bot cannot show the link state", async () => {
  const { calls } = await runBot({ update_id: 911, ...privateUpdate("/status") });
  const sent = calls.filter((call) => call.url.endsWith("/sendMessage"))[0];
  assert.equal(emittedUrls(sent)[0], `${CANONICAL}/settings`);
  assert.match(sent.payload.text, /Настройки/);
  assert.match(sent.payload.text, /токен/i);
});

test("C4: /university and /cards link to their own paths", async () => {
  const first = await runBot({ update_id: 912, ...privateUpdate("/university") });
  const second = await runBot({ update_id: 913, ...privateUpdate("/cards") });
  assert.equal(emittedUrls(first.calls.filter((c) => c.url.endsWith("/sendMessage"))[0])[0], `${CANONICAL}/university`);
  assert.equal(emittedUrls(second.calls.filter((c) => c.url.endsWith("/sendMessage"))[0])[0], `${CANONICAL}/cards`);
});

test("C5: /privacy describes the real one-time link instead of denying it", async () => {
  const { calls } = await runBot({ update_id: 914, ...privateUpdate("/privacy") });
  const text = calls.filter((call) => call.url.endsWith("/sendMessage"))[0].payload.text;
  assert.match(text, /привязк/i);
  assert.match(text, /48/);
  assert.match(text, /username/i);
  assert.match(text, /first_name/i);
  assert.ok(!/не связывает|не реализован|отсутствует привязка/i.test(text), text);
  assert.match(emittedUrls(calls.filter((c) => c.url.endsWith("/sendMessage"))[0])[0], /\/settings$/);
});

test("C6: KV dedup is optional — absent, present and broken stores", async () => {
  const update = { update_id: 950, ...privateUpdate("/schedule") };

  const withoutKvFirst = await runBot(update);
  const withoutKvSecond = await runBot(update);
  assert.equal(withoutKvFirst.body.duplicate, undefined);
  assert.equal(withoutKvSecond.body.duplicate, undefined, "no binding => no dedup");
  assert.equal(withoutKvSecond.calls.filter((c) => c.url.endsWith("/sendMessage")).length, 1);

  const store = new Map();
  const kv = {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value, options) {
      store.set(key, { value, options });
    },
  };
  const withKvEnv = botEnv({ TELEGRAM_UPDATES: kv });
  const withKvFirst = await runBot(update, withKvEnv);
  const withKvSecond = await runBot(update, withKvEnv);
  assert.equal(withKvFirst.body.duplicate, undefined);
  assert.equal(withKvSecond.body.duplicate, true, "a bound KV store must dedupe repeated update_id");
  assert.ok(store.get("telegram:update:950").options.expirationTtl > 0);

  const brokenKv = {
    async get() {
      throw new Error("KV unavailable");
    },
    async put() {
      throw new Error("KV unavailable");
    },
  };
  const broken = await runBot(update, botEnv({ TELEGRAM_UPDATES: brokenKv }));
  assert.equal(broken.status, 200);
  assert.equal(broken.body.ok, true, "a broken KV store must never drop a real update");
  assert.equal(broken.calls.filter((c) => c.url.endsWith("/sendMessage")).length, 1);
});

test("C7: account-link commands addressed to another bot (or malformed) are never forwarded", async () => {
  const linkEnv = botEnv({
    TELEGRAM_BOT_USERNAME: "medbiohim_bot",
    TELEGRAM_ACCOUNT_LINK_WEBHOOK_URL: "https://api.example.test/api/v1/telegram/account-link/confirm",
  });
  const linkMessage = (text) => ({
    update_id: 960,
    message: { text, from: { id: 42, username: "student_test", first_name: "Student" }, chat: { id: 42, type: "private" } },
  });

  const foreign = await runBot(linkMessage(`/start@other_bot link_${"a".repeat(48)}`), linkEnv);
  assert.equal(foreign.body.ignored, true);
  assert.equal(foreign.calls.length, 0, "a foreign mention must not reach Telegram or the relay");

  const short = await runBot(linkMessage(`/start link_${"a".repeat(47)}`), linkEnv);
  assert.equal(short.status, 200);
  assert.ok(
    !short.calls.some((call) => call.url.includes("account-link")),
    "an invalid token length must not hit the account-link relay"
  );

  const foreignNoUsername = await runBot(linkMessage(`/start@other_bot link_${"a".repeat(48)}`), botEnv({ TELEGRAM_BOT_USERNAME: "medbiohim_bot" }));
  assert.equal(foreignNoUsername.body.ignored, true);
  assert.equal(foreignNoUsername.calls.length, 0);

  const own = await runBot(linkMessage(`/start@MEDBIOHIM_BOT link_${"b".repeat(48)}`), linkEnv);
  assert.equal(own.body.accountLink, true);
  assert.equal(own.calls.length, 2, "confirm + success message");
  assert.ok(own.calls.some((call) => call.url.includes("account-link")));
});

test("C8: secret handling, health endpoint and payload limits", async () => {
  const noSecret = await handleRequest(botRequest({ secret: "wrong", body: privateUpdate("/start") }), botEnv());
  assert.equal(noSecret.status, 401);
  const noToken = await handleRequest(botRequest({ body: privateUpdate("/start") }), {});
  assert.equal(noToken.status, 503);
  const health = await handleRequest(botRequest({ path: "/health", method: "GET" }), {});
  assert.equal(health.status, 200);
  const badMethod = await handleRequest(botRequest({ method: "GET" }), botEnv());
  assert.equal(badMethod.status, 405);
  const oversized = await handleRequest(
    new Request("https://bot.example/api/webhook", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
      body: "x".repeat(256 * 1024 + 1),
    }),
    botEnv()
  );
  assert.equal(oversized.status, 413);
});

test("DEFECT T9-2: an HTTPS branch-preview URL is emitted although the code claims it never is", async () => {
  const preview = "https://medbiohim-git-main-mistacen1.vercel.app";
  const { calls } = await runBot({ update_id: 970, ...privateUpdate("/schedule") }, botEnv({ MEDBIOHIM_APP_URL: preview }));
  const sent = calls.filter((call) => call.url.endsWith("/sendMessage"));
  const urls = emittedUrls(sent[0]);
  assert.deepEqual(
    urls,
    [`${CANONICAL}/schedule`],
    [
      `DEFECT T9-2 at src/worker.js:17-30 (safeAppOrigin only rejects non-HTTPS): with MEDBIOHIM_APP_URL="${preview}"`,
      `the bot emitted ${JSON.stringify(urls)} — a preview deployment host. worker.js:26-27 and README.md:15 claim`,
      "preview/branch URLs can never be emitted.",
    ].join(" ")
  );
});

