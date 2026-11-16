import { Hono } from "hono";
import type { Env } from "../env";
import { ok, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { getRedis } from "../lib/redis";

const presence = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

presence.post("/heartbeat", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const redis = getRedis(c.env);
  if (redis) {
    try {
      await redis.set(`presence:${user.id}`, Date.now().toString(), { ex: 120 });
    } catch {
      // ignore
    }
  }
  return c.json(ok({ online: true, at: new Date().toISOString() }, rid));
});

/**
 * «Сейчас на сайте N» — только агрегат, без имён и списков.
 * Ключи присутствия живут 120 секунд, поэтому SCAN по `presence:*` и есть
 * количество активных за последние две минуты. Redis не настроен — честно
 * отдаём available:false, а не ноль как факт.
 */
presence.get("/count", async (c) => {
  const rid = requestId();
  const redis = getRedis(c.env);
  if (!redis) return c.json(ok({ count: 0, available: false }, rid));
  try {
    let cursor = "0";
    let count = 0;
    do {
      const [next, keys] = await redis.scan(cursor, { match: "presence:*", count: 200 });
      cursor = String(next);
      count += Array.isArray(keys) ? keys.length : 0;
    } while (cursor !== "0" && count < 5000);
    return c.json(ok({ count, available: true, window_seconds: 120 }, rid));
  } catch (error) {
    console.warn("[presence:count]", error instanceof Error ? error.message : "unavailable");
    return c.json(ok({ count: 0, available: false }, rid));
  }
});

export default presence;
