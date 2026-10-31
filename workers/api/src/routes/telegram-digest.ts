import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import type { AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";

/**
 * FA1 + §9: внутренние данные для дайджеста Telegram-бота.
 *
 * Эндпоинт вызывает только бот-воркер с общим секретом
 * (TELEGRAM_INTERNAL_SECRET / TELEGRAM_WEBHOOK_SECRET — тот же механизм,
 * что у /telegram/ingest). Студенческие токены сюда не допускаются:
 * бот отправляет сообщения в групповые чаты, поэтому ответ содержит
 * данные всех привязанных групп — это не поверхность студента.
 */
const telegramDigest = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function constantTimeEqual(actual: string, expected: string): boolean {
  if (!actual || !expected || actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i += 1) {
    difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}

function internalSecret(env: Env): string {
  return String(env.TELEGRAM_INGEST_SECRET || env.TELEGRAM_WEBHOOK_SECRET || "").trim();
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function escapeHtml(value: string | null | undefined): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTime(value: string | null): string {
  return value ? String(value).slice(0, 5) : "";
}

/**
 * §9: rich-форматирование дайджеста. Вся разметка собирается на стороне API
 * (репо), бот только доставляет — как договорились в архитектуре.
 */
function formatDigestHtml(chat: {
  group_name: string | null;
  date: string;
  lessons: Array<{ subject_name: string | null; start_time: string | null; end_time: string | null; room: string | null; building: string | null; is_cancelled: boolean }>;
  homework: { overdue: Array<{ title: string; subject_name: string | null }>; today: Array<{ title: string; subject_name: string | null }>; tomorrow: Array<{ title: string; subject_name: string | null }> };
}): string {
  const parts: string[] = [];
  const dateLabel = new Date(Date.parse(`${chat.date}T00:00:00Z`)).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  parts.push(`<b>📅 ${escapeHtml(chat.group_name || "Группа")} — ${escapeHtml(dateLabel)}</b>`);

  if (!chat.lessons.length) {
    parts.push("Занятий на этот день нет.");
  } else {
    const lines = chat.lessons.map((lesson) => {
      const time = [formatTime(lesson.start_time), formatTime(lesson.end_time)].filter(Boolean).join("–");
      const place = [lesson.building, lesson.room].filter(Boolean).join(", ");
      const subject = escapeHtml(lesson.subject_name || "Занятие");
      const base = [time ? `<b>${escapeHtml(time)}</b>` : "", subject, place ? escapeHtml(place) : ""].filter(Boolean).join(" · ");
      return lesson.is_cancelled ? `❌ ${base} — <i>отменено</i>` : `• ${base}`;
    });
    parts.push(lines.join("\n"));
  }

  const homeworkSection: string[] = [];
  if (chat.homework.overdue.length) {
    homeworkSection.push(`<b>⚠️ Просрочено (${chat.homework.overdue.length}):</b>`);
    for (const item of chat.homework.overdue) homeworkSection.push(`• ${escapeHtml(item.title)}${item.subject_name ? ` — ${escapeHtml(item.subject_name)}` : ""}`);
  }
  if (chat.homework.today.length) {
    homeworkSection.push(`<b>📌 Сдать сегодня:</b>`);
    for (const item of chat.homework.today) homeworkSection.push(`• ${escapeHtml(item.title)}${item.subject_name ? ` — ${escapeHtml(item.subject_name)}` : ""}`);
  }
  if (chat.homework.tomorrow.length) {
    homeworkSection.push(`<b>⏰ Сдать завтра:</b>`);
    for (const item of chat.homework.tomorrow) homeworkSection.push(`• ${escapeHtml(item.title)}${item.subject_name ? ` — ${escapeHtml(item.subject_name)}` : ""}`);
  }
  if (homeworkSection.length) parts.push(homeworkSection.join("\n"));

  return parts.join("\n\n");
}

telegramDigest.get("/internal/digest", async (c) => {
  const rid = requestId();
  const secret = internalSecret(c.env);
  if (!secret) {
    const { body, status } = fail("INTERNAL_NOT_CONFIGURED", "Internal secret is not configured", 503, rid);
    return c.json(body, status as 503);
  }
  if (!constantTimeEqual(c.req.header("x-medbiohim-internal") || "", secret)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }

  const date = String(c.req.query("date") || "").trim();
  if (!ISO_DATE.test(date)) {
    const { body, status } = fail("VALIDATION_ERROR", "date должен быть YYYY-MM-DD", 422, rid);
    return c.json(body, status as 422);
  }

  // Без requireAuth (доступ по internal secret) — клиент создаётся напрямую.
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    // 1. Активные чаты с привязанной группой.
    const { data: chats, error: chatsError } = await supabase
      .from("telegram_bot_chats")
      .select("chat_id,group_id,is_active")
      .eq("is_active", true)
      .not("group_id", "is", null)
      .limit(200);
    if (chatsError) throw chatsError;
    const activeChats = (chats || []) as any[];
    if (!activeChats.length) return c.json(ok({ date, chats: [] }, rid));

    const groupIds = [...new Set(activeChats.map((chat) => String(chat.group_id)))].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (!groupIds.length) return c.json(ok({ date, chats: [] }, rid));

    // 2. Имена групп.
    const { data: groupRows } = await supabase
      .from("groups")
      .select("id,name")
      .in("id", groupIds)
      .limit(200);
    const groupNameById = new Map((groupRows || []).map((row: any) => [String(row.id), String(row.name || "")]));

    // 3. Активные расписания групп → занятия на дату.
    const { data: scheduleRows, error: scheduleError } = await supabase
      .from("schedules")
      .select("id,group_id")
      .in("group_id", groupIds)
      .eq("is_active", true)
      .limit(100);
    if (scheduleError) throw scheduleError;
    const scheduleByGroup = new Map<string, string[]>();
    for (const row of scheduleRows || []) {
      const list = scheduleByGroup.get(String(row.group_id)) || [];
      list.push(String(row.id));
      scheduleByGroup.set(String(row.group_id), list);
    }
    const scheduleIds = [...new Set([...scheduleByGroup.values()].flat())];
    const lessonsBySchedule = new Map<string, any[]>();
    if (scheduleIds.length) {
      const { data: entries, error: entriesError } = await supabase
        .from("schedule_entries")
        .select("schedule_id,subject_name,start_time,end_time,room,building,is_cancelled,type")
        .in("schedule_id", scheduleIds)
        .eq("date", date)
        .order("sort_order", { ascending: true })
        .limit(500);
      if (entriesError) throw entriesError;
      for (const entry of entries || []) {
        const list = lessonsBySchedule.get(String(entry.schedule_id)) || [];
        list.push(entry);
        lessonsBySchedule.set(String(entry.schedule_id), list);
      }
    }

    // 4. ДЗ групп: просрочено / на дату / на завтра.
    const tomorrow = new Date(Date.parse(`${date}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
    const { data: homeworkRows, error: homeworkError } = await supabase
      .from("homeworks")
      .select("id,group_id,title,subject_name,due_date,is_active")
      .in("group_id", groupIds)
      .eq("is_active", true)
      .gte("due_date", new Date(Date.parse(`${date}T00:00:00Z`) - 14 * 86400000).toISOString().slice(0, 10))
      .lte("due_date", tomorrow)
      .limit(300);
    if (homeworkError) throw homeworkError;
    const homeworkByGroup = new Map<string, { overdue: any[]; today: any[]; tomorrow: any[] }>();
    for (const row of homeworkRows || []) {
      const key = String(row.group_id);
      const bucket = homeworkByGroup.get(key) || { overdue: [], today: [], tomorrow: [] };
      const due = String(row.due_date || "");
      if (due && due < date) bucket.overdue.push(row);
      else if (due === date) bucket.today.push(row);
      else if (due === tomorrow) bucket.tomorrow.push(row);
      homeworkByGroup.set(key, bucket);
    }

    // 5. Сборка per-chat ответа: бот отправляет по одному сообщению на чат.
    const digestChats = activeChats.map((chat) => {
      const groupId = String(chat.group_id);
      const scheduleIdList = scheduleByGroup.get(groupId) || [];
      const lessons = scheduleIdList.flatMap((scheduleId) => lessonsBySchedule.get(scheduleId) || []).map((entry) => ({
        subject_name: entry.subject_name || null,
        start_time: entry.start_time || null,
        end_time: entry.end_time || null,
        room: entry.room || null,
        building: entry.building || null,
        type: entry.type || null,
        is_cancelled: entry.is_cancelled === true,
      }));
      const homework = homeworkByGroup.get(groupId) || { overdue: [], today: [], tomorrow: [] };
      const slim = (rows: any[]) => rows.map((row) => ({ title: row.title, subject_name: row.subject_name || null, due_date: row.due_date || null }));
      return {
        chat_id: chat.chat_id,
        group_id: groupId,
        group_name: groupNameById.get(groupId) || null,
        date,
        lessons,
        homework: {
          overdue: slim(homework.overdue),
          today: slim(homework.today),
          tomorrow: slim(homework.tomorrow),
        },
        html: formatDigestHtml({
          group_name: groupNameById.get(groupId) || null,
          date,
          lessons,
          homework: homeworkByGroup.get(groupId) || { overdue: [], today: [], tomorrow: [] },
        }),
      };
    });

    return c.json(ok({ date, chats: digestChats }, rid));
  } catch (error) {
    console.error("[telegram:digest]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Данные дайджеста недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

export default telegramDigest;
