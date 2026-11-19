import { ok, fail, requestId } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import { classifyMessage } from "../../lib/telegram-classify";
import { publishTelegramHomework, updateMessageClassification } from "../../lib/telegram-homework";
import type { TelegramChatRow, TelegramMessageRow } from "../../lib/telegram-homework";
import { MAX_BODY_BYTES, HOMEWORK_THRESHOLD, verifyIngestRequest, replyForCreated, replyForContinued, replyForCandidate } from "./shared";

import type { TelegramIngestRouter } from "./types";

export function registerIngestRoutes(telegramIngest: TelegramIngestRouter) {
telegramIngest.post("/ingest", async (c) => {
  const rid = requestId();
  const verification = await verifyIngestRequest(c);
  if (verification !== "ok") {
    if (verification === "unauthorized") {
      const { body, status } = fail("UNAUTHORIZED", "Недействительный секрет Telegram", 401, rid);
      return c.json(body, status as 401);
    }
    if (verification === "rate_limited") {
      const { body, status } = fail("RATE_LIMITED", "Слишком много попыток проверки секрета", 429, rid);
      return c.json(body, status as 429);
    }
    const { body, status } = fail("BOT_NOT_CONFIGURED", "Приём сообщений Telegram не настроен", 503, rid);
    return c.json(body, status as 503);
  }

  const declared = Number(c.req.header("content-length") || 0);
  if (declared > MAX_BODY_BYTES) {
    const { body, status } = fail("PAYLOAD_TOO_LARGE", "Слишком большое обновление Telegram", 413, rid);
    return c.json(body, status as 413);
  }
  let update: any;
  try {
    const text = await c.req.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      const { body, status } = fail("PAYLOAD_TOO_LARGE", "Слишком большое обновление Telegram", 413, rid);
      return c.json(body, status as 413);
    }
    update = JSON.parse(text);
  } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON Telegram", 400, rid);
    return c.json(body, status as 400);
  }

  const message = update?.message || update?.edited_message;
  const chatId = Number(message?.chat?.id);
  const messageId = Number(message?.message_id);
  if (!message || !Number.isSafeInteger(chatId) || !Number.isSafeInteger(messageId)) {
    return c.json(ok({ status: "ignored", reason: "not_a_group_message" }, rid));
  }
  const chatType = String(message?.chat?.type || "");
  if (chatType !== "group" && chatType !== "supergroup") {
    return c.json(ok({ status: "ignored", reason: "not_a_group_chat" }, rid));
  }

  const db = createServiceClient(c.env);
  if (!db) {
    const { body, status } = fail("BOT_NOT_CONFIGURED", "Сервисный доступ к базе не настроен", 503, rid);
    return c.json(body, status as 503);
  }

  try {
    const text = String(message.text || message.caption || "").trim().slice(0, 6000);
    const hasAttachment = Boolean(message.photo || message.document);
    const rawPayload = {
      update_id: update.update_id ?? null,
      message_id: messageId,
      chat: message.chat,
      from: message.from
        ? { id: message.from.id, username: message.from.username || null, first_name: message.from.first_name || null }
        : null,
      date: message.date ?? null,
      text: message.text || null,
      caption: message.caption || null,
      photo: Array.isArray(message.photo) ? message.photo.slice(-1) : null,
      document: message.document
        ? {
            file_id: message.document.file_id,
            file_name: message.document.file_name || null,
            mime_type: message.document.mime_type || null,
            file_size: message.document.file_size || null,
          }
        : null,
      reply_to_message_id: message.reply_to_message?.message_id ?? null,
      media_group_id: message.media_group_id || null,
    };

    let chat = (await db
      .from("telegram_bot_chats")
      .select("*")
      .eq("telegram_chat_id", chatId)
      .maybeSingle()).data as TelegramChatRow | null;
    let chatCreated = false;
    if (!chat) {
      const inserted = await db
        .from("telegram_bot_chats")
        .insert({
          telegram_chat_id: chatId,
          telegram_chat_type: chatType,
          telegram_title: String(message.chat.title || message.chat.username || "").slice(0, 200) || null,
        })
        .select("*")
        .maybeSingle();
      if (inserted.error || !inserted.data) throw new Error("Failed to register Telegram chat");
      chat = inserted.data as TelegramChatRow;
      chatCreated = true;
    } else {
      await db
        .from("telegram_bot_chats")
        .update({
          telegram_title: String(message.chat.title || message.chat.username || "").slice(0, 200) || null,
          updated_at: new Date().toISOString(),
        })
        .eq("telegram_chat_id", chatId);
    }

    const existing = await db
      .from("telegram_messages")
      .select("id,processing_status")
      .eq("telegram_chat_id", chatId)
      .eq("telegram_message_id", messageId)
      .maybeSingle();
    if (existing.data?.id) {
      return c.json(ok({ status: "duplicate", message_id: existing.data.id }, rid));
    }

    const insertedMessage = await db
      .from("telegram_messages")
      .insert({
        telegram_chat_id: chatId,
        telegram_message_id: messageId,
        telegram_user_id: Number.isSafeInteger(Number(message.from?.id)) ? Number(message.from.id) : null,
        reply_to_message_id: Number.isSafeInteger(Number(message.reply_to_message?.message_id))
          ? Number(message.reply_to_message.message_id)
          : null,
        message_text: message.text || null,
        caption: message.caption || null,
        telegram_date: Number.isSafeInteger(Number(message.date)) ? new Date(Number(message.date) * 1000).toISOString() : null,
        telegram_media_group_id: message.media_group_id || null,
        processing_status: "received",
        raw_payload: rawPayload,
      })
      .select("*")
      .maybeSingle();
    if (insertedMessage.error || !insertedMessage.data) {
      // A concurrent webhook retry may have inserted the same message first.
      if ((insertedMessage.error as any)?.code === "23505") {
        return c.json(ok({ status: "duplicate" }, rid));
      }
      throw new Error("Failed to store Telegram message");
    }
    const stored = insertedMessage.data as TelegramMessageRow;

    if (!chat.group_id || chat.is_active === false) {
      await db.from("telegram_messages")
        .update({ processing_status: "ignored", processed_at: new Date().toISOString() })
        .eq("id", stored.id);
      return c.json(ok({
        status: "chat_unbound",
        reply: chatCreated
          ? { text: "Чат зарегистрирован. Привяжите его к учебной группе в админке MEDBIOHIM.", path: "/admin/telegram" }
          : null,
      }, rid));
    }

    await db.from("telegram_messages").update({ processing_status: "processing" }).eq("id", stored.id);
    const classification = await classifyMessage(c.env, {
      text,
      chatTitle: String(chat.telegram_title || message.chat.title || ""),
      hasAttachment,
    });
    await updateMessageClassification(db, stored.id, classification);

    if (classification.category !== "homework" || classification.confidence < HOMEWORK_THRESHOLD) {
      // Never answer ordinary chatter: a group would get a bot message under
      // every "спасибо". Only uncertain homework and attachments are worth a reply.
      const suspicious = classification.category === "homework" || classification.category === "material_candidate";
      return c.json(ok({
        status: "classified",
        classification: {
          category: classification.category,
          confidence: classification.confidence,
          provider: classification.provider,
          model: classification.model,
          subject_hint: classification.subjectHint,
          due_hint: classification.dueHint,
        },
        reply: suspicious ? replyForCandidate(classification) : null,
      }, rid));
    }

    try {
      const published = await publishTelegramHomework(db, stored, chat, classification);
      return c.json(ok({
        status: published.created ? "homework_created" : "homework_continued",
        classification: {
          category: classification.category,
          confidence: classification.confidence,
          provider: classification.provider,
          model: classification.model,
        },
        homework: published,
        reply: published.continued ? replyForContinued(published.title) : replyForCreated(published),
      }, rid));
    } catch (error) {
      console.error("[telegram-ingest:publish]", error);
      await db.from("telegram_messages")
        .update({ processing_status: "failed", ai_reason: "publish_failed" })
        .eq("id", stored.id);
      return c.json(ok({
        status: "publish_failed",
        classification: {
          category: classification.category,
          confidence: classification.confidence,
          provider: classification.provider,
        },
        reply: {
          text: "⚠️ Сообщение распознано как задание, но сохранить его не удалось. Администратор увидит его в очереди.",
          path: "/admin/telegram",
        },
      }, rid));
    }
  } catch (error) {
    console.error("[telegram-ingest]", error);
    const { body, status } = fail("TELEGRAM_INGEST_FAILED", "Не удалось обработать сообщение Telegram", 503, rid);
    return c.json(body, status as 503);
  }
});
}
