import type { Env } from "../../env";
import { ok } from "../../lib/response";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const relation = (value: any) => Array.isArray(value) ? value[0] : value;

export async function callerRoles(db: any, userId: string): Promise<string[]> {
  const { data, error } = await db.from("user_roles").select("roles(code)").eq("user_id", userId).limit(25);
  if (error) throw error;
  const codes: string[] = [];
  for (const row of data || []) {
    const roleRows = Array.isArray(row?.roles) ? row.roles : row?.roles ? [row.roles] : [];
    for (const role of roleRows) {
      const code = String(role?.code || "").toLowerCase().trim();
      if (code) codes.push(code);
    }
  }
  return [...new Set(codes)];
}

/**
 * §8 «Умный импорт» (Smart Paste): староста вставляет текст из чата,
 * воркер разбирает его по правилам (тема, дедлайн, чек-лист, критерии) —
 * без AI и без додумывания дат. Клиент показывает предпросмотр и сам
 * решает, что подставить в форму.
 */

export async function notifyGroupNewHomework(env: Env, executionCtx: { waitUntil(promise: Promise<unknown>): void }, homework: {
  id: string; title: string; due_date: string | null; group_id: string | null;
  subjects?: { name?: string | null } | Array<{ name?: string | null }> | null;
  schedule_entries?: { date?: string | null; subject_name?: string | null } | Array<{ date?: string | null; subject_name?: string | null }> | null;
}, db: any): Promise<void> {
  try {
    const notifyUrl = String(env.TELEGRAM_NOTIFY_URL || "").trim();
    // Бот проверяет x-medbiohim-internal по internalSecret(): приоритет у
    // TELEGRAM_INTERNAL_SECRET, WEBHOOK_SECRET — только фолбэк у бота.
    const secret = String(env.TELEGRAM_INTERNAL_SECRET || env.TELEGRAM_WEBHOOK_SECRET || "").trim();
    if (!notifyUrl || !secret || !homework.group_id) return;
    const { data: chats } = await db
      .from("telegram_bot_chats")
      // Колонка называется telegram_chat_id, а не chat_id.
      .select("telegram_chat_id")
      .eq("group_id", homework.group_id)
      .eq("is_active", true)
      .limit(20);
    if (!chats?.length) return;
    const subject = (Array.isArray(homework.subjects) ? homework.subjects[0]?.name : homework.subjects?.name)
      || (Array.isArray(homework.schedule_entries) ? homework.schedule_entries[0]?.subject_name : homework.schedule_entries?.subject_name)
      || null;
    const due = homework.due_date ? homework.due_date.split("-").reverse().join(".") : null;
    const html = [
      "<b>📝 Новое задание</b>",
      escapeHwHtml(homework.title),
      subject ? `📚 ${escapeHwHtml(subject)}` : "",
      due ? `⏰ Срок: <b>${due}</b>` : "",
    ].filter(Boolean).join("\n");
    for (const chat of chats) {
      // Service binding first: a Worker fetch to the public workers.dev URL is
      // cut at the edge by account bot protection (non-browser agents, 403).
      const botBinding = env.TELEGRAM_BOT;
      const doFetch: (u: string, i?: RequestInit) => Promise<Response> = botBinding
        ? (u, i) => botBinding.fetch(u, i)
        : (u, i) => fetch(u, i);
      executionCtx.waitUntil(
        doFetch(notifyUrl, {
          method: "POST",
          headers: { "content-type": "application/json", "x-medbiohim-internal": secret },
          body: JSON.stringify({ chat_id: chat.telegram_chat_id, html }),
        }).then((response) => {
          if (!response.ok) console.error("[homework:notify]", response.status);
        }).catch((error) => {
          console.error("[homework:notify]", String(error));
        })
      );
    }
  } catch (error) {
    console.error("[homework:notify]", String(error));
  }
}

export function escapeHwHtml(value: string): string {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
