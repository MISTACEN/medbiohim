import { Hono } from "hono";
import type { Env } from "../env";
import { ok, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const dashboard = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const rel = (v: any) => (Array.isArray(v) ? v[0] : v);

function khDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Vladivostok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

dashboard.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  const degraded: string[] = [];
  const from = khDate();
  const to = addDays(from, 21);
  let profile: any = { id: user.id, email: user.email };
  let groups: any[] = [];
  let groupIds: string[] = [];
  let schedule: any[] = [];
  let homeworks: any[] = [];
  let tests: any[] = [];
  let announcements: any[] = [];

  try {
    const [p, m] = await Promise.all([
      db.from("users").select("id,email,full_name,display_name,avatar_url,course_number,semester").eq("id", user.id).maybeSingle(),
      db.from("group_memberships").select("group_id,role,groups(id,name,specialty_slug,course,semester,is_active)").eq("user_id", user.id).eq("is_active", true).limit(50),
    ]);
    if (p.data) profile = { ...profile, ...p.data };
    groups = (m.data || []).map((row: any) => {
      const g = rel(row.groups);
      if (!g || g.is_active === false) return null;
      return { id: g.id, name: g.name, specialty_slug: g.specialty_slug, course: g.course, semester: g.semester };
    }).filter(Boolean);
    groupIds = groups.map((g: any) => String(g.id));
  } catch { degraded.push("profile"); }

  try {
    if (groupIds.length) {
      const { data: sch } = await db.from("schedules").select("id").in("group_id", groupIds).eq("is_active", true).limit(50);
      const ids = (sch || []).map((s: any) => s.id);
      if (ids.length) {
        const { data: entries } = await db.from("schedule_entries")
          .select("id,date,start_time,end_time,subject_id,subject_name,subject_slug,type,building,room,is_cancelled,is_makeup")
          .in("schedule_id", ids).gte("date", from).lte("date", to)
          .order("date", { ascending: true }).order("start_time", { ascending: true }).limit(300);
        schedule = (entries || []).map((e: any) => ({ ...e, start_time: String(e.start_time || "").slice(0, 5), end_time: String(e.end_time || "").slice(0, 5) }));
      }
    }
  } catch { degraded.push("schedule"); }

  try {
    let q = db.from("homeworks").select("id,title,description,due_at,due_date,subject_id,group_id,status,subjects(name,slug)").order("due_date", { ascending: true }).limit(150);
    q = groupIds.length ? q.or(`group_id.is.null,group_id.in.(${groupIds.join(",")}`) : q.is("group_id", null);
    const { data: rows } = await q;
    homeworks = (rows || []).map((h: any) => {
      const s = rel(h.subjects);
      return { id: h.id, title: h.title, description: h.description, due_at: h.due_at, due_date: h.due_date, subject_id: h.subject_id, subject_name: s?.name, my_status: h.status || "assigned", status: h.status || "assigned" };
    });
  } catch { degraded.push("homeworks"); }

  try {
    const { data } = await db.from("tests").select("id,title,subject_id,time_limit_sec,is_published,created_at").eq("is_published", true).order("created_at", { ascending: false }).limit(80);
    tests = data || [];
  } catch { degraded.push("tests"); }

  try {
    const { data } = await db.from("site_content").select("key,payload").in("key", ["announcements", "site"]).limit(5);
    for (const row of data || []) {
      if (row.key === "announcements") {
        const p = row.payload as any;
        announcements = Array.isArray(p) ? p : Array.isArray(p?.items) ? p.items : [];
      }
    }
  } catch { degraded.push("announcements"); }

  return c.json(ok({
    profile: { ...profile, groups, current_group: groups[0] || null, course: groups[0]?.course ?? profile.course_number ?? null, semester: groups[0]?.semester ?? profile.semester ?? null },
    site: { title: "Medbiohim" },
    announcements: announcements.slice(0, 20),
    schedule,
    schedule_source: degraded.includes("schedule") ? "unavailable" : "supabase",
    homeworks,
    tests,
    stats: {
      upcoming_lessons: schedule.filter((i) => !i.is_cancelled && String(i.date) >= from).length,
      pending_homeworks: homeworks.length,
      completed_homeworks: 0,
      available_tests: tests.length,
    },
    degraded: degraded.length > 0,
    degraded_sources: degraded,
    service_notice: degraded.length ? "Часть данных недоступна." : null,
    generated_at: new Date().toISOString(),
  }, rid));
});

export default dashboard;
