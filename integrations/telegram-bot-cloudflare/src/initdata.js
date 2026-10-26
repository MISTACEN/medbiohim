/**
 * Telegram Mini App `initData` validation for the bot Worker.
 *
 * This Worker is the only place that holds `TELEGRAM_BOT_TOKEN`, so initData is
 * verified here and the verified identity (never the token) is handed to the
 * MEDBIOHIM API through the shared-secret endpoint `/api/verify-initdata`.
 *
 * Spec (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 *   secret_key        = HMAC_SHA256(key="WebAppData", message=bot_token)
 *   data_check_string = all fields except `hash`, sorted BY KEY, joined as `key=value` with "\n"
 *   hash              = hex(HMAC_SHA256(key=secret_key, message=data_check_string))
 *
 * The comparison is constant-time. Nothing here logs, and nothing throws: every
 * rejection is returned as a machine-readable `error` string.
 *
 * `workers/api/src/lib/telegram-initdata.ts` is a second, independent copy of
 * this algorithm kept for the path where the API Worker holds its own token.
 * `workers/api/test/telegram-initdata-parity.test.js` asserts the two agree on
 * every accepted and rejected case, so they cannot drift apart silently.
 */

export const TELEGRAM_INIT_DATA_MAX_LENGTH = 16384;
export const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 86400;
export const TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS = 60;

const encoder = new TextEncoder();

/** Constant-time string comparison; length is not secret, content must not short-circuit. */
export function constantTimeEqual(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function bytesToHex(bytes) {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

async function hmacSha256(keyBytes, message) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const key = await subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await subtle.sign("HMAC", key, encoder.encode(message));
    return new Uint8Array(signature);
  } catch {
    return null;
  }
}

/** `application/x-www-form-urlencoded` decoding: `+` is a space, then %XX. */
function decodeFormComponent(raw) {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

/**
 * Parse the query string without URLSearchParams so duplicate keys and broken
 * percent-encoding are rejected instead of silently normalized away.
 */
function parseInitData(raw) {
  const fields = new Map();
  for (const part of raw.split("&")) {
    if (part === "") continue;
    const separator = part.indexOf("=");
    const rawKey = separator === -1 ? part : part.slice(0, separator);
    const rawValue = separator === -1 ? "" : part.slice(separator + 1);
    const key = decodeFormComponent(rawKey);
    const value = decodeFormComponent(rawValue);
    if (key === null || value === null || key === "") return null;
    // A repeated key makes the signed field set ambiguous: refuse it.
    if (fields.has(key)) return null;
    fields.set(key, value);
  }
  return fields;
}

/** Telegram user ids are positive safe integers; strings may not carry junk. */
function normalizeUserId(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string") {
    if (!/^[0-9]{1,18}$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function normalizeOptionalString(value, maxLength) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

/**
 * Validate `initData` against the bot token and return the Telegram identity.
 * `nowSeconds` is injectable so expiry can be tested without touching clocks.
 */
export async function validateTelegramInitData(initData, botToken, nowSeconds = Math.floor(Date.now() / 1000)) {
  const token = typeof botToken === "string" ? botToken.trim() : "";
  if (!token) return { ok: false, error: "bot_not_configured" };

  if (typeof initData !== "string" || initData === "" || initData.length > TELEGRAM_INIT_DATA_MAX_LENGTH) {
    return { ok: false, error: "invalid_init_data" };
  }

  const fields = parseInitData(initData);
  if (!fields) return { ok: false, error: "invalid_init_data" };

  const receivedHash = fields.get("hash");
  const authDateRaw = fields.get("auth_date");
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash) || !authDateRaw || !/^[0-9]+$/.test(authDateRaw)) {
    return { ok: false, error: "missing_required_fields" };
  }

  const authDate = Number(authDateRaw);
  if (!Number.isSafeInteger(authDate)) return { ok: false, error: "invalid_init_data" };

  const now = Number.isFinite(nowSeconds) ? Math.floor(nowSeconds) : Math.floor(Date.now() / 1000);
  if (authDate > now + TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS) {
    return { ok: false, error: "auth_date_in_future" };
  }
  if (authDate < now - TELEGRAM_INIT_DATA_MAX_AGE_SECONDS) {
    return { ok: false, error: "init_data_expired" };
  }

  // The spec sorts by field NAME, not by the assembled `key=value` string: the
  // two orders differ whenever one key is a prefix of another and the next
  // character sorts below "=" (0x3D) — digits do, e.g. `a` vs `a1`.
  const checkFields = [];
  for (const [key, value] of fields) {
    if (key === "hash") continue;
    checkFields.push({ key, value });
  }
  checkFields.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  const dataCheckString = checkFields.map((field) => `${field.key}=${field.value}`).join("\n");

  const secretKey = await hmacSha256(encoder.encode("WebAppData"), token);
  if (!secretKey) return { ok: false, error: "crypto_unavailable" };
  const expectedSignature = await hmacSha256(secretKey, dataCheckString);
  if (!expectedSignature) return { ok: false, error: "crypto_unavailable" };

  if (!constantTimeEqual(receivedHash.toLowerCase(), bytesToHex(expectedSignature))) {
    return { ok: false, error: "invalid_hash" };
  }

  const rawUser = fields.get("user");
  // An absent key is "missing"; a present but unparseable value is "invalid".
  if (rawUser === undefined) return { ok: false, error: "missing_user" };

  let decoded;
  try {
    decoded = JSON.parse(rawUser);
  } catch {
    return { ok: false, error: "invalid_user" };
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    return { ok: false, error: "invalid_user" };
  }

  const userId = normalizeUserId(decoded.id);
  if (userId === null) return { ok: false, error: "invalid_user" };

  return {
    ok: true,
    auth_date: authDate,
    user: {
      id: userId,
      username: normalizeOptionalString(decoded.username, 64),
      first_name: normalizeOptionalString(decoded.first_name, 128),
    },
  };
}
