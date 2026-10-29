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
  return { id: row.id, name: row.name, code: row.code ?? null, specialty_slug: row.specialty_slug ?? null, course, course_number: course, semester: row.semester ?? null, is_active: row.is_active !== false, member_count: Number(row.member_count ?? 0), membership_role: row.membership_role ?? null };
}

groups.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  const membershipOnly = ["1", "true", "yes"].includes(String(c.req.query("mine") || "").toLowerCase());
  // GET /groups — справочник для выбора группы. Удалённая группа
  // (is_active=false) не должна попадать в списки: иначе «архив» выглядел
  // как «удаление не сработало». Архив по-прежнему доступен через админ-консоль БД.
  const includeInactive = ["1", "true", "yes"].includes(String(c.req.query("include_inactive") || "").toLowerCase());
  try {
    const codes = await roleCodes(c);
    const isAdminLike = codes.some((code) => MANAGERS.includes(code));
    if (isAdminLike && !membershipOnly) {
      let listQuery = db.from("groups").select("id,name,code,specialty_slug,course_number,is_active").order("name", { ascending: true }).limit(500);
      if (!includeInactive) listQuery = listQuery.eq("is_active", true);
      const { data, error } = await listQuery;
      if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Groups unavailable", 503, rid); return c.json(body, status as 503); }
      const items = (data || []).map(mapGroup).filter((item): item is NonNullable<typeof item> => Boolean(item));
      // Размер группы нужен админской странице «Предметы и группы», чтобы
      // было видно, где есть люди, а где пусто — без N+1 запросов.
      const { data: counts, error: countsError } = await db.from("group_memberships").select("group_id").eq("is_active", true).limit(20000);
      if (!countsError && Array.isArray(counts)) {
        const size = new Map<string, number>();
        for (const row of counts) size.set(String(row.group_id), (size.get(String(row.group_id)) || 0) + 1);
        for (const item of items) item.member_count = size.get(String(item.id)) || 0;
      }
      return c.json(ok({ items, source: "all" }, rid));
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
  const { data: group, error: readError } = await db.from("groups").select("id,name").eq("id", id).maybeSingle();
  if (readError) { const { body, status } = fail("DB_UNAVAILABLE", "Group unavailable", 503, rid); return c.json(body, status as 503); }
  if (!group) { const { body, status } = fail("NOT_FOUND", "Not found", 404, rid); return c.json(body, status as 404); }
  // Группу с людьми молча «архивировать» нельзя: студент оставался в группе,
  // а интерфейс рапортовал об удалении. Сначала переводим/убираем студентов.
  const { count, error: countError } = await db.from("group_memberships")
    .select("id", { count: "exact", head: true }).eq("group_id", id).eq("is_active", true);
  if (countError) { const { body, status } = fail("DB_UNAVAILABLE", "Group unavailable", 503, rid); return c.json(body, status as 503); }
  const members = Number(count ?? 0);
  if (members > 0) {
    const { body, status } = fail(
      "GROUP_HAS_MEMBERS",
      `В группе ${members} чел. Переведите студентов в другую группу или уберите их, затем удаляйте.`,
      409, rid, { member_count: members }
    );
    return c.json(body, status as 409);
  }
  const { error: deleteError } = await db.from("groups").delete().eq("id", id);
  if (!deleteError) return c.json(ok({ deleted: true, id, mode: "deleted" }, rid));
  // Физическое удаление может упереться в FK (журнал, расписание, приглашения).
  // В этом случае группа уходит в архив и больше не показывается в справочнике.
  if (String((deleteError as any).code || "") === "23503") {
    const { error: archiveError } = await db.from("groups").update({ is_active: false }).eq("id", id);
    if (archiveError) { const { body, status } = fail("DB_ERROR", archiveError.message || "delete failed", 503, rid); return c.json(body, status as 503); }
    return c.json(ok({ deleted: true, id, mode: "archived" }, rid));
  }
  const { body, status } = fail("DB_ERROR", deleteError.message || "delete failed", 503, rid);
  return c.json(body, status as 503);
});

function mapMember(row: any) {
  const u = rel(row.users) || {};
  return {
    membership_id: row.id,
    user_id: u.id ?? row.user_id ?? null,
    name: u.display_name || u.full_name || u.email || "Студент",
    email: u.email ?? null,
    course_number: u.course_number ?? null,
    semester: u.semester ?? null,
    role: row.role_in_group ?? null,
  };
}

// Состав группы: без него админка не может ни добавить студента, ни убрать, ни
// перевести — и удаление группы упиралось в непонятную ошибку.
groups.get("/:id/members", requireAuth, async (c) => {
  const rid = requestId(); const db = c.get("supabase"); const id = String(c.req.param("id") ?? "");
  if (!UUID.test(id)) { const { body, status } = fail("VALIDATION_ERROR", "Bad id", 422, rid); return c.json(body, status as 422); }
  if (!(await isManager(c))) { const { body, status } = fail("FORBIDDEN", "Forbidden", 403, rid); return c.json(body, status as 403); }
  const { data, error } = await db.from("group_memberships")
    .select("id,user_id,role_in_group,users(id,email,full_name,display_name,course_number,semester)")
    .eq("group_id", id).eq("is_active", true).limit(500);
  if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Members unavailable", 503, rid); return c.json(body, status as 503); }
  const items = (data || []).map(mapMember).filter((m: any) => m.user_id);
  items.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), "ru"));
  return c.json(ok({ items, total: items.length }, rid));
});

groups.post("/:id/members", requireAuth, async (c) => {
  const rid = requestId(); const db = c.get("supabase"); const id = String(c.req.param("id") ?? "");
  if (!UUID.test(id)) { const { body, status } = fail("VALIDATION_ERROR", "Bad id", 422, rid); return c.json(body, status as 422); }
  if (!(await isManager(c))) { const { body, status } = fail("FORBIDDEN", "Forbidden", 403, rid); return c.json(body, status as 403); }
  let input: any = {}; try { input = await c.req.json(); } catch {}
  const userId = input.user_id != null ? String(input.user_id).trim() : "";
  const rawEmail = input.email != null ? String(input.email).trim().toLowerCase() : "";
  if (!userId && !rawEmail) { const { body, status } = fail("VALIDATION_ERROR", "Укажите email или user_id", 422, rid); return c.json(body, status as 422); }
  const { data: group, error: groupError } = await db.from("groups").select("id,is_active").eq("id", id).maybeSingle();
  if (groupError) { const { body, status } = fail("DB_UNAVAILABLE", "Group unavailable", 503, rid); return c.json(body, status as 503); }
  if (!group) { const { body, status } = fail("NOT_FOUND", "Группа не найдена", 404, rid); return c.json(body, status as 404); }
  let userQuery = db.from("users").select("id,email,full_name,display_name,course_number,semester").limit(2);
  userQuery = userId && UUID.test(userId) ? userQuery.eq("id", userId) : userQuery.ilike("email", rawEmail);
  const { data: users, error: userError } = await userQuery;
  if (userError) { const { body, status } = fail("DB_UNAVAILABLE", "User unavailable", 503, rid); return c.json(body, status as 503); }
  const target = (users || [])[0];
  if (!target) { const { body, status } = fail("USER_NOT_FOUND", userId ? "Пользователь не найден" : `Нет пользователя с email ${rawEmail}`, 404, rid); return c.json(body, status as 404); }
  // В одной группе — один активный член; остальные активные членства снимаем,
  // иначе студент одновременно числился в двух группах.
  const { error: clearError } = await db.from("group_memberships")
    .update({ is_active: false }).eq("user_id", target.id).eq("is_active", true).neq("group_id", id);
  if (clearError) { const { body, status } = fail("DB_ERROR", clearError.message || "move failed", 503, rid); return c.json(body, status as 503); }
  const { data: existing } = await db.from("group_memberships")
    .select("id").eq("group_id", id).eq("user_id", target.id).limit(1);
  const membershipId = (existing || [])[0]?.id;
  const write = membershipId
    ? db.from("group_memberships").update({ is_active: true }).eq("id", membershipId).select("id").maybeSingle()
    : db.from("group_memberships").insert({ group_id: id, user_id: target.id, is_active: true }).select("id").maybeSingle();
  const { data: membership, error: writeError } = await write;
  if (writeError) { const { body, status } = fail("DB_ERROR", writeError.message || "add failed", 503, rid); return c.json(body, status as 503); }
  return c.json(ok({ membership_id: membership?.id ?? null, user_id: target.id, group_id: id, moved: true }, rid), 201);
});

groups.delete("/:id/members/:userId", requireAuth, async (c) => {
  const rid = requestId(); const db = c.get("supabase");
  const id = String(c.req.param("id") ?? ""); const userId = String(c.req.param("userId") ?? "");
  if (!UUID.test(id) || !UUID.test(userId)) { const { body, status } = fail("VALIDATION_ERROR", "Bad id", 422, rid); return c.json(body, status as 422); }
  if (!(await isManager(c))) { const { body, status } = fail("FORBIDDEN", "Forbidden", 403, rid); return c.json(body, status as 403); }
  const { data, error } = await db.from("group_memberships")
    .update({ is_active: false }).eq("group_id", id).eq("user_id", userId).eq("is_active", true).select("id");
  if (error) { const { body, status } = fail("DB_ERROR", error.message || "remove failed", 503, rid); return c.json(body, status as 503); }
  if (!(data || []).length) { const { body, status } = fail("NOT_FOUND", "Студента нет в этой группе", 404, rid); return c.json(body, status as 404); }
  return c.json(ok({ removed: true, group_id: id, user_id: userId }, rid));
});

export default groups;
