import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";

const dbAdmin = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const ALLOWED_TABLES = new Set([
  "users", "groups", "group_memberships", "subjects", "modules", "topics",
  "questions", "tests", "test_questions", "homeworks", "homework_submissions",
  "files", "materials", "schedule_entries", "schedules", "user_roles", "roles",
  "site_content", "presence_heartbeats", "trainer_feed_cards", "community_posts",
]);

async function isAdmin(c: any): Promise<boolean> {
  const user = c.get("user");
  const db = c.get("supabase");
  const { data, error } = await db.from("user_roles").select("roles(code)").eq("user_id", user.id).limit(20);
  if (error) throw error;
  return (data || []).some((row: any) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return String(role?.code || "").toLowerCase() === "admin";
  });
}

async function gateAdmin(c: any, rid: string): Promise<boolean> {
  try {
    if (await isAdmin(c)) return true;
    const { body, status } = fail("FORBIDDEN", "Недостаточно прав", 403, rid);
    c.res = c.json(body, status as 403);
    return false;
  } catch {
    const { body, status } = fail("ROLE_CHECK_UNAVAILABLE", "Не удалось проверить права", 503, rid);
    c.res = c.json(body, status as 503);
    return false;
  }
}

function sanitizeTable(name: string): string | null {
  const t = String(name || "").trim();
  if (!/^[a-z][a-z0-9_]{0,63}$/i.test(t) || !ALLOWED_TABLES.has(t)) return null;
  return t;
}

dbAdmin.get("/connections", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gateAdmin(c, rid))) return c.res;
  const hasService = Boolean((c.env.SUPABASE_SERVICE_ROLE_KEY || c.env.SUPABASE_SERVICE_KEY || c.env.SUPABASE_SECRET_KEY)?.trim());
  let host: string | null = null;
  try { host = new URL(String(c.env.SUPABASE_URL || "").trim()).host; } catch { /* */ }
  return c.json(ok({ items: [{ id: "supabase_primary", label: "Supabase primary", kind: "supabase_rest", host, editable: false, service_role_configured: hasService, note: "Secondary DB connections are not stored on Workers." }] }, rid));
});

dbAdmin.put("/connections/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gateAdmin(c, rid))) return c.res;
  if (c.req.param("id") === "supabase_primary") {
    const { body, status } = fail("FORBIDDEN", "Основное подключение настраивается через env", 403, rid);
    return c.json(body, status as 403);
  }
  const { body, status } = fail("NOT_SUPPORTED", "Secondary connections not supported on Workers", 501, rid);
  return c.json(body, status as 501);
});

dbAdmin.post("/connections/:id/test", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gateAdmin(c, rid))) return c.res;
  if (c.req.param("id") !== "supabase_primary") {
    const { body, status } = fail("NOT_FOUND", "Unknown connection", 404, rid);
    return c.json(body, status as 404);
  }
  try {
    const svc = createServiceClient(c.env);
    const client = svc || c.get("supabase");
    const { error } = await client.from("roles").select("id").limit(1);
    if (error) throw error;
    return c.json(ok({ ok: true, connection_id: "supabase_primary", mode: svc ? "service_role" : "user_jwt" }, rid));
  } catch (e: any) {
    const { body, status } = fail("DB_CONNECTION_FAILED", e?.message || "test failed", 503, rid);
    return c.json(body, status as 503);
  }
});

dbAdmin.get("/:id/tables", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gateAdmin(c, rid))) return c.res;
  if (c.req.param("id") !== "supabase_primary") {
    const { body, status } = fail("NOT_FOUND", "Unknown connection", 404, rid);
    return c.json(body, status as 404);
  }
  const items = [...ALLOWED_TABLES].sort().map((name) => ({ name, schema: "public", browsable: true }));
  return c.json(ok({ items, source: "allowlist" }, rid));
});

dbAdmin.get("/:id/schema/:table", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gateAdmin(c, rid))) return c.res;
  if (c.req.param("id") !== "supabase_primary") {
    const { body, status } = fail("NOT_FOUND", "Unknown connection", 404, rid);
    return c.json(body, status as 404);
  }
  const t = sanitizeTable(c.req.param("table") || "");
  if (!t) {
    const { body, status } = fail("VALIDATION_ERROR", "Table not allowed", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const svc = createServiceClient(c.env);
    const client = svc || c.get("supabase");
    const { data, error } = await client.from(t).select("*").limit(1);
    if (error) throw error;
    const sample = data?.[0];
    const columns = sample ? Object.keys(sample).map((name) => ({ name, type: typeof (sample as any)[name] })) : [];
    return c.json(ok({ table: t, columns, sample_available: Boolean(sample) }, rid));
  } catch (e: any) {
    const { body, status } = fail("DB_SCHEMA_FAILED", e?.message || "Schema failed", 422, rid);
    return c.json(body, status as 422);
  }
});

dbAdmin.get("/:id/rows/:table", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gateAdmin(c, rid))) return c.res;
  if (c.req.param("id") !== "supabase_primary") {
    const { body, status } = fail("NOT_FOUND", "Unknown connection", 404, rid);
    return c.json(body, status as 404);
  }
  const t = sanitizeTable(c.req.param("table") || "");
  if (!t) {
    const { body, status } = fail("VALIDATION_ERROR", "Table not allowed", 422, rid);
    return c.json(body, status as 422);
  }
  const limit = Math.min(500, Math.max(1, Number(c.req.query("limit")) || 100));
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  try {
    const svc = createServiceClient(c.env);
    const client = svc || c.get("supabase");
    const { data, error } = await client.from(t).select("*").range(offset, offset + limit - 1);
    if (error) throw error;
    return c.json(ok({ items: data || [], limit, offset, mode: svc ? "service_role" : "user_jwt" }, rid));
  } catch (e: any) {
    const { body, status } = fail("DB_ROWS_FAILED", e?.message || "Rows failed", 422, rid);
    return c.json(body, status as 422);
  }
});

dbAdmin.post("/:id/rows/:table", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gateAdmin(c, rid))) return c.res;
  if (c.req.param("id") !== "supabase_primary") {
    const { body, status } = fail("NOT_FOUND", "Unknown connection", 404, rid);
    return c.json(body, status as 404);
  }
  const t = sanitizeTable(c.req.param("table") || "");
  if (!t) {
    const { body, status } = fail("VALIDATION_ERROR", "Table not allowed", 422, rid);
    return c.json(body, status as 422);
  }
  let row: any = {};
  try { row = await c.req.json(); } catch {}
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    const { body, status } = fail("VALIDATION_ERROR", "JSON object required", 422, rid);
    return c.json(body, status as 422);
  }
  const svc = createServiceClient(c.env);
  if (!svc) {
    const { body, status } = fail("SERVICE_ROLE_REQUIRED", "Set SUPABASE_SERVICE_ROLE_KEY on Worker for admin row writes", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data, error } = await svc.from(t).insert(row).select("*").limit(1);
    if (error) throw error;
    return c.json(ok({ item: data?.[0] || null, mode: "service_role" }, rid), 201);
  } catch (e: any) {
    const { body, status } = fail("DB_WRITE_FAILED", e?.message || "Insert failed", 422, rid);
    return c.json(body, status as 422);
  }
});

dbAdmin.patch("/:id/rows/:table", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gateAdmin(c, rid))) return c.res;
  if (c.req.param("id") !== "supabase_primary") {
    const { body, status } = fail("NOT_FOUND", "Unknown connection", 404, rid);
    return c.json(body, status as 404);
  }
  const t = sanitizeTable(c.req.param("table") || "");
  if (!t) {
    const { body, status } = fail("VALIDATION_ERROR", "Table not allowed", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: any = {};
  try { payload = await c.req.json(); } catch {}
  const id = payload?.id || c.req.query("id");
  const patch = payload?.patch || payload?.data || payload;
  if (!id || !patch || typeof patch !== "object") {
    const { body, status } = fail("VALIDATION_ERROR", "id and patch required", 422, rid);
    return c.json(body, status as 422);
  }
  const svc = createServiceClient(c.env);
  if (!svc) {
    const { body, status } = fail("SERVICE_ROLE_REQUIRED", "Set SUPABASE_SERVICE_ROLE_KEY on Worker for admin row writes", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data, error } = await svc.from(t).update(patch).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Row not found", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok({ item: data, mode: "service_role" }, rid));
  } catch (e: any) {
    const { body, status } = fail("DB_WRITE_FAILED", e?.message || "Update failed", 422, rid);
    return c.json(body, status as 422);
  }
});

dbAdmin.delete("/:id/rows/:table", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gateAdmin(c, rid))) return c.res;
  if (c.req.param("id") !== "supabase_primary") {
    const { body, status } = fail("NOT_FOUND", "Unknown connection", 404, rid);
    return c.json(body, status as 404);
  }
  const t = sanitizeTable(c.req.param("table") || "");
  if (!t) {
    const { body, status } = fail("VALIDATION_ERROR", "Table not allowed", 422, rid);
    return c.json(body, status as 422);
  }
  const id = c.req.query("id") || "";
  if (!id) {
    const { body, status } = fail("VALIDATION_ERROR", "id query required", 422, rid);
    return c.json(body, status as 422);
  }
  const svc = createServiceClient(c.env);
  if (!svc) {
    const { body, status } = fail("SERVICE_ROLE_REQUIRED", "Set SUPABASE_SERVICE_ROLE_KEY on Worker for admin row deletes", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const q = svc.from(t).delete().eq("id", id);
    const { error } = await q;
    if (error) throw error;
    return c.json(ok({ deleted: true }, rid));
  } catch (e: any) {
    const { body, status } = fail("DB_WRITE_FAILED", e?.message || "Delete failed", 422, rid);
    return c.json(body, status as 422);
  }
});

dbAdmin.post("/:id/sql", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gateAdmin(c, rid))) return c.res;
  if (c.req.param("id") !== "supabase_primary") {
    const { body, status } = fail("NOT_FOUND", "Unknown connection", 404, rid);
    return c.json(body, status as 404);
  }
  let payload: any = {};
  try { payload = await c.req.json(); } catch {}
  const sql = String(payload?.sql || "").trim();
  if (!sql) {
    const { body, status } = fail("VALIDATION_ERROR", "sql required", 422, rid);
    return c.json(body, status as 422);
  }
  if (sql.length > 20000) {
    const { body, status } = fail("VALIDATION_ERROR", "sql too large", 422, rid);
    return c.json(body, status as 422);
  }
  if (payload?.confirm !== true) {
    const { body, status } = fail("CONFIRMATION_REQUIRED", "Set confirm:true to run SQL", 422, rid);
    return c.json(body, status as 422);
  }
  const svc = createServiceClient(c.env);
  if (!svc) {
    const { body, status } = fail("SERVICE_ROLE_REQUIRED", "Set SUPABASE_SERVICE_ROLE_KEY on Worker", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data, error } = await svc.rpc("admin_exec_sql", { query: sql });
    if (error) {
      const { body, status } = fail("SQL_RPC_MISSING", error.message || "Create RPC public.admin_exec_sql(query text) on Supabase for SQL console", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ result: data, mode: "service_role" }, rid));
  } catch (e: any) {
    const { body, status } = fail("SQL_FAILED", e?.message || "SQL failed", 422, rid);
    return c.json(body, status as 422);
  }
});


export default dbAdmin;
