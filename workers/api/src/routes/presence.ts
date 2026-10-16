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

export default presence;
