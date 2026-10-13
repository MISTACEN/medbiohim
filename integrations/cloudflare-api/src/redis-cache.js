/**
 * Optional Upstash Redis REST cache. Cache failures never fail the API request.
 * Never cache file bytes, credentials, raw auth tokens, or answer keys.
 */
function redisConfig(env) {
  const baseText = String(env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  try {
    const base = new URL(baseText);
    if (base.protocol !== "https:" || !base.hostname.endsWith(".upstash.io") || !token) return null;
    return { base: base.origin, token };
  } catch {
    return null;
  }
}

async function command(env, args, fetcher) {
  const config = redisConfig(env);
  if (!config) return null;
  try {
    const response = await fetcher(config.base, {
      method: "POST",
      headers: {
        authorization: "Bearer " + config.token,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(args),
      redirect: "error",
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload && Object.prototype.hasOwnProperty.call(payload, "result") ? payload.result : null;
  } catch {
    return null;
  }
}

export async function getRedisJsonCache(env, key, fetcher = fetch) {
  const safeKey = String(key || "");
  if (!safeKey.startsWith("medbiohim:") || safeKey.length > 400) return null;
  const value = await command(env, ["GET", safeKey], fetcher);
  if (typeof value !== "string") return null;
  try { return JSON.parse(value); } catch { return null; }
}

export async function setRedisJsonCache(env, key, value, ttlSeconds = 15, fetcher = fetch) {
  const safeKey = String(key || "");
  const ttl = Math.max(1, Math.min(60, Math.floor(Number(ttlSeconds) || 15)));
  if (!safeKey.startsWith("medbiohim:") || safeKey.length > 400) return false;
  const serialized = JSON.stringify(value);
  if (serialized.length > 250_000) return false;
  const result = await command(env, ["SET", safeKey, serialized, "EX", String(ttl)], fetcher);
  return result === "OK";
}
