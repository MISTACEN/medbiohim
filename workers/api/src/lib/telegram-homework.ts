/**
 * Persistence for Telegram → homework. The bot never writes to Supabase; the
 * API Worker does it with the service key after verifying the shared secret.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Classification } from "./telegram-classify";
import { buildHomeworkDescription, buildHomeworkTitle, parseDueAt } from "./telegram-classify";
import { normalizeSearchText } from "./search-query";

export type TelegramChatRow = {
  id?: string;
  telegram_chat_id: number;
  telegram_chat_type?: string | null;
  telegram_title?: string | null;
  group_id?: string | null;
  is_active?: boolean | null;
  is_verified?: boolean | null;
};

export type TelegramMessageRow = {
  id: string;
  telegram_chat_id: number;
  telegram_message_id: number;
  reply_to_message_id?: number | null;
  message_text?: string | null;
  caption?: string | null;
  telegram_media_group_id?: string | null;
  telegram_date?: string | null;
  classification?: string | null;
  classification_confidence?: number | null;
  ai_reason?: string | null;
  ai_subject_hint?: string | null;
  ai_due_hint?: string | null;
};

export type PublishResult = {
  homework_id: string;
  created: boolean;
  continued: boolean;
  subject_name: string | null;
  due_at: string | null;
  title: string;
};

function messageText(message: TelegramMessageRow): string {
  return String(message.message_text || message.caption || "").trim();
}

/** Subject is inferred from the text/hint against the real subject catalog. */
export async function resolveSubject(
  db: SupabaseClient,
  text: string,
  hint: string | null
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await db
    .from("subjects")
    .select("id,name,slug")
    .eq("is_active", true)
    .limit(500);
  if (error || !Array.isArray(data) || !data.length) return null;

  const haystack = normalizeSearchText(`${text} ${hint || ""}`);
  let best: { id: string; name: string } | null = null;
  let bestScore = 0;
  for (const row of data as Array<Record<string, any>>) {
    const name = String(row.name || "").trim();
    const slug = String(row.slug || "").replace(/_/g, " ");
    if (!name) continue;
    const normalizedName = normalizeSearchText(name);
    const tokens = normalizedName.split(" ").filter((token) => token.length >= 4);
    let score = 0;
    if (normalizedName && haystack.includes(normalizedName)) score += 0.9;
    if (slug && haystack.includes(normalizeSearchText(slug))) score += 0.7;
    if (tokens.length) {
      const matched = tokens.filter((token) => haystack.includes(token)).length;
      score += (matched / tokens.length) * 0.45;
    }
    if (hint && normalizedName === normalizeSearchText(hint)) score = Math.max(score, 0.98);
    if (score > bestScore) {
      bestScore = score;
      best = { id: String(row.id), name };
    }
  }
  return bestScore >= 0.55 ? best : null;
}

async function findLinkedHomework(
  db: SupabaseClient,
  message: TelegramMessageRow
): Promise<{ id: string; description?: string | null } | null> {
  const filters: Array<Record<string, unknown>> = [];
  if (message.reply_to_message_id) {
    filters.push({ telegram_chat_id: message.telegram_chat_id, telegram_message_id: message.reply_to_message_id });
  }
  if (message.telegram_media_group_id) {
    filters.push({
      telegram_chat_id: message.telegram_chat_id,
      telegram_media_group_id: message.telegram_media_group_id,
    });
  }
  for (const filter of filters) {
    let query = db
      .from("telegram_messages")
      .select("id,telegram_homework_links(homework_id,homeworks(id,description))")
      .limit(1);
    for (const [key, value] of Object.entries(filter)) query = query.eq(key, value as any);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) continue;
    for (const row of data as Array<Record<string, any>>) {
      const links = Array.isArray(row.telegram_homework_links)
        ? row.telegram_homework_links
        : row.telegram_homework_links ? [row.telegram_homework_links] : [];
      for (const link of links) {
        const homework = Array.isArray(link.homeworks) ? link.homeworks[0] : link.homeworks;
        if (homework?.id) return { id: String(homework.id), description: homework.description || null };
      }
    }
  }
  return null;
}

async function appendDescription(db: SupabaseClient, homeworkId: string, text: string): Promise<void> {
  const { data, error } = await db
    .from("homeworks")
    .select("description")
    .eq("id", homeworkId)
    .maybeSingle();
  if (error) return;
  const current = String((data as any)?.description || "").trim();
  const next = (current ? current + "\n\n" : "") + text;
  await db.from("homeworks").update({ description: next.slice(0, 20_000) }).eq("id", homeworkId);
}

export async function updateMessageClassification(
  db: SupabaseClient,
  messageId: string,
  classification: Classification
): Promise<void> {
  await db
    .from("telegram_messages")
    .update({
      classification: classification.category,
      classification_confidence: classification.confidence,
      ai_reason: `${classification.reason} · ${classification.provider}${classification.model ? ":" + classification.model : ""}`.slice(0, 500),
      ai_subject_hint: classification.subjectHint,
      ai_due_hint: classification.dueHint,
      ai_processed_at: new Date().toISOString(),
      processing_status: "processed",
      processed_at: new Date().toISOString(),
    })
    .eq("id", messageId);
}

export async function publishTelegramHomework(
  db: SupabaseClient,
  message: TelegramMessageRow,
  chat: TelegramChatRow,
  classification: Classification
): Promise<PublishResult> {
  const groupId = String(chat.group_id || "");
  if (!groupId) throw new Error("Chat is not bound to a group");

  const text = messageText(message);
  const existing = await findLinkedHomework(db, message);
  if (existing) {
    const description = buildHomeworkDescription(classification, text);
    await appendDescription(db, existing.id, description);
    await db.from("telegram_homework_links").upsert({
      telegram_message_id: message.id,
      homework_id: existing.id,
      relation_type: "continuation",
      confidence: classification.confidence,
    }, { onConflict: "telegram_message_id,homework_id" });
    return {
      homework_id: existing.id,
      created: false,
      continued: true,
      subject_name: classification.subjectHint,
      due_at: parseDueAt(`${classification.dueHint || ""} ${text}`),
      title: classification.title,
    };
  }

  const subject = await resolveSubject(db, text, classification.subjectHint);
  const dueAt = parseDueAt(`${classification.dueHint || ""} ${text}`);
  const title = buildHomeworkTitle(classification, text);
  const description = buildHomeworkDescription(classification, text);
  const insert: Record<string, unknown> = {
    group_id: groupId,
    subject_id: subject?.id || null,
    title,
    description,
    due_at: dueAt,
    due_date: dueAt ? dueAt.slice(0, 10) : null,
    created_by: null,
    created_by_role: "staff",
    status: "open",
  };
  const { data, error } = await db
    .from("homeworks")
    .insert(insert)
    .select("id,title,due_at")
    .maybeSingle();
  if (error || !data?.id) throw new Error("Failed to create homework");

  await db.from("telegram_homework_links").upsert({
    telegram_message_id: message.id,
    homework_id: data.id,
    relation_type: "source",
    confidence: classification.confidence,
  }, { onConflict: "telegram_message_id,homework_id" });

  return {
    homework_id: String(data.id),
    created: true,
    continued: false,
    subject_name: subject?.name || null,
    due_at: dueAt,
    title: String(data.title || title),
  };
}
