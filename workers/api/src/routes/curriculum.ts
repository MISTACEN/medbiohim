import { Hono } from "hono";
import type { Env } from "../env";
import { ok, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";

const curriculum = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const ITEM_COLS =
  "id,subject_id,module_id,topic_id,parent_id,academic_year_id,session_id,course_number,semester,item_type,title,description,planned_date,due_at,order_index,is_required,is_active,source,metadata,created_at,updated_at";
const ITEM_COLS_WITH_SUBJECT = `${ITEM_COLS},subjects(name,slug,course_number,semester)`;

async function loadCurriculumItems(db: any) {
  // Prefer embed; if PostgREST relationship fails, fall back to plain rows.
  let result = await db
    .from("curriculum_items")
    .select(ITEM_COLS_WITH_SUBJECT)
    .eq("is_active", true)
    .order("course_number", { ascending: true })
    .order("semester", { ascending: true })
    .order("order_index", { ascending: true })
    .limit(1000);
  if (result.error) {
    console.warn("[curriculum] embed select failed", String(result.error.message || "").slice(0, 160));
    result = await db
      .from("curriculum_items")
      .select(ITEM_COLS)
      .eq("is_active", true)
      .order("course_number", { ascending: true })
      .order("semester", { ascending: true })
      .order("order_index", { ascending: true })
      .limit(1000);
  }
  return result;
}

curriculum.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const supabase = c.get("supabase");

  try {
    let { data, error } = await loadCurriculumItems(supabase);

    // RLS/empty: try service role once so students still see the shared plan.
    if ((error || !(data || []).length) && createServiceClient(c.env)) {
      const service = createServiceClient(c.env)!;
      const fb = await loadCurriculumItems(service);
      if (!fb.error && (fb.data || []).length) {
        return c.json(
          ok(
            {
              items: fb.data || [],
              source: "supabase_curriculum",
              via: "service",
            },
            rid,
          ),
        );
      }
      if (fb.error && !error) error = fb.error;
      if ((fb.data || []).length && !(data || []).length) data = fb.data;
    }

    if (error) {
      console.error("[curriculum]", String(error.message || error).slice(0, 200));
      // Soft-fail: page shows empty state instead of white-screen / hard 503.
      return c.json(
        ok(
          {
            items: [],
            source: "supabase_curriculum",
            degraded: true,
            service_notice: "Учебный план временно недоступен. Обновите страницу позже.",
          },
          rid,
        ),
      );
    }

    return c.json(
      ok(
        {
          items: data || [],
          source: "supabase_curriculum",
          count: (data || []).length,
        },
        rid,
      ),
    );
  } catch (err) {
    console.error("[curriculum]", err);
    return c.json(
      ok(
        {
          items: [],
          source: "supabase_curriculum",
          degraded: true,
          service_notice: "Учебный план временно недоступен.",
        },
        rid,
      ),
    );
  }
});

export default curriculum;
