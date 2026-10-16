import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const groups = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGERS = ["admin", "moderator", "teacher"];

async function roleCodes(c: any): Promise<string[]> {
  const user = c.get("user");
  const db = c.get("supabase");
  const { data, error } = await db.from("user_roles").select("roles(code)").eq("user_id", user.id).limit(20);
  if (error) throw error;
  return (data || []).map((row: any) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return String(role?.code || "").toLowerCase();
  }).filter(Boolean);
}
async function isManager(c: any) {
  return (await roleCodes(c)).some((r) => MANAGERS.includes(r));
}
function rel(v: any) { return Array.isArray(v) ? v[0] : v; }
function mapGroup(row: any) {
  if (!row) return null;
  const course = row.course_number ?? row.course ?? null;
  return { id: row.id, name: row.name, code: row.code ?? null, specialty_slug: row.specialty_slug ?? null, course, course_number: course, semester: row.semester ?? null, is_active: row.is_active !== false, membership_role: row.membership_role ?? null };
}

groups.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  const membershipOnly = ["1", "true", "yes"].includes(String(c.req.query("mine") || "").toLowerCase());
  try {
    const codes = await roleCodes(c);
    const isAdminLike = codes.includes("admin") || codes.includes("moderator");
    if (isAdminLike && !membershipOnly) {
      let { data, error } = await db.from("groups").select("id,name,code,specialty_slug,course_number,is_active").order("name", { ascending: true }).limit(500);
      if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Groups unavailable", 503, rid); return c.json(body, status as 503); }
      return c.json(ok({ items: (data || []).map(mapGroup), source: "all" }, rid));
    }
    const { data, error } = await db.from("group_memberships").select("group_id,role_in_group,groups(id,name,code,specialty_slug,course_number,is_active)").eq("user_id", user.id).eq("is_active", true).limit(50);
    if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Groups unavailable", 503, rid); return c.json(body, status as 503); }
    const items = (data || []).map((row: any) => { const g = rel(row.groups); if (!g || g.is_active === false) return null; return mapGroup({ ...g, membership_role: row.role_in_group }); }).filter(Boolean);
    return c.json(ok({ items, source: "memberships" }, rid));
  } catch { const { body, status } = fail("DB_UNAVAILABLE", "Groups unavailable", 503, rid); return c.json(body, status as 503); }
});

groups.get("/:id", requireAuth, async (c) => {
  const rid = requestId(); const db = c.get("supabase"); const id = String(c.req.param("id") ?? "");
  if (!UUID.test(id)) { const { body, status } = fail("VALIDATION_ERROR", "Bad id", 422, rid); return c.json(body, status as 422); }
  const { data, error } = await db.from("groups").select("id,name,code,specialty_slug,course_number,is_active").eq("id", id).maybeSingle();
  if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Group unavailable", 503, rid); return c.json(body, status as 503); }
  if (!data) { const { body, status } = fail("NOT_FOUND", "Not found", 404, rid); return c.json(body, status as 404); }
  return c.json(ok(mapGroup(data), rid));
});

groups.post("/", requireAuth, async (c) => {
  const rid = requestId(); const db = c.get("supabase");
  if (!(await isManager(c))) { const { body, status } = fail("FORBIDDEN", "Forbidden", 403, rid); return c.json(body, status as 403); }
  let input: any = {}; try { input = await c.req.json(); } catch {}
  const name = String(input.name || "").trim();
  if (!name) { const { body, status } = fail("VALIDATION_ERROR", "name required", 422, rid); return c.json(body, status as 422); }
  const course = input.course_number != null ? Number(input.course_number) : input.course != null ? Number(input.course) : null;
  const row: any = { name, code: input.code != null ? String(input.code).slice(0, 50) : null, specialty_slug: input.specialty_slug != null ? String(input.specialty_slug).slice(0, 100) : null, is_active: input.is_active !== false };
  if (course != null && Number.isFinite(course)) row.course_number = course;
  const { data, error } = await db.from("groups").insert(row).select("*").maybeSingle();
  if (error) { const { body, status } = fail("DB_ERROR", error.message || "create failed", 503, rid); return c.json(body, status as 503); }
  return c.json(ok({ item: mapGroup(data) }, rid), 201);
});

groups.patch("/:id", requireAuth, async (c) => {
  const rid = requestId(); const db = c.get("supabase"); const id = String(c.req.param("id") ?? "");
  if (!UUID.test(id)) { const { body, status } = fail("VALIDATION_ERROR", "Bad id", 422, rid); return c.json(body, status as 422); }
  if (!(await isManager(c))) { const { body, status } = fail("FORBIDDEN", "Forbidden", 403, rid); return c.json(body, status as 403); }
  let input: any = {}; try { input = await c.req.json(); } catch {}
  const patch: any = {};
  if (input.name != null) patch.name = String(input.name).trim();
  if (input.code != null) patch.code = String(input.code).slice(0, 50);
  if (input.is_active != null) patch.is_active = Boolean(input.is_active);
  const course = input.course_number != null ? Number(input.course_number) : input.course != null ? Number(input.course) : undefined;
  if (course !== undefined && Number.isFinite(course)) patch.course_number = course;
  if (!Object.keys(patch).length) { const { body, status } = fail("VALIDATION_ERROR", "No fields", 422, rid); return c.json(body, status as 422); }
  const { data, error } = await db.from("groups").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) { const { body, status } = fail("DB_ERROR", error.message || "update failed", 503, rid); return c.json(body, status as 503); }
  if (!data) { const { body, status } = fail("NOT_FOUND", "Not found", 404, rid); return c.json(body, status as 404); }
  return c.json(ok({ item: mapGroup(data) }, rid));
});

groups.delete("/:id", requireAuth, async (c) => {
  const rid = requestId(); const db = c.get("supabase"); const id = String(c.req.param("id") ?? "");
  if (!UUID.test(id)) { const { body, status } = fail("VALIDATION_ERROR", "Bad id", 422, rid); return c.json(body, status as 422); }
  if (!(await isManager(c))) { const { body, status } = fail("FORBIDDEN", "Forbidden", 403, rid); return c.json(body, status as 403); }
  const { data, error } = await db.from("groups").update({ is_active: false }).eq("id", id).select("id").maybeSingle();
  if (error) { const { body, status } = fail("DB_ERROR", error.message || "delete failed", 503, rid); return c.json(body, status as 503); }
  if (!data) { const { body, status } = fail("NOT_FOUND", "Not found", 404, rid); return c.json(body, status as 404); }
  return c.json(ok({ deleted: true, id }, rid));
});

export default groups;
