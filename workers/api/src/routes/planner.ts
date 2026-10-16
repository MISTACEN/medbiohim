import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const planner = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const relation = (value: any) => Array.isArray(value) ? value[0] : value;

planner.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const requestedGroup = c.req.query("group_id");

  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
    const { body, status } = fail("VALIDATION_ERROR", "from/to должны быть датами YYYY-MM-DD", 422, rid);
    return c.json(body, status as 422);
  }

  try {
    const { data: memberships, error: membershipError } = await db
      .from("group_memberships")
      .select("group_id,groups(id,name,code,course_number,specialty_slug,is_active)")
      .eq("user_id", user.id).eq("is_active", true).limit(100);
    if (membershipError) throw membershipError;
    const groups = (memberships || []).map((m: any) => {
      const g = relation(m.groups);
      return g && g.is_active !== false && m.group_id ? { ...g, group_id: m.group_id } : null;
    }).filter(Boolean);
    if (!groups.length) {
      const { body, status } = fail("NO_GROUP", "Назначьте активную учебную группу", 422, rid);
      return c.json(body, status as 422);
    }
    let group: any;
    if (requestedGroup) {
      if (!UUID.test(requestedGroup)) {
        const { body, status } = fail("VALIDATION_ERROR", "group_id должен быть UUID", 422, rid);
        return c.json(body, status as 422);
      }
      group = groups.find((g: any) => g.group_id === requestedGroup);
      if (!group) {
        const { body, status } = fail("FORBIDDEN", "Вы не состоите в указанной учебной группе", 403, rid);
        return c.json(body, status as 403);
      }
    } else if (groups.length > 1) {
      const { body, status } = fail("GROUP_REQUIRED", "Выберите учебную группу", 409, rid, { groups: groups.map((g: any) => ({ id: g.group_id, name: g.name, code: g.code })) });
      return c.json(body, status as 409);
    } else group = groups[0];

    let hwQuery = db.from("homeworks")
      .select("id,title,description,due_at,due_date,subject_id,group_id,schedule_entry_id,created_by,created_at,subjects(name,slug,color_hex)")
      .or(`group_id.is.null,group_id.eq.${group.group_id}`)
      .order("due_date", { ascending: true }).limit(500);
    if (from) hwQuery = hwQuery.gte("due_date", from);
    const { data: hwRows, error: hwError } = await hwQuery;
    if (hwError) throw hwError;
    let homeworks: any[] = (hwRows || []).filter((h: any) => !to || !h.due_date || String(h.due_date) <= to);
    const hwIds = homeworks.map((h: any) => h.id).filter((id: string) => UUID.test(String(id)));
    let progressRows: any[] = [];
    let submissionRows: any[] = [];
    if (hwIds.length) {
      const [progressResult, submissionsResult] = await Promise.all([
        db.from("homework_progress").select("homework_id,completed,submitted_at,status").eq("user_id", user.id).in("homework_id", hwIds).limit(500),
        db.from("homework_submissions").select("id,homework_id,status,grade,submitted_at").eq("user_id", user.id).in("homework_id", hwIds).order("submitted_at", { ascending: false }).limit(500),
      ]);
      if (progressResult.error) throw progressResult.error;
      if (submissionsResult.error) throw submissionsResult.error;
      progressRows = progressResult.data || [];
      submissionRows = submissionsResult.data || [];
    }
    const progressByHw = new Map(progressRows.map((p: any) => [String(p.homework_id), p]));
    const submissionByHw = new Map<string, any>();
    for (const s of submissionRows) if (!submissionByHw.has(String(s.homework_id))) submissionByHw.set(String(s.homework_id), s);
    homeworks = homeworks.map((h: any) => {
      const subject = relation(h.subjects);
      const progress: any = progressByHw.get(String(h.id));
      const submission = submissionByHw.get(String(h.id));
      const status = ["graded", "returned", "submitted"].includes(String(submission?.status))
        ? submission.status : progress?.completed === true ? "done" : "pending";
      return { ...h, subject_name: subject?.name ?? null, subject_slug: subject?.slug ?? null,
        color_hex: subject?.color_hex ?? null, my_completed: progress?.completed === true,
        completed_at: progress?.submitted_at ?? null, submission_status: submission?.status ?? null,
        my_status: status, my_status_source: submission ? "submission" : progress?.completed ? "progress" : "none",
        submission_id: submission?.id ?? null, grade: submission?.grade ?? null };
    });

    const { data: schedules, error: schedulesError } = await db.from("schedules")
      .select("id,semester,version").eq("group_id", group.group_id).eq("is_active", true).limit(20);
    if (schedulesError) throw schedulesError;
    const scheduleIds = (schedules || []).map((s: any) => s.id).filter((id: string) => UUID.test(String(id)));
    let attendance: any[] = [];
    let scheduleEntries: any[] = [];
    if (scheduleIds.length) {
      let entryQuery = db.from("schedule_entries")
        .select("id,date,start_time,end_time,subject_id,subject_name,type,is_makeup,session_id,schedule_id,subjects(name,slug,color_hex)")
        .in("schedule_id", scheduleIds).order("date", { ascending: true }).order("start_time", { ascending: true }).limit(1000);
      if (from) entryQuery = entryQuery.gte("date", from);
      const { data: entries, error: entriesError } = await entryQuery;
      if (entriesError) throw entriesError;
      scheduleEntries = (entries || []).filter((e: any) => !to || !e.date || String(e.date) <= to);
      const entryIds = scheduleEntries.map((e: any) => e.id).filter((id: string) => UUID.test(String(id)));
      if (entryIds.length) {
        const { data: attRows, error: attError } = await db.from("attendance_records")
          .select("id,schedule_entry_id,status,note,marked_at").eq("user_id", user.id).in("schedule_entry_id", entryIds).limit(1000);
        if (attError) throw attError;
        const attByEntry = new Map((attRows || []).map((a: any) => [String(a.schedule_entry_id), a]));
        const scheduleById = new Map((schedules || []).map((s: any) => [String(s.id), s]));
        attendance = scheduleEntries.filter((e: any) => attByEntry.has(String(e.id))).map((e: any) => {
          const a: any = attByEntry.get(String(e.id));
          const subject = relation(e.subjects);
          const schedule: any = scheduleById.get(String(e.schedule_id));
          return { ...a, schedule_entry_id: e.id, date: e.date, start_time: e.start_time, end_time: e.end_time,
            subject_id: e.subject_id, subject_name: e.subject_name || subject?.name || null,
            subject_slug: subject?.slug ?? null, color_hex: subject?.color_hex ?? null,
            type: e.type, is_makeup: e.is_makeup === true, session_id: e.session_id,
            schedule_id: e.schedule_id, semester: schedule?.semester ?? null, schedule_version: schedule?.version ?? null };
        });
      }
    }

    // A single planner response joins the timetable and tasks using schedule_entry_id.
    // Each timetable entry includes its linked tasks, and each task retains that entry id.
    const tasksByEntry = new Map<string, any[]>();
    for (const hw of homeworks) {
      if (!hw.schedule_entry_id) continue;
      const key = String(hw.schedule_entry_id);
      tasksByEntry.set(key, [...(tasksByEntry.get(key) || []), hw]);
    }
    const lessons = scheduleEntries.map((entry: any) => {
      const subject = relation(entry.subjects);
      return { ...entry, subject_name: entry.subject_name || subject?.name || null,
        subject_slug: subject?.slug ?? null, color_hex: subject?.color_hex ?? null,
        homeworks: tasksByEntry.get(String(entry.id)) || [] };
    });

    const recovery = new Map<string, any>();
    for (const a of attendance) {
      if (a.status === "present") continue;
      const key = String(a.subject_id || a.subject_name || "Без предмета");
      const bucket = recovery.get(key) || { subject_id: a.subject_id ?? null, subject_name: a.subject_name || "Без предмета",
        subject_slug: a.subject_slug ?? null, color_hex: a.color_hex ?? null, missed: 0, unexcused: 0, excused: 0, sick: 0, homeworks_pending: 0, entries: [] };
      bucket.missed++;
      if (a.status === "unexcused") bucket.unexcused++; else if (a.status === "sick") bucket.sick++; else bucket.excused++;
      bucket.entries.push({ date: a.date, start_time: a.start_time, status: a.status, is_makeup: a.is_makeup });
      recovery.set(key, bucket);
    }
    for (const h of homeworks) {
      if (["submitted", "graded", "returned", "done"].includes(String(h.my_status))) continue;
      const key = String(h.subject_id || h.subject_name || "Без предмета");
      const bucket = recovery.get(key) || { subject_id: h.subject_id ?? null, subject_name: h.subject_name || "Без предмета",
        subject_slug: h.subject_slug ?? null, color_hex: h.color_hex ?? null, missed: 0, unexcused: 0, excused: 0, sick: 0, homeworks_pending: 0, entries: [] };
      bucket.homeworks_pending++;
      recovery.set(key, bucket);
    }
    return c.json(ok({ group, homeworks, attendance, recovery: [...recovery.values()], lessons }, rid));
  } catch (error) {
    console.error("[planner]", error);
    const { body, status } = fail("PLANNER_ERROR", "Учебный планер временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

export default planner;
