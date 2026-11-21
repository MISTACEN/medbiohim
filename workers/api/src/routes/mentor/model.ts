/**
 * Bridge MEDBIOHIM → PdfMentor: чистая логика одноразовых кодов и HMAC.
 *
 * Здесь нет ни Hono, ни Redis: только то, что не зависит от запроса —
 * нормализация адреса PdfMentor, подпись server-to-server обмена и проверка
 * свежести метки времени. Поэтому безопасность бриджа не размазана по
 * обработчикам и её можно проверить отдельно.
 */

/** Код живёт 60 секунд: этого хватает на редирект и мало для перебора. */
export const MENTOR_CODE_TTL_SECONDS = 60;

/** Допустимое расхождение часов MEDBIOHIM и PdfMentor при обмене кода. */
export const BRIDGE_CLOCK_SKEW_SECONDS = 120;

export const BRIDGE_CLIENT = "pdfmentor";
export const BRIDGE_CLIENT_HEADER = "x-bridge-client";
export const BRIDGE_TIMESTAMP_HEADER = "x-bridge-timestamp";
export const BRIDGE_SIGNATURE_HEADER = "x-bridge-signature";

/** `login` — обычный вход, `link` — привязка к уже открытой сессии PdfMentor. */
export type MentorIntent = "login" | "link";

export type MentorCodePayload = {
  user_id: string;
  email: string;
  /** Адрес подтверждён в MEDBIOHIM — только тогда PdfMentor вправе склеить аккаунты по email. */
  email_verified: boolean;
  name: string;
  intent: MentorIntent;
  /** ISO-время истечения: нужно PdfMentor, чтобы не держать код дольше. */
  expires_at: string;
};

export function normalizeIntent(raw: unknown): MentorIntent {
  return raw === "link" ? "link" : "login";
}

/**
 * Адрес PdfMentor берётся из env, а не из запроса: иначе код можно увести на
 * чужой домен. В production допускаем только https; http — лишь для loopback,
 * чтобы локальная разработка не требовала сертификата.
 */
export function normalizeMentorUrl(raw?: string | null): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const loopback =
      url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function bridgeSignedPayload(code: string, timestamp: number): string {
  return `${timestamp}.${code}`;
}

/**
 * Код документа для подписи: `document:<file_id>:<user_id>`.
 *
 * Префикс отличает его от SSO-кода (32 hex-символа), поэтому подпись обмена
 * SSO нельзя переиспользовать как подпись чтения файла.
 */
export function documentBridgeCode(fileId: string, userId: string): string {
  return `document:${fileId.toLowerCase()}:${userId.toLowerCase()}`;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signBridgeCode(
  secret: string,
  code: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): Promise<{ timestamp: number; signature: string }> {
  return { timestamp, signature: await hmacHex(secret, bridgeSignedPayload(code, timestamp)) };
}

/**
 * Сравнение без раннего выхода: время проверки не зависит от того, на каком
 * символе подпись разошлась с ожидаемой.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export type BridgeVerification =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "missing" | "stale" | "bad-signature" };

/**
 * Проверка подписи входящего обмена. Секрет обязателен: без него бридж
 * закрыт, а не работает «как-нибудь» — иначе любой клиент получил бы данные
 * пользователя по одному лишь коду.
 */
export async function verifyBridgeSignature(input: {
  secret?: string | null;
  code: string;
  timestamp?: string | null;
  signature?: string | null;
  now?: number;
}): Promise<BridgeVerification> {
  const secret = String(input.secret ?? "").trim();
  if (!secret) return { ok: false, reason: "unconfigured" };

  const timestamp = Number(String(input.timestamp ?? "").trim());
  const signature = String(input.signature ?? "").trim().toLowerCase();
  if (!Number.isFinite(timestamp) || !timestamp || !signature) return { ok: false, reason: "missing" };

  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > BRIDGE_CLOCK_SKEW_SECONDS) return { ok: false, reason: "stale" };

  const expected = await hmacHex(secret, bridgeSignedPayload(input.code, timestamp));
  return constantTimeEqual(expected, signature) ? { ok: true } : { ok: false, reason: "bad-signature" };
}
