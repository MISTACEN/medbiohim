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
  const slug = String(c.req.param("slug") || "").trim().toLowerCase();
  const allowedPlanSlugs = new Set(["histology", "physiology", "organic_chemistry", "chemistry_organic_physical"]);
  const databaseSlug = slug === "organic_chemistry" ? "chemistry_organic_physical" : slug;

  const parseOptionalNumber = (value: string | undefined, max: number) => {
    if (value == null || value.trim() === "") return null;
    const number = Number(value);
    return Number.isInteger(number) && number > 0 && number <= max ? number : Number.NaN;
  };
  const requestedCourse = parseOptionalNumber(c.req.query("course"), 8);
  const requestedSemester = parseOptionalNumber(c.req.query("semester"), 16);
  if (Number.isNaN(requestedCourse) || Number.isNaN(requestedSemester)) {
    const { body, status } = fail("VALIDATION_ERROR", "Invalid course or semester filter", 422, rid);
    return c.json(body, status as 422);
  }

  try {
    // Curated PHP plans are private in site_content. Read only the allow-listed
    // plan via an authenticated RPC; never grant students direct CMS table access.
    if (allowedPlanSlugs.has(slug)) {
      const { data: restored, error: rpcError } = await supabase.rpc("medbiohim_get_student_subject_plan", {
        p_subject_slug: slug,
        p_course_number: requestedCourse,
        p_semester: requestedSemester,
      });
      if (rpcError) {
        if (String(rpcError.code || "") === "42501") {
          const { body, status } = fail("FORBIDDEN", "Доступ к учебному плану доступен участникам МБХ", 403, rid);
          return c.json(body, status as 403);
        }
        // Keep the live curriculum fallback usable while an older Worker/RPC
        // version is being synchronized; do not fall back on explicit denial.
        console.error("[plans:student-rpc]", {
          code: String(rpcError.code || "").slice(0, 32),
        });
      } else {
        const subject = restored?.subject && typeof restored.subject === "object" ? restored.subject : null;
        const sourcePlan = restored?.plan && typeof restored.plan === "object" ? restored.plan : null;
        if (subject && sourcePlan && Array.isArray(sourcePlan.weeks) && sourcePlan.weeks.length > 0) {
          const weeks = sourcePlan.weeks.map((week: any, index: number) => ({
            ...week,
            n: week?.n ?? week?.week ?? index + 1,
            week: week?.week ?? week?.n ?? index + 1,
            date: week?.date || week?.planned_date || null,
            lecture: week?.lecture || "",
            practice: week?.practice || "",
            preparations: Array.isArray(week?.preparations) ? week.preparations : [],
          }));
          const plan = {
            ...sourcePlan,
            subject: subject.name || sourcePlan.subject || slug,
            subject_slug: subject.slug || databaseSlug,
            description: subject.description || sourcePlan.description || "",
            course_number: subject.course_number ?? sourcePlan.course ?? requestedCourse,
            semester: subject.semester ?? sourcePlan.semester ?? requestedSemester,
            control: subject.control_type ?? sourcePlan.control ?? sourcePlan.control_type ?? null,
            hours: {
              lecture: subject.lecture_hours ?? sourcePlan.hours?.lecture ?? sourcePlan.lecture_hours ?? null,
              practice: subject.practice_hours ?? sourcePlan.hours?.practice ?? sourcePlan.practice_hours ?? null,
              self_study: subject.self_study_hours ?? sourcePlan.hours?.self_study ?? sourcePlan.self_study_hours ?? null,
              total: subject.total_hours ?? sourcePlan.hours?.total ?? sourcePlan.total_hours ?? null,
            },
            total_hours: subject.total_hours ?? sourcePlan.total_hours ?? sourcePlan.hours?.total ?? null,
            credits: subject.credits ?? sourcePlan.credits ?? null,
            note: sourcePlan.note || sourcePlan.source_note || "",
            source: "site_content",
            weeks,
          };
          return c.json(ok({
            plan,
            subject,
            schedule_count: null,
            schedule_sample: [],
            available: true,
            source: "site_content",
          }, rid));
        }
      }
    }

    let subjectQuery = supabase
      .from("subjects")
      .select("id,slug,name,course_number,semester,control_type,total_hours,credits,lecture_hours,practice_hours,self_study_hours,description")
      .eq("slug", databaseSlug)
      .eq("is_active", true);
    if (requestedCourse != null) subjectQuery = subjectQuery.eq("course_number", requestedCourse);
    if (requestedSemester != null) subjectQuery = subjectQuery.eq("semester", requestedSemester);
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
      .order("planned_date", { ascending: true, nullsFirst: false })
      .order("order_index", { ascending: true })
      .limit(500);
    if (error) {
      console.error("[plans:detail]", { code: String(error.code || "").slice(0, 32) });
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось загрузить учебный план", 503, rid);
      return c.json(body, status as 503);
    }
    const weeks = (items || []).map((item: any, index: number) => {
      const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
      return {
        id: item.id,
        date: item.planned_date || metadata.date || null,
        week: metadata.week ?? metadata.calendar_week ?? index + 1,
        lecture: item.item_type === "lecture" ? item.title : (metadata.lecture || null),
        practice: ["practice", "lab", "seminar"].includes(String(item.item_type || "").toLowerCase())
          ? item.title
          : (metadata.practice || null),
        title: item.title,
        description: item.description,
        preparations: Array.isArray(metadata.preparations) ? metadata.preparations : [],
        item_type: item.item_type,
        is_required: item.is_required,
      };
    });
    return c.json(ok({
      plan: {
        subject: subject.name,
        subject_slug: subject.slug,
        title: subject.name,
        control: subject.control_type ?? null,
        course_number: subject.course_number ?? null,
        semester: subject.semester ?? null,
        total_hours: subject.total_hours ?? null,
        credits: subject.credits ?? null,
        hours: {
          lecture: subject.lecture_hours ?? null,
          practice: subject.practice_hours ?? null,
          self_study: subject.self_study_hours ?? null,
          total: subject.total_hours ?? null,
        },
        items: items || [],
        weeks,
        source: "supabase_curriculum",
      },
      subject,
      available: weeks.length > 0,
      source: "supabase_curriculum",
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
