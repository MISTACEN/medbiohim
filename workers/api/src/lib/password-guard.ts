/**
 * Проверка пароля по базе утечек HaveIBeenPwned (замена Pro-фичи Supabase
 * «Leaked password protection» на бесплатном тарифе).
 *
 * Модель k-анонимности: на HIBP уходит только первые 5 символов SHA-1 хеша
 * пароля — сам пароль и его полный хеш не покидают воркер. Если API недоступен,
 * проверка честно пропускается (fail-open): регистрация не должна зависеть
 * от стороннего сервиса.
 */

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/";
const HIBP_TIMEOUT_MS = 5000;

/** SHA-1 хеш пароля (uppercase hex) — формат, который ждёт HIBP range API. */
export async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, "0");
  return out.toUpperCase();
}

/**
 * true — пароль найден в утечках (пользователь должен выбрать другой);
 * false — чистый; null — HIBP недоступен (fail-open, решение за вызывающим).
 */
export async function isPwnedPassword(password: string): Promise<boolean | null> {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const response = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
      headers: { "add-padding": "true" },
      signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = await response.text();
    for (const line of body.split("\n")) {
      const [hashSuffix, countRaw] = line.trim().split(":");
      if (hashSuffix === suffix && Number(countRaw) > 0) return true;
    }
    return false;
  } catch (error) {
    console.error("[password-guard:hibp]", error);
    return null;
  }
}
