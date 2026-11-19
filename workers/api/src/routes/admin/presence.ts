import { requireAuth } from "../../middleware/auth";
import { ok, requestId } from "../../lib/response";
import { getRedis } from "../../lib/redis";
import { createServiceClient } from "../../lib/supabase";
import { STRICT_ADMINS, UUID, error, gate, type AdminApp } from "./shared";

/**
 * «Кто сейчас онлайн» по heartbeat-меткам в Redis.
 */
export function registerPresence(admin: AdminApp) {

  // Online presence for the admin console. Heartbeats are written by
  // `POST /presence/heartbeat`; this endpoint reports everyone seen recently.
  admin.get("/presence", requireAuth, async (c) => {
    const rid = requestId();
    // «Кто сейчас онлайн» — персональные данные студентов: только администратор.
    // Раньше гейт включал преподавателя — тот видел активность всех (план §37-38).
    if (!(await gate(c, STRICT_ADMINS))) return c.res;
    const within = Math.max(60, Math.min(900, Number(c.req.query("within") || 180) || 180));
    const redis = getRedis(c.env);
    if (!redis) return c.json(ok({ items: [], count: 0, within_sec: within, source: "unconfigured" }, rid));
    try {
      const keys = await redis.keys("presence:*");
      const ids = (keys || [])
        .map((key: string) => key.slice("presence:".length))
        .filter((id: string) => UUID.test(id))
        .slice(0, 500);
      if (!ids.length) return c.json(ok({ items: [], count: 0, within_sec: within, source: "redis" }, rid));

      const stamps = (await redis.mget(...ids.map((id) => `presence:${id}`))) as Array<string | number | null>;
      const now = Date.now();
      const cutoff = now - within * 1000;
      const online: Array<{ user_id: string; seen: number }> = [];
      ids.forEach((id, index) => {
        const seen = Number(stamps?.[index] || 0);
        if (Number.isFinite(seen) && seen >= cutoff) online.push({ user_id: id, seen });
      });
      if (!online.length) return c.json(ok({ items: [], count: 0, within_sec: within, source: "redis" }, rid));

      const onlineIds = online.map((row) => row.user_id);
      const read = (db: any) => db.from("users").select("id,email,full_name").in("id", onlineIds);
      let users = await read(c.get("supabase"));
      if (users.error) {
        const service = createServiceClient(c.env);
        if (service) users = await read(service);
      }
      const byId = new Map<string, any>((users.data || []).map((user: any) => [String(user.id), user]));

      const roleRows = await c.get("supabase")
        .from("user_roles")
        .select("user_id,roles(code)")
        .in("user_id", onlineIds);
      const roles = new Map<string, string[]>();
      for (const row of roleRows.data || []) {
        const role = Array.isArray((row as any).roles) ? (row as any).roles[0] : (row as any).roles;
        const list = roles.get((row as any).user_id) || [];
        list.push(String(role?.code || ""));
        roles.set((row as any).user_id, list);
      }

      const items = online
        .sort((a, b) => b.seen - a.seen)
        .map((row) => {
          const user = byId.get(row.user_id) || {};
          return {
            user_id: row.user_id,
            name: user.full_name || user.email || null,
            email: user.email || null,
            role: (roles.get(row.user_id) || [])[0] || null,
            last_seen: new Date(row.seen).toISOString(),
            seconds_ago: Math.max(0, Math.round((now - row.seen) / 1000)),
            online: true,
          };
        });
      return c.json(ok({ items, count: items.length, within_sec: within, source: "redis" }, rid));
    } catch (cause) {
      console.error("[admin:presence]", cause);
      return error(c, rid, 503, "PRESENCE_UNAVAILABLE", "Не удалось загрузить статус присутствия");
    }
  });
}
