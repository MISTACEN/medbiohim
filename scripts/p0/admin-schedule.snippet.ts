// --- Admin schedule read/write ---
admin.get("/schedule", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!await gate(c)) return;
  const groupId = String(c.req.query("group_id") || "").trim();
  const semester = Number(c.req.query("semester") || 0) || null;
  if (!UUID.test(groupId)) return error(c, rid, 422, "VALIDATION_ERROR", "group_id обязателен (UUID)");
  try {
    let q = db.from("schedules").select("id,group_id,semester,version,is_active,academic_year_id").eq("group_id", groupId).eq("is_active", true).limit(20);
    if (semester != null) q = q.eq("semester", semester);
    const { data: schedules, error: sErr } = await q;
    if (sErr) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить расписание");
    const scheduleIds = (schedules || []).map((s: any) => s.id).filter(Boolean);
    if (!scheduleIds.length) return c.json(ok({ items: [], schedules: [], group_id: groupId, semester }, rid));
    const { data: entries, error: eErr } = await db
      .from("schedule_entries")
      .select("id,schedule_id,date,start_time,end_time,subject_id,subject_name,type,building,room,notes,academic_hours,week_parity,is_cancelled,is_makeup,teacher,sort_order")
      .in("schedule_id", scheduleIds)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(2000);
    if (eErr) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить занятия");
    return c.json(ok({ items: entries || [], schedules: schedules || [], group_id: groupId, semester }, rid));
  } catch {
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить расписание");
  }
});

admin.put("/schedule", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!await gate(c, STRICT_ADMINS)) return;
  const input = await bodyJson(c);
  if (!input) return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  const groupId = String(input.group_id || "").trim();
  const semester = Number(input.semester || 0);
  if (!UUID.test(groupId)) return error(c, rid, 422, "VALIDATION_ERROR", "group_id обязателен");
  if (!semester || semester < 1 || semester > 12) return error(c, rid, 422, "VALIDATION_ERROR", "semester 1–12");
  const entries = Array.isArray(input.entries) ? input.entries : [];
  if (entries.length > 2000) return error(c, rid, 422, "VALIDATION_ERROR", "Слишком много занятий (max 2000)");
  try {
    let { data: existing } = await db
      .from("schedules")
      .select("id,version")
      .eq("group_id", groupId)
      .eq("semester", semester)
      .eq("is_active", true)
      .maybeSingle();
    let scheduleId = existing?.id as string | undefined;
    if (!scheduleId) {
      const { data: created, error: cErr } = await db
        .from("schedules")
        .insert({ group_id: groupId, semester, is_active: true, version: 1 })
        .select("id,version")
        .maybeSingle();
      if (cErr || !created) return error(c, rid, 503, "DB_ERROR", cErr?.message || "Не удалось создать schedule");
      scheduleId = created.id;
    } else {
      await db.from("schedules").update({ version: Number(existing?.version || 0) + 1 }).eq("id", scheduleId);
    }
    const { error: delErr } = await db.from("schedule_entries").delete().eq("schedule_id", scheduleId);
    if (delErr) return error(c, rid, 503, "DB_ERROR", delErr.message || "Не удалось очистить занятия");
    if (!entries.length) return c.json(ok({ saved: 0, schedule_id: scheduleId, group_id: groupId, semester }, rid));
    const rows = entries.map((e: any, i: number) => ({
      schedule_id: scheduleId,
      date: String(e.date || "").slice(0, 10) || null,
      start_time: String(e.start_time || e.startTime || "").slice(0, 8) || null,
      end_time: String(e.end_time || e.endTime || "").slice(0, 8) || null,
      subject_id: e.subject_id && UUID.test(String(e.subject_id)) ? e.subject_id : null,
      subject_name: e.subject_name || e.subject || e.title || null,
      type: e.type || e.lesson_type || "lecture",
      building: e.building || null,
      room: e.room || null,
      notes: e.notes || null,
      academic_hours: e.academic_hours != null ? Number(e.academic_hours) : null,
      week_parity: e.week_parity || null,
      is_cancelled: Boolean(e.is_cancelled),
      is_makeup: Boolean(e.is_makeup),
      teacher: e.teacher || null,
      sort_order: e.sort_order != null ? Number(e.sort_order) : i,
    })).filter((r: any) => r.date && r.start_time);
    let saved = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error: insErr } = await db.from("schedule_entries").insert(chunk);
      if (insErr) return error(c, rid, 503, "DB_ERROR", insErr.message || "Не удалось сохранить занятия");
      saved += chunk.length;
    }
    return c.json(ok({ saved, schedule_id: scheduleId, group_id: groupId, semester }, rid));
  } catch {
    return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить расписание");
  }
});

admin.post("/schedule/import", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!await gate(c, STRICT_ADMINS)) return;
  let groupId = "";
  let semester: number | null = null;
  let entries: any[] = [];
  const ct = (c.req.header("content-type") || "").toLowerCase();
  try {
    if (ct.includes("application/json")) {
      const input = await bodyJson(c);
      if (!input) return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
      groupId = String(input.group_id || "").trim();
      semester = input.semester != null ? Number(input.semester) : null;
      entries = Array.isArray(input.entries) ? input.entries : [];
    } else {
      const form = await c.req.parseBody();
      groupId = String(form.group_id || "").trim();
      semester = form.semester != null ? Number(form.semester) : null;
      if (typeof form.entries === "string") {
        try { entries = JSON.parse(form.entries); } catch { entries = []; }
      }
      if (!entries.length && form.file) {
        return error(c, rid, 422, "VALIDATION_ERROR", "XLSX-парсер на Worker ещё не подключён. Передайте entries как JSON или используйте PUT /admin/schedule");
      }
    }
  } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Не удалось прочитать тело запроса");
  }
  if (!UUID.test(groupId) || !semester) return error(c, rid, 422, "VALIDATION_ERROR", "group_id и semester обязательны");
  const putReq = new Request(new URL("/api/v1/admin/schedule", c.req.url).toString(), {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: c.req.header("authorization") || "" },
    body: JSON.stringify({ group_id: groupId, semester, entries }),
  });
  return admin.fetch(putReq, c.env, c.executionCtx);
});

