import { ok, fail, requestId } from "../../../lib/response";
import { requireAuth } from "../../../middleware/auth";
import { UUID, isoToday, prepReadinessForEvents, buildPlanDays, isMissingTable, loadEvent, loadProgress, planPayload } from "../planning";

import type { PlanRouter } from "./types";

export function registerPlanRoutes(studyPrep: PlanRouter) {
studyPrep.get("/plan", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const eventId = String(c.req.query("event") || "").trim();
  if (!UUID.test(eventId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Нужен параметр event (id события расписания)", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const event = await loadEvent(db, user.id, eventId);
    if (!event) {
      const { body, status } = fail("EVENT_NOT_FOUND", "Событие не найдено в расписании вашей группы", 404, rid);
      return c.json(body, status as 404);
    }
    const { data: saved, error } = await db
      .from("study_plans")
      .select("id,schedule_entry_id,subject_slug,event_kind,event_date,days,topics,mastery_pct,status,generated_by,updated_at")
      .eq("user_id", user.id)
      .eq("schedule_entry_id", eventId)
      .eq("status", "active")
      .maybeSingle();
    if (!error && saved) return c.json(ok(planPayload(saved, true), rid));

    // Предпросмотр: правила без сохранения (в т.ч. пока миграция не применена).
    const progress = await loadProgress(db, user.id);
    // Кнопка «Готовиться» есть у любого события, поэтому план строится по темам
    // предмета и для занятия: готовность в сводке остаётся только по аттестациям.
    const readiness = await prepReadinessForEvents(db, [event], progress, { includeAllKinds: true });
    const prep = readiness.get(eventId);
    const topics = prep?.topics ?? [];
    const mastery = prep?.mastery_pct ?? 0;
    const days = buildPlanDays({
      topics,
      today: isoToday(),
      eventDate: String(event.date),
      subjectSlug: prep?.subject_slug ?? null,
      readiness: mastery,
    });
    const preview = {
      id: null,
      schedule_entry_id: eventId,
      subject_slug: prep?.subject_slug ?? null,
      event_kind: String(event.event_kind || "colloquium"),
      event_date: String(event.date),
      days,
      topics,
      mastery_pct: mastery,
      status: "active",
      generated_by: "rules",
    };
    const notice = error && isMissingTable(error) ? "План пока не сохраняется: миграция study_plans не применена." : undefined;
    return c.json(ok(planPayload(preview, false, notice), rid));
  } catch (error) {
    console.error("[study-prep:get]", error);
    const { body, status } = fail("STUDY_PLAN_ERROR", "Не удалось загрузить план подготовки", 503, rid);
    return c.json(body, status as 503);
  }
});

studyPrep.post("/plan", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const eventId = String(payload?.schedule_entry_id || "").trim();
  if (!UUID.test(eventId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Нужен schedule_entry_id", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const event = await loadEvent(db, user.id, eventId);
    if (!event) {
      const { body, status } = fail("EVENT_NOT_FOUND", "Событие не найдено в расписании вашей группы", 404, rid);
      return c.json(body, status as 404);
    }
    const progress = await loadProgress(db, user.id);
    // Кнопка «Готовиться» есть у любого события, поэтому план строится по темам
    // предмета и для занятия: готовность в сводке остаётся только по аттестациям.
    const readiness = await prepReadinessForEvents(db, [event], progress, { includeAllKinds: true });
    const prep = readiness.get(eventId);
    const topics = prep?.topics ?? [];
    const mastery = prep?.mastery_pct ?? 0;
    const days = buildPlanDays({
      topics,
      today: isoToday(),
      eventDate: String(event.date),
      subjectSlug: prep?.subject_slug ?? null,
      readiness: mastery,
    });
    const { data: existing, error: existingError } = await db
      .from("study_plans")
      .select("id")
      .eq("user_id", user.id)
      .eq("schedule_entry_id", eventId)
      .maybeSingle();
    if (existingError) {
      if (isMissingTable(existingError)) {
        return c.json(ok(planPayload({
          id: null, schedule_entry_id: eventId, subject_slug: prep?.subject_slug ?? null,
          event_kind: String(event.event_kind || "colloquium"), event_date: String(event.date),
          days, topics, mastery_pct: mastery, status: "active", generated_by: "rules",
        }, false, "План пока не сохраняется: миграция study_plans не применена."), rid));
      }
      throw existingError;
    }
    const body = {
      user_id: user.id,
      schedule_entry_id: eventId,
      subject_slug: prep?.subject_slug ?? null,
      event_kind: String(event.event_kind || "colloquium"),
      event_date: String(event.date),
      days,
      topics,
      mastery_pct: mastery,
      status: "active",
      generated_by: "rules",
      updated_at: new Date().toISOString(),
    };
    const result = existing?.id
      ? await db.from("study_plans").update(body).eq("id", existing.id).eq("user_id", user.id)
          .select("id,schedule_entry_id,subject_slug,event_kind,event_date,days,topics,mastery_pct,status,generated_by,updated_at").maybeSingle()
      : await db.from("study_plans").insert(body)
          .select("id,schedule_entry_id,subject_slug,event_kind,event_date,days,topics,mastery_pct,status,generated_by,updated_at").maybeSingle();
    if (result.error) throw result.error;
    return c.json(ok(planPayload(result.data, true), rid), existing?.id ? 200 : 201);
  } catch (error) {
    console.error("[study-prep:create]", error);
    const { body, status } = fail("STUDY_PLAN_ERROR", "Не удалось собрать план подготовки", 503, rid);
    return c.json(body, status as 503);
  }
});

studyPrep.patch("/plan/:id", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const planId = String(c.req.param("id") || "").trim();
  if (!UUID.test(planId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный id плана", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const day = String(payload?.day || "").trim();
  const index = Number(payload?.index);
  const done = payload?.done === true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(index) || index < 0) {
    const { body, status } = fail("VALIDATION_ERROR", "Нужны day (yyyy-mm-dd) и index шага", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    // Атомарная отметка шага: две вкладки не должны затирать галочки друг друга.
    // Оптимистическая блокировка по updated_at — запись уходит, только если план
    // не менялся с момента чтения; иначе перечитываем и применяем заново.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: plan, error } = await db
        .from("study_plans")
        .select("id,days,status,updated_at")
        .eq("id", planId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!plan) {
        const { body, status } = fail("PLAN_NOT_FOUND", "План не найден", 404, rid);
        return c.json(body, status as 404);
      }
      const days = Array.isArray(plan.days) ? plan.days : [];
      const target = days.find((entry: any) => String(entry?.date || "") === day);
      if (!target || !Array.isArray(target.items) || !target.items[index]) {
        const { body, status } = fail("VALIDATION_ERROR", "Шаг плана не найден", 422, rid);
        return c.json(body, status as 422);
      }
      target.items[index].done = done;
      const everyDone = days.every((entry: any) =>
        Array.isArray(entry?.items) ? entry.items.every((item: any) => item?.done === true) : true);
      const { data: updated, error: updateError } = await db
        .from("study_plans")
        .update({ days, status: everyDone ? "completed" : "active", updated_at: new Date().toISOString() })
        .eq("id", planId)
        .eq("user_id", user.id)
        // Условие по прочитанному updated_at: другой PATCH успел пройти — строка
        // не обновится, перечитываем и переносим отметку на свежую версию.
        .eq("updated_at", plan.updated_at)
        .select("id,schedule_entry_id,subject_slug,event_kind,event_date,days,topics,mastery_pct,status,generated_by,updated_at")
        .maybeSingle();
      if (updateError) throw updateError;
      if (updated) return c.json(ok(planPayload(updated, true), rid));
    }
    const { body, status } = fail("PLAN_CONFLICT", "План менялся параллельно — обновите страницу и повторите", 409, rid);
    return c.json(body, status as 409);
  } catch (error) {
    console.error("[study-prep:patch]", error);
    const { body, status } = fail("STUDY_PLAN_ERROR", "Не удалось обновить план", 503, rid);
    return c.json(body, status as 503);
  }
});

studyPrep.post("/plan/:id/compress", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const planId = String(c.req.param("id") || "").trim();
  if (!UUID.test(planId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный id плана", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data: plan, error } = await db
      .from("study_plans")
      .select("id,subject_slug,event_date,topics")
      .eq("id", planId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!plan) {
      const { body, status } = fail("PLAN_NOT_FOUND", "План не найден", 404, rid);
      return c.json(body, status as 404);
    }
    const subjectSlug = plan.subject_slug ? String(plan.subject_slug) : "";
    const topics = Array.isArray(plan.topics)
      ? (plan.topics as any[]).map((topic) => String(topic?.title || "")).filter(Boolean).slice(0, 20)
      : [];
    if (!subjectSlug && !topics.length) {
      const { body, status } = fail("VALIDATION_ERROR", "В плане нет предмета и тем — сжимать нечего", 422, rid);
      return c.json(body, status as 422);
    }
    const target = new Date(Date.parse(String(plan.event_date) + "T00:00:00Z") - 86400000);
    const targetIso = target.toISOString();
    let query = db
      .from("srs_cards")
      .update({ due_at: targetIso, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .gt("due_at", targetIso);
    query = subjectSlug ? query.eq("subject_slug", subjectSlug) : query.in("topic", topics);
    const { data: moved, error: updateError } = await query.select("id");
    if (updateError) throw updateError;
    return c.json(ok({
      moved: Array.isArray(moved) ? moved.length : 0,
      target_due: targetIso,
      event_date: plan.event_date,
      scope: subjectSlug ? "subject" : "topics",
    }, rid));
  } catch (error) {
    console.error("[study-prep:compress]", error);
    const { body, status } = fail("STUDY_PLAN_ERROR", "Не удалось сжать повторения", 503, rid);
    return c.json(body, status as 503);
  }
});
}
