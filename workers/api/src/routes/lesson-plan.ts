import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

/**
 * GET /api/v1/lesson-plan
 *
 * Frontend: getLessonPlan({ subject_slug?, subject?, date? })
 * Used by schedule page when opening a lesson card.
 *
 * Response shape (legacy JS / PHP parity):
 * {
 *   lesson: SubjectPlanWeek | null,
 *   weeks: SubjectPlanWeek[],
 *   plan_meta: { subject, subject_slug, control, semester } | null
 * }
 */

const lessonPlan = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const relation = (value: unknown) => (Array.isArray(value) ? value[0] : value);

lessonPlan.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");

  const requestedSlug = String(c.req.query("subject_slug") || "").trim();
  const requestedSubject = String(c.req.query("subject") || "").trim();
  const requestedDate = String(c.req.query("date") || "").trim();

  try {
    let slug = requestedSlug;

    if (!slug && requestedSubject) {
      const { data: subjects, error } = await db
        .from("subjects")
        .select("id,slug,name")
        .eq("is_active", true)
        .limit(300);
      if (error) throw error;
      const needle = requestedSubject.toLocaleLowerCase("ru");
      const match = (subjects || []).find((s: any) => {
        const name = String(s?.name || "").toLocaleLowerCase("ru");
        const sSlug = String(s?.slug || "").toLocaleLowerCase("ru");
        return name === needle || sSlug === needle || name.includes(needle);
      });
      slug = String(match?.slug || "").trim();
    }

    if (!slug) {
      return c.json(ok({ lesson: null, weeks: [], plan_meta: null }, rid));
    }

    // В БД один предмет может занимать несколько активных строк под одним слагом
    // (1к/2с, 2к/4с, 2к/3с). maybeSingle() на нескольких строках даёт PGRST116
    // и маскированный 503 (живой инцидент 27.10) — выбираем детерминированно,
    // как plans.ts: младший курс/семестр.
    const { data: subjectRows, error: subjectError } = await db
      .from("subjects")
      .select("id,slug,name,course_number,semester,control_type")
      .eq("slug", slug)
      .eq("is_active", true)
      .order("course_number", { ascending: true })
      .order("semester", { ascending: true })
      .limit(1);
    const subject = subjectRows?.[0] || null;

    if (subjectError) throw subjectError;
    if (!subject) {
      return c.json(ok({ lesson: null, weeks: [], plan_meta: null }, rid));
    }

    const { data: items, error: itemsError } = await db
      .from("curriculum_items")
      .select(
        "id,title,description,item_type,planned_date,due_at,order_index,is_required,metadata,module_id,topic_id,course_number,semester"
      )
      .eq("subject_id", subject.id)
      .eq("is_active", true)
      .order("order_index", { ascending: true })
      .limit(500);

    if (itemsError) {
      console.error("[lesson-plan:items]", itemsError.message);
      return c.json(
        ok(
          {
            lesson: null,
            weeks: [],
            plan_meta: {
              subject: subject.name,
              subject_slug: subject.slug,
              control: subject.control_type ?? null,
              semester: subject.semester ?? null,
            },
          },
          rid
        )
      );
    }

    const weeks = (items || []).map((row: any, index: number) => {
      const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
      const date =
        row.planned_date ||
        (typeof meta.date === "string" ? meta.date : null) ||
        null;
      const lecture =
        row.item_type === "lecture"
          ? row.title
          : typeof meta.lecture === "string"
            ? meta.lecture
            : null;
      const practice =
        row.item_type === "practice" || row.item_type === "lab"
          ? row.title
          : typeof meta.practice === "string"
            ? meta.practice
            : null;
      return {
        id: row.id,
        week: index + 1,
        date,
        lecture,
        practice,
        title: row.title,
        description: row.description,
        item_type: row.item_type,
        is_required: row.is_required === true,
      };
    });

    const lesson = requestedDate
      ? weeks.find((w: any) => String(w.date || "") === requestedDate) || null
      : null;

    return c.json(
      ok(
        {
          lesson,
          weeks,
          plan_meta: {
            subject: subject.name,
            subject_slug: subject.slug,
            control: subject.control_type ?? null,
            semester: subject.semester ?? null,
          },
        },
        rid
      )
    );
  } catch (error) {
    console.error("[lesson-plan]", error);
    const { body, status } = fail(
      "DB_UNAVAILABLE",
      "План занятия временно недоступен",
      503,
      rid
    );
    return c.json(body, status as 503);
  }
});

export default lessonPlan;
