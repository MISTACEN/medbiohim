/**
 * FA2: экспорт расписания в .ics и подписка из календаря.
 *
 * Подписной URL открывается без заголовка Authorization (Google Calendar, Apple
 * Calendar ходят как обычный GET), поэтому доступ даёт подписанный токен из
 * `/feed-link`, а не сессия пользователя. Роут только читает расписание.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { fail, ok, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";
import { buildCalendar, signFeedToken, verifyFeedToken, type FeedEntry } from "../lib/calendar-feed";

const feed = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function feedSecret(env: Env): string {
  return (
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_KEY ||
    env.SUPABASE_SECRET_KEY ||
    ""
  ).trim();
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(days: number): Date {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + days);
  return now;
}

async function loadEntries(db: any, userId: string, from: string, to: string): Promise<FeedEntry[]> {
  const { data: memberships, error: membershipError } = await db
    .from("group_memberships")
    .select("group_id,groups(id,is_active)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(50);
  if (membershipError) throw membershipError;

  const groupIds = (memberships || [])
    .map((row: any) => {
      const group = Array.isArray(row.groups) ? row.groups[0] : row.groups;
      if (!row.group_id || group?.is_active === false) return null;
      return String(row.group_id);
    })
    .filter(Boolean) as string[];
  if (!groupIds.length) return [];

  const { data: schedules, error: scheduleError } = await db
    .from("schedules")
    .select("id")
    .in("group_id", groupIds)
    .eq("is_active", true)
    .limit(40);
  if (scheduleError) throw scheduleError;

  const scheduleIds = (schedules || []).map((row: any) => row.id).filter(Boolean);
  if (!scheduleIds.length) return [];

  const { data: entries, error: entryError } = await db
    .from("schedule_entries")
    .select("id,date,start_time,end_time,subject_name,type,room,building,notes,teacher,is_cancelled")
    .in("schedule_id", scheduleIds)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(2000);
  if (entryError) throw entryError;

  return (entries || []) as FeedEntry[];
}

feed.get("/feed-link", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const secret = feedSecret(c.env);
  if (!secret) {
    const { body, status } = fail("FEED_DISABLED", "Подписка на календарь пока не настроена", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const token = await signFeedToken(user.id, secret);
    const path = `/api/v1/schedule/ical.ics?token=${encodeURIComponent(token)}`;
    return c.json(
      ok(
        {
          path,
          download_path: `${path}&download=1`,
          token_hint: "Ссылка персональная: не публикуйте её — по ней видно ваше расписание.",
        },
        rid
      )
    );
  } catch (error) {
    console.error("[schedule:feed-link]", error);
    const { body, status } = fail("FEED_UNAVAILABLE", "Не удалось создать ссылку на календарь", 503, rid);
    return c.json(body, status as 503);
  }
});

feed.get("/ical.ics", async (c) => {
  const rid = requestId();
  const secret = feedSecret(c.env);
  if (!secret) {
    const { body, status } = fail("FEED_DISABLED", "Подписка на календарь пока не настроена", 503, rid);
    return c.json(body, status as 503);
  }

  const token = c.req.query("token") || "";
  const userId = await verifyFeedToken(token, secret);
  if (!userId) {
    const { body, status } = fail("FORBIDDEN", "Ссылка на календарь недействительна", 403, rid);
    return c.json(body, status as 403);
  }

  const from = c.req.query("from") || "";
  const to = c.req.query("to") || "";
  if ((from && !YMD.test(from)) || (to && !YMD.test(to))) {
    const { body, status } = fail("VALIDATION_ERROR", "from/to должны быть датами YYYY-MM-DD", 422, rid);
    return c.json(body, status as 422);
  }

  const db = createServiceClient(c.env);
  if (!db) {
    const { body, status } = fail("FEED_UNAVAILABLE", "Хранилище расписания недоступно", 503, rid);
    return c.json(body, status as 503);
  }

  try {
    // По умолчанию отдаём окно вокруг текущей даты: подписчики календарей
    // перезапрашивают фид регулярно, история за семестр им не нужна.
    const entries = await loadEntries(db, userId, from || ymd(shiftDays(-45)), to || ymd(shiftDays(150)));
    const calendar = buildCalendar(entries, {
      calendarName: "Медбиохим — моё расписание",
      now: new Date(),
    });
    const download = c.req.query("download") === "1";
    return c.body(calendar, 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="schedule.ics"`,
      "Cache-Control": "private, max-age=900",
      "X-Request-Id": rid,
    });
  } catch (error) {
    console.error("[schedule:ical-export]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Расписание временно недоступно", 503, rid);
    return c.json(body, status as 503);
  }
});

export default feed;
