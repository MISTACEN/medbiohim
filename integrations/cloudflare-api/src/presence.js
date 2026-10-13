import { authenticateSupabaseRequest } from "./supabase-auth.js";

const fail = (status, code, message) => ({ ok: false, status, code, message });
async function client(request, env, fetcher) {
  const auth = await authenticateSupabaseRequest(request, env, fetcher);
  if (!auth.ok) return auth;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const key = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try { base = new URL(String(env.SUPABASE_URL || "").trim()); if (base.protocol !== "https:" || !key) throw new Error("config"); }
  catch { return fail(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key"); }
  async function rows(table, params = {}, init = {}) {
    const u = new URL("/rest/v1/" + table, base);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    const r = await fetcher(u.toString(), {
      ...init, method: init.method || "GET",
      headers: { apikey: key, authorization: "Bearer " + token, accept: "application/json",
        ...(init.body ? { "content-type": "application/json", prefer: "return=representation" } : {}), ...(init.headers || {}) },
      redirect: "error", signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) { const e = new Error("REST failure"); e.status = r.status; throw e; }
    const data = await r.json(); return Array.isArray(data) ? data : [];
  }
  return { ok: true, identity: auth.user, rows };
}
async function rolesFor(rows, uid) {
  try {
    const data = await rows("user_roles", { select: "roles(code)", user_id: "eq." + uid, limit: "20" });
    return [...new Set(data.flatMap((row) => {
      const roles = Array.isArray(row?.roles) ? row.roles : row?.roles ? [row.roles] : [];
      return roles.map((r) => String(r?.code || "").toLowerCase().trim()).filter(Boolean);
    }))];
  } catch { return []; }
}
export async function heartbeatSupabasePresence(request, env, fetcher = fetch) {
  const c = await client(request, env, fetcher); if (!c.ok) return c;
  const uid = c.identity.id, roles = await rolesFor(c.rows, uid);
  const cf = request.cf && typeof request.cf === "object" ? request.cf : {};
  const row = { user_id: uid, name: null, role: roles[0] || null, region: cf.region || null, country: cf.country || null,
    geo_source: cf.country ? "cf" : "unknown", last_seen: new Date().toISOString() };
  try {
    const old = await c.rows("presence_online", { select: "user_id", user_id: "eq." + uid, limit: "1" });
    const result = old[0]
      ? await c.rows("presence_online", { user_id: "eq." + uid, select: "*" }, { method: "PATCH", body: JSON.stringify(row) })
      : await c.rows("presence_online", { select: "*" }, { method: "POST", body: JSON.stringify(row) });
    return { ok: true, data: { presence: result[0] || row } };
  } catch (e) {
    if (e?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (e?.status === 403 || e?.status === 404) return fail(503, "PRESENCE_ERROR", "Таблица presence_online недоступна под JWT/RLS");
    return fail(500, "PRESENCE_ERROR", "Не удалось обновить статус присутствия");
  }
}
export async function listSupabaseAdminPresence(request, env, withinSec = 180, fetcher = fetch) {
  const c = await client(request, env, fetcher); if (!c.ok) return c;
  const roles = await rolesFor(c.rows, c.identity.id);
  if (!roles.some((r) => ["admin", "moderator", "teacher"].includes(r))) return fail(403, "FORBIDDEN", "Недостаточно прав");
  const within = Math.max(60, Math.min(Number(withinSec) || 180, 900));
  const cutoff = new Date(Date.now() - within * 1000).toISOString();
  try {
    const rows = await c.rows("presence_online", { select: "user_id,name,role,region,country,geo_source,last_seen", last_seen: "gte." + cutoff, order: "last_seen.desc", limit: "500" });
    const now = Date.now();
    const items = rows.map((r) => { const seen = Date.parse(String(r.last_seen || "")) || 0; return { ...r, seconds_ago: seen ? Math.max(0, Math.floor((now - seen) / 1000)) : null, online: true }; });
    return { ok: true, data: { items, count: items.length, within_sec: within } };
  } catch (e) {
    if (e?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (e?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав");
    return fail(500, "PRESENCE_ERROR", "Не удалось обновить статус присутствия");
  }
}
