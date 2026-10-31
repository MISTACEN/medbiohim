/**
 * Telegram Login Widget callback validation for the bot Worker.
 *
 * The Login Widget ("Sign in with Telegram" on the website) signs its callback
 * with a different scheme than the Mini App initData:
 *
 * Spec (https://core.telegram.org/widgets/login#checking-authorization):
 *   secret_key        = SHA256(bot_token)                     // NOT HMAC("WebAppData", …)
 *   data_check_string = all fields except `hash`, sorted BY KEY,
 *                       joined as `key=value` with "\n"
 *   hash              = hex(HMAC_SHA256(key=secret_key, message=data_check_string))
 *
 * The comparison is constant-time. Nothing here logs, and nothing throws: every
 * rejection is returned as a machine-readable `error` string, so the endpoint
 * cannot be turned into an oracle that says which check failed.
 */

export const TELEGRAM_WIDGET_MAX_AGE_SECONDS = 86400;
export const TELEGRAM_WIDGET_FUTURE_SKEW_SECONDS = 60;

const encoder = new TextEncoder();

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

/** Widget strings are short; anything longer than Telegram would send is hostile. */
function normalizeOptionalString(value, maxLength) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
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

/**
 * Validate the Login Widget callback payload against the bot token and return
 * the Telegram identity. `nowSeconds` is injectable so expiry can be tested.
 */
export async function validateTelegramLoginWidget(payload, botToken, nowSeconds = Math.floor(Date.now() / 1000)) {
  const token = typeof botToken === "string" ? botToken.trim() : "";
  if (!token) return { ok: false, error: "bot_not_configured" };

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "invalid_payload" };
  }

  const receivedHash = typeof payload.hash === "string" ? payload.hash : "";
  const authDateRaw = payload.auth_date;
  if (!/^[a-f0-9]{64}$/i.test(receivedHash) || (typeof authDateRaw !== "string" && typeof authDateRaw !== "number")) {
    return { ok: false, error: "missing_required_fields" };
  }
  const authDate = Number(authDateRaw);
  if (!Number.isSafeInteger(authDate)) return { ok: false, error: "invalid_payload" };

  const now = Number.isFinite(nowSeconds) ? Math.floor(nowSeconds) : Math.floor(Date.now() / 1000);
  if (authDate > now + TELEGRAM_WIDGET_FUTURE_SKEW_SECONDS) return { ok: false, error: "auth_date_in_future" };
  if (authDate < now - TELEGRAM_WIDGET_MAX_AGE_SECONDS) return { ok: false, error: "payload_expired" };

  const fields = [];
  for (const [key, value] of Object.entries(payload)) {
    if (key === "hash") continue;
    // The signature covers the literal field values Telegram sent; booleans and
    // objects (a forged `user` JSON, say) never appear in a real callback.
    if (typeof value !== "string" && typeof value !== "number") return { ok: false, error: "invalid_payload" };
    fields.push({ key, value: String(value) });
  }
  if (fields.length === 0) return { ok: false, error: "invalid_payload" };

  fields.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  const dataCheckString = fields.map((field) => `${field.key}=${field.value}`).join("\n");

  // Widget secret is SHA256(bot_token) — see the spec comment above.
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { ok: false, error: "crypto_unavailable" };
  let widgetSecret;
  try {
    widgetSecret = await subtle.digest("SHA-256", encoder.encode(token));
  } catch {
    return { ok: false, error: "crypto_unavailable" };
  }

  const expectedSignature = await hmacSha256(new Uint8Array(widgetSecret), dataCheckString);
  if (!expectedSignature) return { ok: false, error: "crypto_unavailable" };
  if (!constantTimeEqualString(receivedHash.toLowerCase(), bytesToHex(expectedSignature))) {
    return { ok: false, error: "invalid_hash" };
  }

  const id = normalizeUserId(payload.id);
  if (id === null) return { ok: false, error: "invalid_user" };

  return {
    ok: true,
    auth_date: authDate,
    user: {
      id,
      username: normalizeOptionalString(payload.username, 64),
      first_name: normalizeOptionalString(payload.first_name, 128),
    },
  };
}

/** Local copy so this module has no import from initdata.js (they differ on purpose). */
function constantTimeEqualString(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}
