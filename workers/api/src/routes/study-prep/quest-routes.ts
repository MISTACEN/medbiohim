/** Ежедневные квесты, сундук, серия и лига. */
import { Hono } from "hono";
import type { Env } from "../../env";
import { ok, fail, requestId } from "../../lib/response";
import { requireAuth, type AuthVariables } from "../../middleware/auth";
import { createServiceClient } from "../../lib/supabase";
import { logActivity } from "../../lib/activity";
import { AGENT_PLAN_KIND } from "../../lib/exam-agent";

const studyPrep = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
import { UUID, isoToday, addDays } from "./planning";
import { QUEST_CHEST_BONUS, buildDailyQuests, LEAGUE_WEIGHTS } from "./daily-quests";

studyPrep.get("/quests", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const payload = await buildDailyQuests(c.get("supabase"), c.get("user").id);
    return c.json(ok(payload, rid));
  } catch (error) {
    console.error("[study-prep:quests]", error);
    const { body: errBody, status } = fail("QUESTS_ERROR", "Не удалось собрать цели дня", 503, rid);
    return c.json(errBody, status as 503);
  }
});

// POST /quests/chest — забрать награду за все три цели дня (идемпотентно).
studyPrep.post("/quests/chest", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  try {
    const payload = await buildDailyQuests(c.get("supabase"), user.id);
    if (!payload.chest.unlocked) {
      const { body, status } = fail("CHEST_LOCKED", "Сначала закройте все три цели дня", 409, rid);
      return c.json(body, status as 409);
    }
    if (payload.chest.claimed) return c.json(ok({ ...payload.chest, claimed: true, reason: "already" }, rid));
    const logged = await logActivity(c.env, {
      userId: user.id,
      kind: "quest_chest",
      payload: { bonus: QUEST_CHEST_BONUS, date: payload.date },
    });
    if (!logged) {
      const { body, status } = fail("CHEST_FAILED", "Не удалось записать награду", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ bonus: QUEST_CHEST_BONUS, unlocked: true, claimed: true, available: false }, rid));
  } catch (error) {
    console.error("[study-prep:quests:chest]", error);
    const { body, status } = fail("CHEST_ERROR", "Не удалось открыть сундук", 503, rid);
    return c.json(body, status as 503);
  }
});

/**
 * Серия дней и карта активности (16 недель). Считаем по activity_events:
 * отдельная таблица серии не нужна, и «заморозки» не понадобились —
 * день засчитывается, если было хотя бы одно учебное событие.
 */
studyPrep.get("/streak", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const WEEKS = 16;
  const today = isoToday();
  const since = new Date(Date.now() - (WEEKS * 7 + 7) * 86400000).toISOString();
  try {
    const { data, error } = await db
      .from("activity_events")
      .select("created_at")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .limit(5000);
    if (error) throw error;
    const perDay = new Map<string, number>();
    for (const row of data || []) {
      const day = String((row as any).created_at || "").slice(0, 10);
      if (day) perDay.set(day, (perDay.get(day) || 0) + 1);
    }

    // Серия: считаем от сегодня; если сегодня ещё ничего не сделано — от вчера
    // (день не должен обрывать серию до вечера).
    const has = (day: string) => (perDay.get(day) || 0) > 0;
    let cursor = has(today) ? today : addDays(today, -1);
    let current = 0;
    while (has(cursor) && current < 400) {
      current += 1;
      cursor = addDays(cursor, -1);
    }

    const days: Array<{ date: string; count: number }> = [];
    for (let offset = WEEKS * 7 - 1; offset >= 0; offset -= 1) {
      const day = addDays(today, -offset);
      days.push({ date: day, count: perDay.get(day) || 0 });
    }
    let longest = 0;
    let run = 0;
    for (const day of days) {
      if (day.count > 0) {
        run += 1;
        longest = Math.max(longest, run);
      } else run = 0;
    }

    return c.json(
      ok({ current_streak: current, longest_streak: Math.max(longest, current), active_days: days.filter((d) => d.count > 0).length, weeks: WEEKS, days, today }, rid),
    );
  } catch (error) {
    console.error("[study-prep:streak]", error);
    const { body: errBody, status } = fail("STREAK_ERROR", "Не удалось посчитать серию", 503, rid);
    return c.json(errBody, status as 503);
  }
});

/**
 * Вес активности для лиги. Очки считаются из activity_events, поэтому лига не
 * зависит от ИИ и не требует отдельной таблицы рейтинга.
 */

studyPrep.get("/league", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const db = c.get("supabase");
  const service = createServiceClient(c.env) || db;
  try {
    const { data: mine, error: mineError } = await db
      .from("group_memberships")
      .select("group_id")
      .eq("user_id", user.id)
      .eq("is_active", true);
    if (mineError) throw mineError;
    const groupIds = [...new Set((mine || []).map((row: any) => String(row.group_id)).filter(Boolean))];
    if (!groupIds.length) return c.json(ok({ available: false, reason: "no_group" }, rid));

    const { data: members, error: membersError } = await service
      .from("group_memberships")
      .select("user_id")
      .in("group_id", groupIds)
      .eq("is_active", true)
      .limit(500);
    if (membersError) throw membersError;
    const memberIds = [...new Set((members || []).map((row: any) => String(row.user_id)).filter(Boolean))];
    if (memberIds.length < 2) return c.json(ok({ available: false, reason: "alone" }, rid));

    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: events, error: eventsError } = await service
      .from("activity_events")
      .select("user_id,kind")
      .in("user_id", memberIds)
      .gte("created_at", since)
      .limit(5000);
    if (eventsError) throw eventsError;

    const points = new Map<string, number>();
    for (const id of memberIds) points.set(id, 0);
    for (const event of events || []) {
      const userId = String((event as any).user_id || "");
      const weight = LEAGUE_WEIGHTS[String((event as any).kind || "")] || 0;
      if (!userId || !weight) continue;
      points.set(userId, (points.get(userId) || 0) + weight);
    }

    const sorted = [...points.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const myPoints = points.get(String(user.id)) || 0;
    const rank = sorted.findIndex(([id]) => id === String(user.id)) + 1;
    const above = rank > 1 ? sorted[rank - 2]?.[1] ?? myPoints : null;
    return c.json(
      ok(
        {
          available: true,
          points: myPoints,
          rank,
          members: sorted.length,
          leader_points: sorted[0]?.[1] ?? 0,
          next_gap: above === null ? null : Math.max(0, above - myPoints),
          days: 7,
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[study-prep:league]", error);
    const { body: errBody, status } = fail("LEAGUE_ERROR", "Не удалось посчитать лигу", 503, rid);
    return c.json(errBody, status as 503);
  }
});

// PATCH /agent/items/:id — отметить пункт разобранным (только свои, только done).
studyPrep.patch("/agent/items/:id", requireAuth, async (c) => {
  const rid = requestId();
  const db = c.get("supabase");
  const user = c.get("user");
  const id = String(c.req.param("id") || "");
  if (!UUID.test(id)) {
    const { body: errBody, status } = fail("VALIDATION_ERROR", "Некорректный ID пункта", 422, rid);
    return c.json(errBody, status as 422);
  }
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}
  const done = body?.done !== false;
  try {
    const { data, error } = await db
      .from("study_agent_items")
      .update({ done })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id,day,done")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const { body: errBody, status } = fail("NOT_FOUND", "Пункт агента не найден", 404, rid);
      return c.json(errBody, status as 404);
    }
    return c.json(ok({ item: data }, rid));
  } catch (error) {
    console.error("[study-prep:agent:item]", error);
    const { body: errBody, status } = fail("STUDY_AGENT_ERROR", "Не удалось обновить пункт", 503, rid);
    return c.json(errBody, status as 503);
  }
});

export default studyPrep;
