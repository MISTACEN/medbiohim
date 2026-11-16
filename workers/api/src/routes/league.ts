/**
 * Лиги/рейтинг (фаза 2.10): недельный рейтинг по учебным событиям.
 *
 * Очки считаются из activity_events за текущую неделю (с понедельника) —
 * анти-чит по построению: события пишет только service_role из реальных
 * действий (тест, ДЗ, отработка, SRS, лекция), клиент вставить строку не может.
 * Агрегат кэшируется в Redis на 2 минуты — топ считается для всех, но не на
 * каждый чих. RLS не нужен: таблицу activity_events читает service client,
 * наружу отдаются только очки и имена (как в сообществе).
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";
import { getRedis } from "../lib/redis";

const league = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/** Вес события в очках: тесты и отработки — дороже, повторения — чаще. */
const KIND_POINTS: Record<string, number> = {
  test_finished: 10,
  assignment_updated: 8,
  homework_marked: 5,
  srs_review: 2,
  lecture_opened: 2,
  quest_chest: 3,
  tutor_message: 1,
};

/** Лиги по порогам очков за неделю (Duolingo-стиль). */
const TIERS = [
  { name: "Алмаз", min: 420 },
  { name: "Платина", min: 260 },
  { name: "Золото", min: 140 },
  { name: "Серебро", min: 60 },
  { name: "Бронза", min: 1 },
] as const;

const CACHE_SECONDS = 120;
const TOP_LIMIT = 50;

/** Понедельник 00:00 UTC текущей недели (единое окно для всех пользователей). */
export function weekStartUtc(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay(); // 0=вс … 6=сб
  const shift = (day + 6) % 7; // пн = 0
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString();
}

export function tierFor(points: number): { name: string; min: number } | null {
  for (const tier of TIERS) {
    if (points >= tier.min) return { name: tier.name, min: tier.min };
  }
  return null;
}

function nextTierFor(points: number): { name: string; min: number } | null {
  // TIERS идут от старшей к младшей; следующая лига — ближайшая сверху.
  for (let i = TIERS.length - 1; i >= 0; i -= 1) {
    if (points < TIERS[i].min) return { name: TIERS[i].name, min: TIERS[i].min };
    if (points >= TIERS[i].min) return TIERS[i - 1] || null;
  }
  return null;
}

type LeaderRow = { user_id: string; name: string; points: number };

async function computeWeek(service: any): Promise<{ weekStart: string; leaders: LeaderRow[] }> {
  const weekStart = weekStartUtc();
  const { data, error } = await service
    .from("activity_events")
    .select("user_id,kind")
    .gte("created_at", weekStart)
    .limit(20000);
  if (error) throw error;
  const pointsByUser = new Map<string, number>();
  for (const row of (data || []) as Array<{ user_id?: string; kind?: string }>) {
    const userId = String(row.user_id || "");
    const weight = KIND_POINTS[String(row.kind || "")];
    if (!userId || !weight) continue;
    pointsByUser.set(userId, (pointsByUser.get(userId) || 0) + weight);
  }
  const ids = [...pointsByUser.keys()].filter(Boolean).slice(0, 500);
  const nameById = new Map<string, string>();
  if (ids.length) {
    const { data: people, error: peopleError } = await service
      .from("users")
      .select("id,full_name,display_name")
      .in("id", ids)
      .limit(500);
    if (!peopleError) {
      for (const person of people || []) {
        nameById.set(String(person.id), String(person.display_name || person.full_name || "Студент"));
      }
    }
  }
  const leaders: LeaderRow[] = [...pointsByUser.entries()]
    .map(([userId, points]) => ({ user_id: userId, name: nameById.get(userId) || "Студент", points }))
    .sort((a, b) => b.points - a.points)
    .slice(0, TOP_LIMIT);
  return { weekStart, leaders };
}

league.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const service = createServiceClient(c.env);
  if (!service) {
    const { body, status } = fail("LEAGUE_UNAVAILABLE", "Рейтинг требует служебного клиента БД", 503, rid);
    return c.json(body, status as 503);
  }
  const redis = getRedis(c.env);
  const weekStart = weekStartUtc();
  try {
    let leaders: LeaderRow[] | null = null;
    if (redis) {
      const cached = await redis.get(`league:week:${weekStart}`).catch(() => null);
      if (cached) {
        try { leaders = JSON.parse(String(cached)) as LeaderRow[]; } catch { /* пересчитаем */ }
      }
    }
    if (!leaders) {
      const computed = await computeWeek(service);
      leaders = computed.leaders;
      if (redis) {
        await redis.set(`league:week:${weekStart}`, JSON.stringify(leaders), { ex: CACHE_SECONDS }).catch(() => {});
      }
    }

    const ranked = [...leaders].sort((a, b) => b.points - a.points);
    const myRow = ranked.find((row) => row.user_id === user.id) || null;
    const myPoints = myRow?.points ?? 0;
    const myRank = myRow ? ranked.findIndex((row) => row.user_id === user.id) + 1 : null;
    const tier = tierFor(myPoints);
    const next = nextTierFor(myPoints);
    return c.json(ok({
      week_start: weekStart,
      my: {
        points: myPoints,
        rank: myRank,
        league: tier?.name || "Бронза",
        next_league: next ? { name: next.name, remaining: next.min - myPoints } : null,
        breakdown: Object.fromEntries(
          Object.entries(KIND_POINTS).map(([kind, weight]) => [kind, weight]),
        ),
      },
      top: ranked.slice(0, 10).map((row, index) => ({
        rank: index + 1,
        name: row.name,
        points: row.points,
        league: tierFor(row.points)?.name || "Бронза",
        is_me: row.user_id === user.id,
      })),
      total: ranked.length,
    }, rid));
  } catch (error) {
    console.error("[league]", error);
    const { body, status } = fail("LEAGUE_UNAVAILABLE", "Рейтинг временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

export default league;
