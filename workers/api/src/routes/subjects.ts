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
// Кириллица раньше просто вырезалась, и все русские названия получали слаг
// "-" — дальше такие предметы не различить ни в адресе, ни при удалении.
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
export function slugify(raw: string): string {
  const transliterated = raw.trim().toLowerCase().split("").map((ch) => TRANSLIT[ch] ?? ch).join("");
  const slug = transliterated.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  return slug || `subject-${Date.now().toString(36)}`;
}
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
  // Админке нужен архив, чтобы удалённый предмет можно было вернуть. Обычный
  // каталог по-прежнему видит только активные строки.
  const includeInactive = ["1", "true", "yes"].includes(String(c.req.query("include_inactive") || "").toLowerCase());
  let q = db.from("subjects").select("id,name,slug,course_number,semester,color_hex,is_active,specialty_slug,control_type,credits,total_hours,lecture_hours,practice_hours,self_study_hours").order("name", { ascending: true }).limit(500);
  if (!includeInactive) q = q.eq("is_active", true);
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
    // 1) точный слаг помогает, только если он выделяет одну строку
    //    (смешанные канонические/алиасные записи);
    // 2) иначе строка курса/семестра студента;
    // 3) иначе честный 409.
    const exact = (rows || []).filter((row: any) => String(row.slug || "") === id);
    if (exact.length === 1) {
      data = exact[0];
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

/**
 * План предмета с личным прогрессом по темам: темы модулей + мой статус
 * (topic_progress) + счётчики тестов (tests.topic_id) и вопросов к экзамену
 * (exam_questions.plan_topic_id) + даты занятий, привязанных к теме
 * (schedule_entries.topic_id). Всё одним ответом, чтобы вкладка «План» не
 * делала N+1. Прогресс читается только свой; правки плана и расписания его
 * никогда не перезаписывают.
 */
subjects.get("/:id/plan-progress", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const id = String(c.req.param("id") ?? "");

  const { data: rows, error } = UUID.test(id)
    ? await db.from("subjects").select("id").eq("id", id).limit(1)
    : await db.from("subjects").select("id").in("slug", slugVariants(id)).eq("is_active", true).limit(1);
  if (error) { const { body, status } = fail("DB_UNAVAILABLE", "Subject unavailable", 503, rid); return c.json(body, status as 503); }
  const subject = (rows || [])[0];
  if (!subject) { const { body, status } = fail("NOT_FOUND", "Not found", 404, rid); return c.json(body, status as 404); }
  const subjectId = String(subject.id);

  const { data: moduleRows, error: modulesError } = await db
    .from("modules")
    .select("id,title,order_index")
    .eq("subject_id", subjectId)
    .order("order_index", { ascending: true })
    .limit(200);
  if (modulesError) { const { body, status } = fail("DB_UNAVAILABLE", "Modules unavailable", 503, rid); return c.json(body, status as 503); }
  const moduleIds = (moduleRows || []).map((m: any) => String(m.id));

  let topicRows: any[] = [];
  if (moduleIds.length) {
    const { data, error: topicsError } = await db
      .from("topics")
      .select("id,module_id,title,order_index,is_published")
      .in("module_id", moduleIds)
      .order("order_index", { ascending: true })
      .limit(1000);
    if (topicsError) { const { body, status } = fail("DB_UNAVAILABLE", "Topics unavailable", 503, rid); return c.json(body, status as 503); }
    topicRows = data || [];
  }
  const topicIds = topicRows.map((t) => String(t.id));

  const [progressRes, testsRes, examRes, scheduleRes, materialsRes] = await Promise.all([
    topicIds.length
      ? db.from("topic_progress").select("topic_id,status,grade,note,attempts").eq("user_id", user.id).in("topic_id", topicIds)
      : Promise.resolve({ data: [] as any[], error: null as any }),
    db.from("tests").select("topic_id").eq("subject_id", subjectId).eq("is_published", true).is("archived_at", null).limit(2000),
    db.from("exam_questions").select("id,plan_topic_id").eq("subject_id", subjectId).eq("is_published", true).limit(3000),
    // Ближайшие занятия предмета: и привязанные к темам, и вообще (чтобы
    // вкладка «План» показывала «когда по расписанию» без ручной привязки).
    db.from("schedule_entries")
      .select("topic_id,date,type,start_time,is_cancelled,subject_name")
      .eq("subject_id", subjectId)
      .gte("date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
      .order("date", { ascending: true })
      .limit(400),
    // Материалы, привязанные к темам: из них считается «что ещё не открыто».
    db.from("materials")
      .select("id,topic_id,title,type,external_url,order_index")
      .eq("subject_id", subjectId)
      .eq("is_published", true)
      .not("topic_id", "is", null)
      .order("order_index", { ascending: true })
      .limit(2000),
  ]);
  if (progressRes.error || testsRes.error || examRes.error || scheduleRes.error || materialsRes.error) {
    console.error("[plan-progress] reads failed", { progress: progressRes.error, tests: testsRes.error, exam: examRes.error, schedule: scheduleRes.error, materials: materialsRes.error });
    const { body, status } = fail("DB_UNAVAILABLE", "Прогресс плана недоступен", 503, rid);
    return c.json(body, status as 503);
  }

  const materialRows = materialsRes.data || [];
  let openedIds = new Set<string>();
  if (materialRows.length) {
    const { data: views, error: viewsError } = await db
      .from("material_views")
      .select("material_id")
      .eq("user_id", user.id)
      .in("material_id", materialRows.map((m: any) => String(m.id)))
      .limit(5000);
    // Старая база без material_views не должна ломать весь план: тогда
    // считаем, что ничего не открыто, и честно показываем это.
    if (!viewsError) openedIds = new Set((views || []).map((v: any) => String(v.material_id)));
  }
  const materialsByTopic = new Map<string, any[]>();
  for (const row of materialRows) {
    const key = String(row.topic_id || "");
    if (!key) continue;
    if (!materialsByTopic.has(key)) materialsByTopic.set(key, []);
    materialsByTopic.get(key)!.push({
      id: String(row.id),
      title: row.title || "Материал",
      type: row.type || null,
      external_url: row.external_url || null,
      opened: openedIds.has(String(row.id)),
    });
  }

  const progressByTopic = new Map<string, any>();
  for (const row of progressRes.data || []) progressByTopic.set(String(row.topic_id), row);

  const testsCount = new Map<string, number>();
  for (const row of testsRes.data || []) {
    if (row.topic_id) testsCount.set(String(row.topic_id), (testsCount.get(String(row.topic_id)) || 0) + 1);
  }
  const examCount = new Map<string, number>();
  for (const row of examRes.data || []) {
    if (row.plan_topic_id) examCount.set(String(row.plan_topic_id), (examCount.get(String(row.plan_topic_id)) || 0) + 1);
  }
  const scheduleByTopic = new Map<string, any[]>();
  const upcoming: any[] = [];
  for (const row of scheduleRes.data || []) {
    upcoming.push(row);
    if (row.topic_id && !row.is_cancelled) {
      const key = String(row.topic_id);
      if (!scheduleByTopic.has(key)) scheduleByTopic.set(key, []);
      scheduleByTopic.get(key)!.push({ date: row.date, type: row.type, start_time: row.start_time, subject_name: row.subject_name });
    }
  }

  const items = topicRows.map((t) => {
    const progress = progressByTopic.get(String(t.id));
    const materials = materialsByTopic.get(String(t.id)) || [];
    return {
      topic_id: String(t.id),
      module_id: String(t.module_id),
      title: t.title,
      order_index: t.order_index,
      is_published: t.is_published !== false,
      status: progress?.status || "pending",
      grade: progress?.grade ?? null,
      note: progress?.note ?? null,
      attempts: progress?.attempts ?? 0,
      tests_count: testsCount.get(String(t.id)) || 0,
      exam_questions_count: examCount.get(String(t.id)) || 0,
      schedule_dates: scheduleByTopic.get(String(t.id)) || [],
      materials,
      materials_count: materials.length,
      unopened_materials_count: materials.filter((m: any) => !m.opened).length,
      unopened_materials: materials.filter((m: any) => !m.opened).map((m: any) => m.title),
    };
  });

  const summary = {
    total: items.length,
    passed: items.filter((i) => i.status === "passed").length,
    in_progress: items.filter((i) => i.status === "in_progress").length,
    failed_or_retake: items.filter((i) => i.status === "failed" || i.status === "retake_needed").length,
    pending: items.filter((i) => i.status === "pending").length,
    unopened_materials: items.reduce((sum, i) => sum + i.unopened_materials_count, 0),
  };

  return c.json(ok({
    subject_id: subjectId,
    modules: (moduleRows || []).map((m: any) => ({ id: String(m.id), title: m.title, order_index: m.order_index })),
    items,
    upcoming: upcoming.slice(0, 60),
    summary,
  }, rid));
});

subjects.post("/", requireAuth, async (c) => {
  const rid = requestId(); const db = c.get("supabase");
  if (!(await isManager(c))) { const { body, status } = fail("FORBIDDEN", "Forbidden", 403, rid); return c.json(body, status as 403); }
  let input: any = {}; try { input = await c.req.json(); } catch {}
  const name = String(input.name || "").trim();
  if (!name) { const { body, status } = fail("VALIDATION_ERROR", "name required", 422, rid); return c.json(body, status as 422); }
  const slug = slugify(String(input.slug || name));
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
  // Удаляется ровно та строка, которую выбрали в списке. Раньше архивировалось
  // всё slug-семейство, а у предметов с кириллическим названием слаг получался
  // одинаковым («анатомия» → "-"): удаление одной строки сносило десятки
  // соседних. Семейство по слагу остаётся только для новых корректных слагов.
  try {
    const { data: row, error: rowError } = await db.from("subjects").select("id,slug").eq("id", id).maybeSingle();
    if (rowError) { const { body, status } = fail("DB_ERROR", rowError.message || "delete failed", 503, rid); return c.json(body, status as 503); }
    if (!row) { const { body, status } = fail("NOT_FOUND", "Not found", 404, rid); return c.json(body, status as 404); }
    const slug = String(row.slug || "");
    const usableSlug = slug.length > 1 && /[a-z0-9]/.test(slug);
    const { data: archived, error: updateError } = await (usableSlug
      ? db.from("subjects").update({ is_active: false }).eq("slug", slug).select("id")
      : db.from("subjects").update({ is_active: false }).eq("id", id).select("id"));
    if (updateError) { const { body, status } = fail("DB_ERROR", updateError.message || "delete failed", 503, rid); return c.json(body, status as 503); }
    return c.json(ok({ deleted: true, id, archived: (archived || []).length }, rid));
  } catch {
    const { body, status } = fail("DB_ERROR", "delete failed", 503, rid); return c.json(body, status as 503);
  }
});

export default subjects;
