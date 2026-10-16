import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const schedule = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const COURSE_RE = /^[1-6]$/;
const SEMESTER_RE = /^(?:[1-9]|1[0-2])$/;

const relation = (value: unknown) => (Array.isArray(value) ? value[0] : value);

function emptyMeta(extra: Record<string, unknown> = {}) {
  return {
    periods: [] as unknown[],
    duration_rules: [] as unknown[],
    timezone: "Asia/Vladivostok",
    generated_at: new Date().toISOString(),
    ...extra,
  };
}

function mapEntry(row: any) {
  const subject = relation(row?.subjects) as any;
  return {
    id: row.id,
    date: row.date ?? null,
    start_time: String(row.start_time || "").slice(0, 5),
    end_time: String(row.end_time || "").slice(0, 5),
    subject_id: row.subject_id ?? subject?.id ?? null,
    subject_name: row.subject_name || subject?.name || null,
    subject_slug: subject?.slug ?? row.subject_slug ?? null,
    color_hex: subject?.color_hex ?? row.color_hex ?? null,
    type: row.type || "other",
    building: row.building ?? null,
    room: row.room ?? null,
    notes: row.notes ?? null,
    academic_hours: row.academic_hours ?? null,
    week_parity: row.week_parity ?? null,
    is_cancelled: row.is_cancelled === true,
    is_makeup: row.is_makeup === true,
    breaks: Array.isArray(row.breaks) ? row.breaks : row.breaks ? [row.breaks] : [],
    schedule_id: row.schedule_id ?? null,
    session_id: row.session_id ?? null,
    attendance_status: row.attendance_status ?? null,
  };
}

schedule.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const from = c.req.query("from") || "";
  const to = c.req.query("to") || "";
  const requestedGroup = c.req.query("group_id") || "";

  if ((from && !YMD.test(from)) || (to && !YMD.test(to))) {
    const { body, status } = fail("VALIDATION_ERROR", "from/to должны быть датами YYYY-MM-DD", 422, rid);
    return c.json(body, status as 422);
  }
  if (requestedGroup && !UUID.test(requestedGroup)) {
    const { body, status } = fail("VALIDATION_ERROR", "group_id должен быть UUID", 422, rid);
    return c.json(body, status as 422);
  }

  try {
    const { data: memberships, error: membershipError } = await db
      .from("group_memberships")
      .select("group_id,groups(id,name,is_active)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(50);

    if (membershipError) throw membershipError;

    const groupIds = (memberships || [])
      .map((m: any) => {
        const g = relation(m.groups) as any;
        if (!m.group_id) return null;
        if (g && g.is_active === false) return null;
        return String(m.group_id);
      })
      .filter(Boolean) as string[];

    if (!groupIds.length) {
      return c.json(ok({ items: [], source: "supabase", notice: "no_active_group" }, rid));
    }

    let targetGroups = groupIds;
    if (requestedGroup) {
      if (!groupIds.includes(requestedGroup)) {
        const { body, status } = fail("FORBIDDEN", "Вы не состоите в указанной учебной группе", 403, rid);
        return c.json(body, status as 403);
      }
      targetGroups = [requestedGroup];
    }

    const { data: schedules, error: schedulesError } = await db
      .from("schedules")
      .select("id,group_id,semester,version,is_active")
      .in("group_id", targetGroups)
      .eq("is_active", true)
      .limit(40);

    if (schedulesError) throw schedulesError;

    const scheduleIds = (schedules || [])
      .map((s: any) => s.id)
      .filter((id: string) => UUID.test(String(id)));

    if (!scheduleIds.length) {
      return c.json(ok({ items: [], source: "supabase", notice: "no_active_schedule" }, rid));
    }

    let entryQuery = db
      .from("schedule_entries")
      .select(
        "id,date,start_time,end_time,subject_id,subject_name,type,building,room,notes,academic_hours,week_parity,is_cancelled,is_makeup,breaks,schedule_id,session_id,subjects(id,name,slug,color_hex)"
      )
      .in("schedule_id", scheduleIds)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(2000);

    if (from) entryQuery = entryQuery.gte("date", from);
    if (to) entryQuery = entryQuery.lte("date", to);

    const { data: entries, error: entriesError } = await entryQuery;
    if (entriesError) throw entriesError;

    const items = (entries || []).map(mapEntry);
    return c.json(ok({ items, source: "supabase" }, rid));
  } catch (error) {
    console.error("[schedule:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Расписание временно недоступно", 503, rid);
    return c.json(body, status as 503);
  }
});

schedule.get("/meta", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const course = String(c.req.query("course") || "").trim();
  const semester = String(c.req.query("semester") || "").trim();

  if ((course && !COURSE_RE.test(course)) || (semester && !SEMESTER_RE.test(semester))) {
    const { body, status } = fail("VALIDATION_ERROR", "course or semester filter is invalid", 422, rid);
    return c.json(body, status as 422);
  }

  try {
    let periodQuery = db
      .from("academic_calendar_periods")
      .select("id,title,type,start_date,end_date,notes,is_current,course_number,semester")
      .order("start_date", { ascending: true })
      .limit(500);

    let rulesQuery = db
      .from("subject_schedule_rules")
      .select("id,subject_id,subject_name,academic_hours,notes,course_number,semester")
      .order("subject_name", { ascending: true })
      .limit(500);

    if (course) {
      const courseNum = Number(course);
      periodQuery = periodQuery.eq("course_number", courseNum);
      rulesQuery = rulesQuery.eq("course_number", courseNum);
    }
    if (semester) {
      const semesterNum = Number(semester);
      periodQuery = periodQuery.eq("semester", semesterNum);
      rulesQuery = rulesQuery.eq("semester", semesterNum);
    }

    const [periodsResult, rulesResult] = await Promise.all([periodQuery, rulesQuery]);

    if (periodsResult.error) console.error("[schedule:meta:periods]", periodsResult.error.message);
    if (rulesResult.error) console.error("[schedule:meta:rules]", rulesResult.error.message);

    const periods = Array.isArray(periodsResult.data) ? periodsResult.data : [];
    const duration_rules = Array.isArray(rulesResult.data) ? rulesResult.data : [];

    return c.json(
      ok(
        emptyMeta({
          periods,
          duration_rules,
          degraded: Boolean(periodsResult.error || rulesResult.error),
        }),
        rid
      )
    );
  } catch (error) {
    console.error("[schedule:meta]", error);
    return c.json(ok(emptyMeta({ degraded: true, notice: "schedule_meta_unavailable" }), rid));
  }
});

export default schedule;
