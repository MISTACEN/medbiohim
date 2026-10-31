/**
 * Telegram Login Widget callback validation ("Sign in with Telegram" on the
 * website — the browser flow, unlike the Mini App initData login).
 *
 * Spec (https://core.telegram.org/widgets/login#checking-authorization):
 *   secret_key        = SHA256(bot_token)                     // NOT HMAC("WebAppData", …)
 *   data_check_string = all fields except `hash`, sorted BY KEY,
 *                       joined as `key=value` with "\n"
 *   hash              = hex(HMAC_SHA256(key=secret_key, message=data_check_string))
 *
 * `integrations/telegram-bot-cloudflare/src/loginwidget.js` is a second,
 * independent copy of this algorithm kept for the path where the bot Worker
 * (the only holder of the token) verifies remotely.
 * `workers/api/test/telegram-loginwidget-parity.test.js` asserts the two agree
 * on every accepted and rejected case, so they cannot drift apart silently.
 *
 * The comparison is constant-time. The function never logs and never throws:
 * every rejection is returned as a machine-readable `error` string.
 */

export type TelegramWidgetUser = {
  id: number;
  username: string | null;
  first_name: string | null;
};

export type TelegramWidgetError =
  | "bot_not_configured"
  | "invalid_payload"
  | "missing_required_fields"
  | "auth_date_in_future"
  | "payload_expired"
  | "invalid_hash"
  | "invalid_user"
  | "crypto_unavailable"
  // Remote (bot Worker) verification is not usable — an infrastructure problem,
  // never a statement about the caller's credentials.
  | "internal_not_configured"
  | "internal_unavailable";

export type TelegramWidgetResult =
  | { ok: true; user: TelegramWidgetUser; auth_date: number }
  | { ok: false; error: TelegramWidgetError };

export type TelegramWidgetPayload = Record<string, unknown>;

/** auth_date older than this is refused (24 hours). */
export const TELEGRAM_WIDGET_MAX_AGE_SECONDS = 86400;
/** Small clock-skew allowance for auth_date in the future. */
export const TELEGRAM_WIDGET_FUTURE_SKEW_SECONDS = 60;

const encoder = new TextEncoder();

/** Constant-time string comparison; length is not secret, content must not short-circuit. */
export function constantTimeEqual(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

async function hmacSha256(keyBytes: Uint8Array, message: string): Promise<Uint8Array | null> {
  // Resolved through globalThis so the module never depends on DOM typings.
  const subtle = (globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) return null;
  try {
    const key = await subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await subtle.sign("HMAC", key, encoder.encode(message));
    return new Uint8Array(signature);
  } catch {
    return null;
  }
}

function normalizeOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

/** Telegram user ids are positive safe integers; strings may not carry junk. */
function normalizeUserId(value: unknown): number | null {
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
export async function validateTelegramLoginWidget(
  payload: TelegramWidgetPayload | null | undefined,
  botToken: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<TelegramWidgetResult> {
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

  const fields: Array<{ key: string; value: string }> = [];
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
  const subtle = (globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) return { ok: false, error: "crypto_unavailable" };
  let widgetSecret: ArrayBuffer;
  try {
    widgetSecret = await subtle.digest("SHA-256", encoder.encode(token));
  } catch {
    return { ok: false, error: "crypto_unavailable" };
  }

  const expectedSignature = await hmacSha256(new Uint8Array(widgetSecret), dataCheckString);
  if (!expectedSignature) return { ok: false, error: "crypto_unavailable" };
  if (!constantTimeEqual(receivedHash.toLowerCase(), bytesToHex(expectedSignature))) {
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

/* ------------------------------------------------------------------ *
 * Remote verification through the bot Worker
 * ------------------------------------------------------------------ */

export type TelegramWidgetVerifierEnv = {
  TELEGRAM_BOT_VERIFY_WIDGET_URL?: string;
  TELEGRAM_INTERNAL_SECRET?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
};

/** `TELEGRAM_INTERNAL_SECRET` wins; the webhook secret is the shared fallback. */
function internalSecretValue(env: TelegramWidgetVerifierEnv | undefined): string {
  return String((env && (env.TELEGRAM_INTERNAL_SECRET || env.TELEGRAM_WEBHOOK_SECRET)) || "").trim();
}

/**
 * Only an https URL that speaks the bot's verify contract is accepted, so a
 * misconfigured environment can never be turned into an arbitrary fetch target.
 */
function verifyUrl(env: TelegramWidgetVerifierEnv | undefined): string | null {
  try {
    const url = new URL(String((env && env.TELEGRAM_BOT_VERIFY_WIDGET_URL) || "").trim());
    if (url.protocol !== "https:") return null;
    if (!url.hostname.endsWith(".workers.dev")) return null;
    if (url.pathname !== "/api/verify-widget") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** True when this Worker can verify the widget without holding the bot token. */
export function hasWidgetVerifier(env: TelegramWidgetVerifierEnv | undefined): boolean {
  return Boolean(internalSecretValue(env)) && verifyUrl(env) !== null;
}

/**
 * Verify the widget payload by asking the bot Worker, which is the only place
 * that holds `TELEGRAM_BOT_TOKEN`. Nothing about the token, the hash or the
 * signed string is available to this Worker. Never throws.
 */
export async function verifyTelegramLoginWidgetRemote(
  payload: TelegramWidgetPayload,
  env: TelegramWidgetVerifierEnv | undefined,
  timeoutMs = 8000
): Promise<TelegramWidgetResult> {
  const secret = internalSecretValue(env);
  const url = verifyUrl(env);
  if (!secret || !url) return { ok: false, error: "internal_not_configured" };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-medbiohim-internal": secret },
      body: JSON.stringify({ widget: payload }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const result = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string; auth_date?: number; user?: { id?: unknown; username?: unknown; first_name?: unknown } }
      | null;

    if (response.status === 401 && result?.error === "INVALID_WIDGET_PAYLOAD") {
      // The bot proved the signature wrong: this is a credential failure.
      return { ok: false, error: "invalid_hash" };
    }
    if (!response.ok || result?.ok !== true) return { ok: false, error: "internal_unavailable" };

    const id = result?.user?.id;
    if (!Number.isSafeInteger(id) || (id as number) <= 0) return { ok: false, error: "internal_unavailable" };
    const asString = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

    return {
      ok: true,
      auth_date: typeof result?.auth_date === "number" ? result.auth_date : 0,
      user: { id: id as number, username: asString(result?.user?.username), first_name: asString(result?.user?.first_name) },
    };
  } catch {
    return { ok: false, error: "internal_unavailable" };
  }
}
