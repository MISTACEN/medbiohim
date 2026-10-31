/**
 * Telegram Mini App `initData` validation (Cloudflare Workers / WebCrypto).
 *
 * Spec (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 *   secret_key      = HMAC_SHA256(key="WebAppData", message=bot_token)
 *   data_check_string = all fields except `hash`, sorted by key, joined as `key=value` with "\n"
 *   hash            = hex(HMAC_SHA256(key=secret_key, message=data_check_string))
 *
 * The comparison is constant-time. The function never logs and never throws:
 * every rejection is returned as a machine-readable `error` string.
 */

export type TelegramInitDataUser = {
  id: number;
  username: string | null;
  first_name: string | null;
};

export type TelegramInitDataError =
  | "bot_not_configured"
  | "invalid_init_data"
  | "missing_required_fields"
  | "auth_date_in_future"
  | "init_data_expired"
  | "invalid_hash"
  | "missing_user"
  | "invalid_user"
  | "crypto_unavailable"
  // Remote (bot Worker) verification is not usable — an infrastructure problem,
  // never a statement about the caller's credentials.
  | "internal_not_configured"
  | "internal_unavailable";

export type TelegramInitDataResult =
  | { ok: true; user: TelegramInitDataUser; auth_date: number }
  | { ok: false; error: TelegramInitDataError };

/** Telegram itself keeps initData small; anything larger is hostile input. */
export const TELEGRAM_INIT_DATA_MAX_LENGTH = 16384;
/** auth_date older than this is refused (24 hours). */
export const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 86400;
/** Small clock-skew allowance for auth_date in the future. */
export const TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS = 60;

const encoder = new TextEncoder();

/**
 * Constant-time string comparison. Length is not secret; content must not
 * short-circuit so a timing side channel cannot reveal the expected hash.
 */
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
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
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

/** `application/x-www-form-urlencoded` decoding: `+` is a space, then %XX. */
function decodeFormComponent(raw: string): string | null {
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
function parseInitData(raw: string): Map<string, string> | null {
  const fields = new Map<string, string>();
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

function normalizeOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

/**
 * Validate `initData` against the bot token and return the Telegram identity.
 *
 * `nowSeconds` is injectable so expiry can be tested without touching clocks.
 */
export async function validateTelegramInitData(
  initData: string,
  botToken: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<TelegramInitDataResult> {
  const token = typeof botToken === "string" ? botToken.trim() : "";
  if (!token) return { ok: false, error: "bot_not_configured" };

  if (typeof initData !== "string" || initData === "" || initData.length > TELEGRAM_INIT_DATA_MAX_LENGTH) {
    return { ok: false, error: "invalid_init_data" };
  }

  const fields = parseInitData(initData);
  if (!fields) return { ok: false, error: "invalid_init_data" };

  const receivedHash = fields.get("hash");
  const authDateRaw = fields.get("auth_date");
  if (
    !receivedHash ||
    !/^[a-f0-9]{64}$/i.test(receivedHash) ||
    !authDateRaw ||
    !/^[0-9]+$/.test(authDateRaw)
  ) {
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
  // Sorting whole pairs would reject a legitimately signed payload.
  const checkFields: Array<{ key: string; value: string }> = [];
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

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawUser);
  } catch {
    return { ok: false, error: "invalid_user" };
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    return { ok: false, error: "invalid_user" };
  }

  const record = decoded as Record<string, unknown>;
  const userId = normalizeUserId(record.id);
  if (userId === null) return { ok: false, error: "invalid_user" };

  return {
    ok: true,
    auth_date: authDate,
    user: {
      id: userId,
      username: normalizeOptionalString(record.username, 64),
      first_name: normalizeOptionalString(record.first_name, 128),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Remote verification through the bot Worker
 * ------------------------------------------------------------------ */

export type TelegramVerifierEnv = {
  TELEGRAM_BOT_VERIFY_URL?: string;
  TELEGRAM_BOT?: { fetch: (request: Request | string, init?: RequestInit) => Promise<Response> };
  TELEGRAM_INTERNAL_SECRET?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
};

/** `TELEGRAM_INTERNAL_SECRET` wins; the webhook secret is the shared fallback. */
export function internalSecretValue(env: TelegramVerifierEnv | undefined): string {
  return String((env && (env.TELEGRAM_INTERNAL_SECRET || env.TELEGRAM_WEBHOOK_SECRET)) || "").trim();
}

/**
 * Only an https URL that speaks the bot's verify contract is accepted, so a
 * misconfigured environment can never be turned into an arbitrary fetch target.
 */
export function verifyUrl(env: TelegramVerifierEnv | undefined): string | null {
  try {
    const url = new URL(String((env && env.TELEGRAM_BOT_VERIFY_URL) || "").trim());
    if (url.protocol !== "https:") return null;
    if (!url.hostname.endsWith(".workers.dev")) return null;
    if (url.pathname !== "/api/verify-initdata") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** True when this Worker can verify initData without holding the bot token. */
export function hasRemoteVerifier(env: TelegramVerifierEnv | undefined): boolean {
  return Boolean(internalSecretValue(env)) && verifyUrl(env) !== null;
}

/**
 * Verify initData by asking the bot Worker, which is the only place that holds
 * `TELEGRAM_BOT_TOKEN`. Nothing about the token, the hash or the signed string
 * is available to this Worker. Never throws.
 */
export async function verifyTelegramInitDataRemote(
  initData: string,
  env: TelegramVerifierEnv | undefined,
  timeoutMs = 8000
): Promise<TelegramInitDataResult> {
  const secret = internalSecretValue(env);
  const url = verifyUrl(env);
  if (!secret || !url) return { ok: false, error: "internal_not_configured" };

  try {
    // The service binding (TELEGRAM_BOT, see wrangler.toml) bypasses the public
    // workers.dev URL: plain fetches from a Worker are cut at the edge by
    // account bot protection (non-browser agents get 403). This module must
    // stay dependency-free, so the binding check is inlined here.
    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json", "x-medbiohim-internal": secret },
      body: JSON.stringify({ init_data: initData }),
      signal: AbortSignal.timeout(timeoutMs),
    };
    const binding = env?.TELEGRAM_BOT;
    const response = binding ? await binding.fetch(url, init) : await fetch(url, init);
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string; auth_date?: number; user?: { id?: unknown; username?: unknown; first_name?: unknown } }
      | null;

    if (response.status === 401 && payload?.error === "INVALID_INIT_DATA") {
      // The bot proved the signature wrong: this is a credential failure.
      return { ok: false, error: "invalid_hash" };
    }
    if (!response.ok || payload?.ok !== true) return { ok: false, error: "internal_unavailable" };

    const id = payload?.user?.id;
    if (!Number.isSafeInteger(id) || (id as number) <= 0) return { ok: false, error: "internal_unavailable" };
    const asString = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

    return {
      ok: true,
      auth_date: typeof payload?.auth_date === "number" ? payload.auth_date : 0,
      user: { id: id as number, username: asString(payload?.user?.username), first_name: asString(payload?.user?.first_name) },
    };
  } catch {
    return { ok: false, error: "internal_unavailable" };
  }
}
