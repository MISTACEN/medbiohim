import { Redis } from "@upstash/redis/cloudflare";
import type { Env } from "../env";

export function getRedis(env: Env): Redis | null {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/**
 * Simple sliding-window rate limit.
 * Returns true if the request is allowed.
 */
export async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedis(env);
  if (!redis) {
    // Fail open when Redis is not configured (dev); production should set secrets.
    return { allowed: true, remaining: limit };
  }

  const redisKey = `rl:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }
  const remaining = Math.max(0, limit - count);
  return { allowed: count <= limit, remaining };
}
