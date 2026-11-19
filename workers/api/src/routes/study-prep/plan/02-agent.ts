import { ok, fail, requestId } from "../../../lib/response";
import { requireAuth } from "../../../middleware/auth";
import { createServiceClient } from "../../../lib/supabase";
import { AGENT_PLAN_KIND, agentDay, buildAgentItems, isValidEventDate } from "../../../lib/exam-agent";

import { ensureAgentPlan } from "./shared";

import type { PlanRouter } from "./types";

export function registerAgentRoutes(studyPrep: PlanRouter) {
studyPrep.post("/agent", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    const { body: errBody, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(errBody, status as 400);
  }
  const subjectSlug = String(body?.subject_slug || "").trim();
  const eventDate = String(body?.event_date || "").trim();
  if (!/^[a-z0-9_-]{2,60}$/i.test(subjectSlug)) {
    const { body: errBody, status } = fail("VALIDATION_ERROR", "Некорректный предмет", 422, rid);
    return c.json(errBody, status as 422);
  }
  if (!isValidEventDate(eventDate)) {
    const { body: errBody, status } = fail("VALIDATION_ERROR", "Дата экзамена должна быть в пределах 180 дней от сегодня", 422, rid);
    return c.json(errBody, status as 422);
  }
  try {
    // В таблице бывают активные дубли с одним slug, поэтому maybeSingle() падал
    // с «multiple rows» и агент отвечал «Предмет не найден». Берём любую строку.
    const { data: subjectRows } = await db
      .from("subjects")
      .select("slug")
      .eq("slug", subjectSlug)
      .eq("is_active", true)
      .limit(1);
    if (!subjectRows?.length) {
      const { body: errBody, status } = fail("SUBJECT_NOT_FOUND", "Предмет не найден", 404, rid);
      return c.json(errBody, status as 404);
    }
    const plan = await ensureAgentPlan(db, user.id, subjectSlug, eventDate);
    if (!plan) {
      const { body: errBody, status } = fail("PLAN_NOT_CREATED", "Не удалось создать план агента", 503, rid);
      return c.json(errBody, status as 503);
    }
    const service = createServiceClient(c.env);
    if (!service) {
      const { body: errBody, status } = fail("SERVICE_UNAVAILABLE", "Агент временно недоступен", 503, rid);
      return c.json(errBody, status as 503);
    }
    const day = agentDay();
    let added = 0;
    try {
      // Идемпотентность на день: повторный «Запустить» не добавляет вторую
      // порцию разборов (иначе один день превращается в 16 вопросов).
      const { count } = await service
        .from("study_agent_items")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", plan.id)
        .eq("day", day);
      if (!count) added = await buildAgentItems(service, { ...plan, user_id: user.id }, day);
    } catch (buildError) {
      console.warn("[study-prep:agent:build]", buildError instanceof Error ? buildError.message : "unavailable");
    }
    return c.json(ok({ plan, day, added }, rid));
  } catch (error) {
    console.error("[study-prep:agent:create]", error);
    const { body: errBody, status } = fail("STUDY_AGENT_ERROR", "Не удалось запустить агента", 503, rid);
    return c.json(errBody, status as 503);
  }
});

studyPrep.get("/agent", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const today = agentDay();
  const tomorrow = agentDay(new Date(), 1);
  try {
    const { data: plans, error } = await db
      .from("study_plans")
      .select("id,subject_slug,event_date,status,created_at")
      .eq("user_id", user.id)
      .eq("event_kind", AGENT_PLAN_KIND)
      .eq("status", "active")
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .limit(20);
    if (error) throw error;
    if (!plans?.length) return c.json(ok({ plans: [], today, tomorrow, questions_per_day: 8 }, rid));

    const ids = plans.map((plan: any) => String(plan.id));
    const { data: items, error: itemsError } = await db
      .from("study_agent_items")
      .select("id,plan_id,day,question_text,answer,topic,done,position")
      .eq("user_id", user.id)
      .in("plan_id", ids)
      .in("day", [today, tomorrow])
      .order("day", { ascending: true })
      .order("position", { ascending: true })
      .limit(400);
    if (itemsError) throw itemsError;

    const shaped = plans.map((plan: any) => {
      const ofPlan = (items || []).filter((item: any) => String(item.plan_id) === String(plan.id));
      const bucket = (day: string) => {
        const list = ofPlan.filter((item: any) => String(item.day) === day);
        return { day, items: list, done: list.filter((item: any) => item.done).length, total: list.length };
      };
      const daysLeft = Math.max(
        0,
        Math.round((Date.parse(`${plan.event_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000),
      );
      return { ...plan, days_left: daysLeft, today: bucket(today), tomorrow: bucket(tomorrow) };
    });
    return c.json(ok({ plans: shaped, today, tomorrow, questions_per_day: 8 }, rid));
  } catch (error) {
    console.error("[study-prep:agent:list]", error);
    const missing = String((error as any)?.code || "") === "42P01" || String((error as any)?.code || "") === "PGRST205";
    const { body: errBody, status } = fail(
      missing ? "AGENT_NOT_MIGRATED" : "STUDY_AGENT_ERROR",
      missing ? "Агент появится после применения миграции study_agent_items" : "Не удалось загрузить агента",
      503,
      rid,
    );
    return c.json(errBody, status as 503);
  }
});

studyPrep.post("/agent/report", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const day = agentDay();
  try {
    const { data: plans, error } = await db
      .from("study_plans")
      .select("id,user_id,subject_slug,event_date")
      .eq("user_id", user.id)
      .eq("event_kind", AGENT_PLAN_KIND)
      .eq("status", "active")
      .gte("event_date", day)
      .limit(10);
    if (error) throw error;
    if (!plans?.length) {
      const { body: errBody, status } = fail("NO_AGENT_PLAN", "Сначала запустите агента — планов нет", 404, rid);
      return c.json(errBody, status as 404);
    }
    const { notifyPlanReport } = await import("../../../jobs/exam-agent");
    let sent = 0;
    for (const plan of plans) {
      const { count } = await db
        .from("study_agent_items")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", plan.id)
        .eq("day", day);
      if (!count) await buildAgentItems(db, plan as any, day);
      if (await notifyPlanReport(c.env, db, plan as any, day)) sent += 1;
    }
    if (!sent) {
      const botReady = Boolean(String(c.env.TELEGRAM_BOT_TOKEN || "").trim());
      const { body: errBody, status } = fail(
        botReady ? "TELEGRAM_NOT_LINKED" : "TELEGRAM_BOT_NOT_CONFIGURED",
        botReady
          ? "Отчёт некому отправить: привяжите Telegram в настройках бота"
          : "Telegram-бот не настроен на сервере: не задан TELEGRAM_BOT_TOKEN",
        422,
        rid,
      );
      return c.json(errBody, status as 422);
    }
    return c.json(ok({ sent, day }, rid));
  } catch (error) {
    console.error("[study-prep:agent:report]", error);
    const { body: errBody, status } = fail("STUDY_AGENT_ERROR", "Не удалось отправить отчёт", 503, rid);
    return c.json(errBody, status as 503);
  }
});
}
