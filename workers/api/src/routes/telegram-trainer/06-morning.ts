import { ok, fail, requestId } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import { TRAINER_LINKED_LIMIT, escapeHtml, stableHash, isoDate, loadActiveChallenges, guardInternal, SITE_STUDY_URL } from "./shared";

import type { TrainerRouter } from "./types";

export function registerMorningRoutes(telegramTrainer: TrainerRouter) {
telegramTrainer.get("/internal/trainer/morning", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data: accounts, error: accountsError } = await supabase
      .from("telegram_accounts")
      .select("telegram_user_id,first_name")
      .limit(TRAINER_LINKED_LIMIT);
    if (accountsError) throw accountsError;

    const { data: prefsRows, error: prefsError } = await supabase
      .from("bot_daily_prefs")
      .select("telegram_user_id,drill_enabled,challenge_enabled")
      .limit(TRAINER_LINKED_LIMIT);
    if (prefsError) throw prefsError;
    const prefs = new Map<number, { drill_enabled: boolean; challenge_enabled: boolean }>();
    for (const row of prefsRows || []) {
      prefs.set(Number((row as any).telegram_user_id), {
        drill_enabled: (row as any).drill_enabled !== false,
        challenge_enabled: (row as any).challenge_enabled !== false,
      });
    }

    const challenges = await loadActiveChallenges(supabase);
    const date = isoDate(new Date());
    const dailyChallenge = challenges.length
      ? challenges[stableHash(date) % challenges.length]
      : null;

    const chats: Array<{ chat_id: number; html: string; keyboard: Array<{ text: string; callback_data: string }> }> = [];
    for (const account of accounts || []) {
      const telegramUserId = Number((account as any).telegram_user_id);
      if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) continue;
      const userPrefs = prefs.get(telegramUserId) || { drill_enabled: true, challenge_enabled: true };
      if (!userPrefs.drill_enabled && !userPrefs.challenge_enabled) continue;

      const parts: string[] = [];
      const keyboard: Array<{ text: string; callback_data: string }> = [];

      if (userPrefs.drill_enabled) {
        const userId = String((account as any).user_id || "");
        // head:true — Supabase возвращает количество в count, без строк.
        const { count: dueCount, error: dueError } = await supabase
          .from("srs_cards")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .lte("due_at", new Date().toISOString());
        if (dueError) throw dueError;
        if (Number(dueCount || 0) > 0) {
          parts.push(`🃏 Карточек к повторению: <b>${Number(dueCount)}</b>`);
          keyboard.push({ text: "🃏 Начать тренажёр", callback_data: "drill:next" });
        }
      }

      if (userPrefs.challenge_enabled && dailyChallenge) {
        const { count: attempted } = await supabase
          .from("bot_challenge_attempts")
          .select("challenge_id", { count: "exact", head: true })
          .eq("telegram_user_id", telegramUserId)
          .eq("challenge_id", dailyChallenge.id)
          .gte("created_at", new Date(`${date}T00:00:00Z`).toISOString());
        if (!attempted) {
          const kindLabel = dailyChallenge.kind === "balance" ? "Уравняйте реакцию" : "Назовите продукт";
          parts.push(
            `🧪 <b>Челлендж дня</b> — ${escapeHtml(kindLabel)}:\n<code>${escapeHtml(dailyChallenge.equation)}</code>`,
          );
          keyboard.push({ text: "🧪 Пройти челлендж", callback_data: `challenge:show:${dailyChallenge.id}` });
        }
      }

      if (!parts.length) continue;
      const firstName = escapeHtml((account as any).first_name || "");
      const greeting = firstName ? `🌅 Доброе утро, ${firstName}!` : "🌅 Доброе утро!";
      chats.push({ chat_id: telegramUserId, html: [greeting, ...parts].join("\n\n"), keyboard });
    }

    return c.json(ok({ date, chats }, rid));
  } catch (error) {
    console.error("[trainer:morning]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Утренняя рассылка временно недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

telegramTrainer.get("/internal/trainer/agent-morning", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const date = isoDate(new Date());
    const { data: accounts, error: accountsError } = await supabase
      .from("telegram_accounts")
      .select("telegram_user_id,user_id,first_name")
      .limit(TRAINER_LINKED_LIMIT);
    if (accountsError) throw accountsError;

    const chats: Array<{ chat_id: number; html: string; keyboard: Array<{ text: string; url?: string; callback_data?: string }> }> = [];
    for (const account of accounts || []) {
      const telegramUserId = Number((account as any).telegram_user_id);
      const userId = String((account as any).user_id || "");
      if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0 || !userId) continue;

      const { data: plans, error: plansError } = await supabase
        .from("study_plans")
        .select("id,subject_slug,event_date")
        .eq("user_id", userId)
        .eq("event_kind", "exam_agent")
        .eq("status", "active")
        .gte("event_date", date)
        .order("event_date", { ascending: true })
        .limit(5);
      if (plansError) throw plansError;
      if (!plans?.length) continue;

      for (const plan of plans) {
        const { data: items, error: itemsError } = await supabase
          .from("study_agent_items")
          .select("question_text,topic,done,position")
          .eq("plan_id", plan.id)
          .eq("day", date)
          .order("position", { ascending: true })
          .limit(20);
        if (itemsError) throw itemsError;
        const open = (items || []).filter((item: any) => !item.done);
        if (!open.length) continue; // день закрыт — в отчёт не попадает

        const total = (items || []).length;
        const done = total - open.length;
        const eventDate = String(plan.event_date || "").slice(0, 10).split("-").reverse().join(".");
        const lines = open.slice(0, 5).map((item: any, index: number) => {
          const question = escapeHtml(String(item.question_text || "").slice(0, 110));
          const topic = escapeHtml(String(item.topic || "").slice(0, 60));
          return `${index + 1}. ${topic ? `<b>${topic}</b> — ` : ""}${question}`;
        });
        const firstName = escapeHtml((account as any).first_name || "");
        const greeting = firstName ? `🌅 Доброе утро, ${firstName}!` : "🌅 Доброе утро!";
        const html = [
          greeting,
          `🤖 <b>Ночной агент к экзамену</b> подготовил вопросы на сегодня${plan.subject_slug ? ` (${escapeHtml(String(plan.subject_slug))})` : ""} — экзамен ${eventDate}.`,
          `Сегодня: <b>${open.length}</b> из ${total} (сделано ${done}).`,
          "",
          ...lines,
          open.length > 5 ? `\n…и ещё ${open.length - 5}` : "",
        ].filter(Boolean).join("\n");
        chats.push({
          chat_id: telegramUserId,
          html,
          keyboard: [{ text: "📘 Открыть подготовку", url: SITE_STUDY_URL }],
        });
      }
    }

    return c.json(ok({ date, chats }, rid));
  } catch (error) {
    console.error("[agent:morning]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Утренний отчёт агента временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});
}
