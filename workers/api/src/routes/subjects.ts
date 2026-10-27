import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const subjects = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGERS = ["admin", "moderator", "teacher"];
// Клиент канонизирует слаги (src/lib/subjectSlug.ts), а в БД могут лежать
// исходные слаги методички. Без алиасов на сервере GET /subjects/organic_chemistry
// отдавал 404, хотя предмет существовал под слагом chemistry_organic_physical.
const SLUG_ALIASES: Record<string, string> = {
  organic_chemistry: "chemistry_organic_physical",
  histology: "histology_cytology",
};
function slugVariants(raw: string): string[] {
  const variants = [raw];
  const alias = SLUG_ALIASES[raw];
  if (alias) variants.push(alias);
  for (const [short, long] of Object.entries(SLUG_ALIASES)) if (long === raw) variants.push(short);
  return variants;
}

async function isManager(c: any) {
  const user = c.get("user"); const db = c.get("supabase");
  const { data, error } = await db.from("user_roles").select("roles(code)").eq("user_id", user.id).limit(20);
  if (error) throw error;
  return (data || []).some((row: any) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return MANAGERS.includes(String(role?.code || "").toLowerCase());
  });
}

subjects.get("/", requireAuth, async (c) => {
  const rid = requestId(); const db = c.get("supabase");
  const course = c.req.query("course"); const semester = c.req.query("semester");
  let q = db.from("subjects").select("id,name,slug,course_number,semester,color_hex,is_active,specialty_slug,control_type,credits,total_hours,lecture_hours,practice_hours,self_study_hours").eq("is_active", true).order("name", { ascending: true }).limit(500);
  if (course) q = q.eq("course_number", Number(course));
  if (semester) q = q.eq("semester", Number(semester));
  const { data, error } = await q;
  if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Subjects unavailable", 503, rid); return c.json(body, status as 503); }
  return c.json(ok({ items: data || [] }, rid));
});

subjects.get("/:id/gradebook", requireAuth, async (c) => {
  const rid = requestId();
  const id = String(c.req.param("id") ?? "");
  return c.json(ok({
    subject_id: id,
    entries: [],
    students: [],
    columns: [],
    degraded: true,
    service_notice: "Журнал оценок пока в режиме совместимости (пустая выписка).",
  }, rid));
});

subjects.get("/:id", requireAuth, async (c) => {
  const rid = requestId(); const db = c.get("supabase"); const user = c.get("user");
  const id = String(c.req.param("id") ?? "");
  const query = UUID.test(id)
    ? db.from("subjects").select("*").eq("id", id).limit(2)
    : db.from("subjects").select("*").in("slug", slugVariants(id)).eq("is_active", true).limit(2);
  const { data: rows, error } = await query;
  if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Subject unavailable", 503, rid); return c.json(body, status as 503); }
  // В БД один предмет может занимать несколько активных строк (по курсу и
  // семестру) под одним и тем же слагом-алиасом. Сначала выигрывает точный
  // слаг; если его нет — выбираем строку курса/семестра студента; иначе
  // неоднозначность честно отдаётся как 409.
  let data = rows?.[0];
  if ((rows || []).length > 1) {
    const exact = (rows || []).find((row: any) => String(row.slug || "") === id);
    if (exact) {
      data = exact;
    } else {
      const course = Number(c.req.query("course")) || null;
      const semester = Number(c.req.query("semester")) || null;
      let profileCourse = course, profileSemester = semester;
      if (!profileCourse || !profileSemester) {
        const { data: profile } = await db.from("users")
          .select("course_number,semester").eq("id", user.id).maybeSingle();
        profileCourse = profileCourse || (profile as any)?.course_number || null;
        profileSemester = profileSemester || (profile as any)?.semester || null;
      }
      const candidates = (rows || []).filter((row: any) =>
        (profileCourse == null || Number(row.course_number) === Number(profileCourse)) &&
        (profileSemester == null || Number(row.semester) === Number(profileSemester)));
      if (candidates.length === 1) data = candidates[0];
      else { const { body, status } = fail("AMBIGUOUS_SUBJECT", "Предмет с таким адресом не уникален", 409, rid); return c.json(body, status as 409); }
    }
  }
  if (!data) { const { body, status } = fail("NOT_FOUND", "Not found", 404, rid); return c.json(body, status as 404); }
  return c.json(ok(data, rid));
});

subjects.post("/", requireAuth, async (c) => {
  const rid = requestId(); const db = c.get("supabase");
  if (!(await isManager(c))) { const { body, status } = fail("FORBIDDEN", "Forbidden", 403, rid); return c.json(body, status as 403); }
  let input: any = {}; try { input = await c.req.json(); } catch {}
  const name = String(input.name || "").trim();
  if (!name) { const { body, status } = fail("VALIDATION_ERROR", "name required", 422, rid); return c.json(body, status as 422); }
  const slug = String(input.slug || name).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 100);
  const row: any = { name, slug, is_active: input.is_active !== false };
  if (input.course_number != null || input.course != null) row.course_number = Number(input.course_number ?? input.course);
  if (input.semester != null) row.semester = Number(input.semester);
  if (input.color_hex != null) row.color_hex = String(input.color_hex).slice(0, 20);
  if (input.specialty_slug != null) row.specialty_slug = String(input.specialty_slug).slice(0, 100);
  const { data, error } = await db.from("subjects").insert(row).select("*").maybeSingle();
  if (error) { const { body, status } = fail("DB_ERROR", error.message || "create failed", 503, rid); return c.json(body, status as 503); }
  return c.json(ok({ item: data }, rid), 201);
});

subjects.patch("/:id", requireAuth, async (c) => {
  const rid = requestId(); const db = c.get("supabase"); const id = String(c.req.param("id") ?? "");
  if (!UUID.test(id)) { const { body, status } = fail("VALIDATION_ERROR", "Bad id", 422, rid); return c.json(body, status as 422); }
  if (!(await isManager(c))) { const { body, status } = fail("FORBIDDEN", "Forbidden", 403, rid); return c.json(body, status as 403); }
  let input: any = {}; try { input = await c.req.json(); } catch {}
  const patch: any = {};
  if (input.name != null) patch.name = String(input.name).trim();
  if (input.slug != null) patch.slug = String(input.slug).slice(0, 100);
  if (input.course_number != null || input.course != null) patch.course_number = Number(input.course_number ?? input.course);
  if (input.semester != null) patch.semester = Number(input.semester);
  if (input.is_active != null) patch.is_active = Boolean(input.is_active);
  if (!Object.keys(patch).length) { const { body, status } = fail("VALIDATION_ERROR", "No fields", 422, rid); return c.json(body, status as 422); }
  const { data, error } = await db.from("subjects").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) { const { body, status } = fail("DB_ERROR", error.message || "update failed", 503, rid); return c.json(body, status as 503); }
  if (!data) { const { body, status } = fail("NOT_FOUND", "Not found", 404, rid); return c.json(body, status as 404); }
  return c.json(ok({ item: data }, rid));
});

subjects.delete("/:id", requireAuth, async (c) => {
  const rid = requestId(); const db = c.get("supabase"); const id = String(c.req.param("id") ?? "");
  if (!UUID.test(id)) { const { body, status } = fail("VALIDATION_ERROR", "Bad id", 422, rid); return c.json(body, status as 422); }
  if (!(await isManager(c))) { const { body, status } = fail("FORBIDDEN", "Forbidden", 403, rid); return c.json(body, status as 403); }
  const { data, error } = await db.from("subjects").update({ is_active: false }).eq("id", id).select("id").maybeSingle();
  if (error) { const { body, status } = fail("DB_ERROR", error.message || "delete failed", 503, rid); return c.json(body, status as 503); }
  if (!data) { const { body, status } = fail("NOT_FOUND", "Not found", 404, rid); return c.json(body, status as 404); }
  return c.json(ok({ deleted: true, id }, rid));
});

export default subjects;
