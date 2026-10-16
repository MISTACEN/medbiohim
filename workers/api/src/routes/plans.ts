import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const plans = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

plans.get("/subjects-catalog", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("subjects")
      .select("id,slug,name,short_name,course_number,semester,specialty_slug,control_type,credits,total_hours,color_hex")
      .eq("is_active", true)
      .limit(300);
    if (error) {
      console.error("[plans:subjects-catalog]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Каталог недоступен", 503, rid);
      return c.json(body, status as 503);
    }
    const items = (data || []).map((item) => ({
      ...item,
      title: item.short_name || item.name,
      course: item.course_number,
    }));
    return c.json(ok({ items }, rid));
  } catch (error) {
    console.error("[plans:subjects-catalog]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Каталог недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

plans.get("/subject-plans", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("curriculum_items")
      .select("subject_id,course_number,semester,subjects(slug,name)")
      .eq("is_active", true)
      .limit(500);
    if (error) {
      console.error("[plans:list]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Учебные планы недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    const unique = new Map<string, { slug: string; subject_slug: string; title: string; course: number | null; semester: number | null }>();
    for (const row of data || []) {
      const subject = row.subjects as unknown as { slug?: string | null; name?: string | null } | null;
      if (!subject?.slug) continue;
      if (!unique.has(subject.slug)) {
        unique.set(subject.slug, {
          slug: subject.slug,
          subject_slug: subject.slug,
          title: subject.name || subject.slug,
          course: row.course_number ?? null,
          semester: row.semester ?? null,
        });
      }
    }
    return c.json(ok({ items: [...unique.values()] }, rid));
  } catch (error) {
    console.error("[plans:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Учебные планы недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

plans.get("/subject-plans/:slug", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const slug = c.req.param("slug") || "";
  try {
    const requestedCourse = Number(c.req.query("course") || 0);
    const requestedSemester = Number(c.req.query("semester") || 0);
    let subjectQuery = supabase
      .from("subjects")
      .select("id,slug,name,course_number,semester,control_type")
      .eq("slug", slug)
      .eq("is_active", true);
    if (requestedCourse > 0) subjectQuery = subjectQuery.eq("course_number", requestedCourse);
    if (requestedSemester > 0) subjectQuery = subjectQuery.eq("semester", requestedSemester);
    const { data: subjectRows, error: subjectError } = await subjectQuery
      .order("course_number", { ascending: true })
      .order("semester", { ascending: true })
      .limit(1);
    const subject = subjectRows?.[0] || null;
    if (subjectError || !subject) {
      const { body, status } = fail("NOT_FOUND", "Учебный план не найден", 404, rid);
      return c.json(body, status as 404);
    }
    const { data: items, error } = await supabase
      .from("curriculum_items")
      .select("id,title,description,item_type,planned_date,due_at,order_index,is_required,source,metadata,module_id,topic_id,course_number,semester")
      .eq("subject_id", subject.id)
      .eq("is_active", true)
      .order("order_index", { ascending: true })
      .limit(500);
    if (error) {
      console.error("[plans:detail]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось загрузить учебный план", 503, rid);
      return c.json(body, status as 503);
    }
    const weeks = (items || []).map((item: any, index: number) => {
      const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
      return {
        id: item.id,
        date: item.planned_date || metadata.date || null,
        week: metadata.week ?? index + 1,
        lecture: item.item_type === "lecture" ? item.title : (metadata.lecture || null),
        practice: ["practice", "lab", "seminar"].includes(String(item.item_type || "").toLowerCase())
          ? item.title
          : (metadata.practice || null),
        title: item.title,
        description: item.description,
        item_type: item.item_type,
        is_required: item.is_required,
      };
    });
    return c.json(ok({
      slug: subject.slug,
      subject_slug: subject.slug,
      title: subject.name,
      control: subject.control_type ?? null,
      course_number: subject.course_number,
      semester: subject.semester,
      items: items || [],
      weeks,
    }, rid));
  } catch (error) {
    console.error("[plans:detail]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Учебный план недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

plans.get("/subject-materials", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");
  const subject = c.req.query("subject_id") || c.req.query("subject_slug");
  try {
    let query = supabase
      .from("materials")
      .select("id,title,type,subject_id,module_id,topic_id,file_id,external_url,content_html,source_key,order_index,is_published,created_at")
      .eq("is_published", true)
      .limit(200);
    if (subject) {
      if (/^[0-9a-f-]{36}$/i.test(subject)) {
        query = query.eq("subject_id", subject);
      } else {
        const { data: subjectRow } = await supabase.from("subjects").select("id").eq("slug", subject).maybeSingle();
        if (!subjectRow?.id) return c.json(ok({ items: [] }, rid));
        query = query.eq("subject_id", subjectRow.id);
      }
    }
    const { data, error } = await query.order("order_index", { ascending: true });
    if (error) {
      console.error("[plans:materials]", error.message);
      const { body, status } = fail("DB_UNAVAILABLE", "Материалы недоступны", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ items: data || [] }, rid));
  } catch (error) {
    console.error("[plans:materials]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Материалы недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

export default plans;
