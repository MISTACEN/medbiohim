import { requireAuth } from "../../middleware/auth";
import { ok, requestId } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import { publishTelegramHomework, updateMessageClassification } from "../../lib/telegram-homework";
import { gigachatConfigured, gigachatTransport } from "../../lib/gigachat";
import { workersAiConfigured, workersAiModel } from "../../lib/workers-ai";
import { STRICT_ADMINS, UUID, bodyJson, error, gate, type AdminApp } from "./shared";

/**
 * Telegram-чаты, очередь сообщений, публикация задания и webhook.
 */
export function registerTelegram(admin: AdminApp) {


  // Telegram chat management. Bot token and webhook secret are Worker secrets only.
  admin.get("/telegram/ai-status", requireAuth, async (c) => {
    const rid = requestId();
    if (!await gate(c, ["admin", "moderator"])) return;
    return c.json(ok({
      provider: String(c.env.AI_SORT_PROVIDER || "cloudflare"),
      cloudflareAi: {
        configured: workersAiConfigured(c.env),
        model: workersAiModel(c.env),
      },
      gigachat: {
        configured: gigachatConfigured(c.env),
        transport: gigachatTransport(c.env),
        model: String(c.env.GIGACHAT_MODEL || "GigaChat"),
      },
      ingest: {
        configured: Boolean(
          c.env.TELEGRAM_INGEST_SECRET || c.env.TELEGRAM_WEBHOOK_SECRET || c.env.TELEGRAM_BOT_VERIFY_INGEST_URL
        ),
        verifier: c.env.TELEGRAM_INGEST_SECRET || c.env.TELEGRAM_WEBHOOK_SECRET
          ? "local"
          : c.env.TELEGRAM_BOT_VERIFY_INGEST_URL
            ? "bot"
            : "none",
      },
      webhook: {
        configured: Boolean(c.env.TELEGRAM_BOT_TOKEN && (c.env.TELEGRAM_WEBHOOK_URL || c.env.TELEGRAM_WEBHOOK_ORIGIN)),
      },
    }, rid));
  });
  admin.get("/telegram/chats", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase");
    if (!await gate(c, ["admin","moderator"])) return;
    try {
      const { data, error: dbError } = await db.from("telegram_bot_chats").select("*,groups(name,code)").order("created_at", { ascending: false }).limit(500);
      if (dbError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить Telegram-чаты");
      return c.json(ok({ items: data || [] }, rid));
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить Telegram-чаты"); }
  });
  admin.post("/telegram/chats/:chatId/bind", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase"), chatId = (c.req.param("chatId") ?? ""), input = await bodyJson(c);
    if (!await gate(c, ["admin","moderator"])) return;
    const groupId = String(input?.group_id || "");
    if (!/^-?\d{1,24}$/.test(chatId) || !UUID.test(groupId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный chat ID или group_id");
    try {
      const { data: group, error: groupError } = await db.from("groups").select("id").eq("id", groupId).eq("is_active", true).maybeSingle();
      if (groupError || !group) return error(c, rid, 404, "NOT_FOUND", "Активная группа не найдена");
      const { data, error: dbError } = await db.from("telegram_bot_chats").update({ group_id: groupId, is_verified: true, updated_at: new Date().toISOString() }).eq("telegram_chat_id", Number(chatId)).select("*").maybeSingle();
      if (dbError) return error(c, rid, 503, "DB_ERROR", "Не удалось привязать Telegram-чат");
      if (!data) return error(c, rid, 404, "NOT_FOUND", "Чат ещё не зарегистрирован ботом");
      return c.json(ok({ chat: data }, rid));
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "DB_ERROR", "Не удалось привязать Telegram-чат"); }
  });
  admin.get("/telegram/messages", requireAuth, async (c) => {
    const rid = requestId();
    if (!await gate(c, ["admin", "moderator"])) return;
    const db = createServiceClient(c.env);
    if (!db) return error(c, rid, 503, "DB_UNAVAILABLE", "Сервисный доступ к базе не настроен");
    const limit = Math.min(Math.max(Number(c.req.query("limit") || 100), 1), 200);
    const chatId = c.req.query("chat_id") || "";
    try {
      let query = db.from("telegram_messages")
        .select("id,telegram_chat_id,telegram_message_id,message_text,caption,telegram_date,classification,classification_confidence,processing_status,ai_reason,ai_subject_hint,ai_due_hint,created_at,telegram_homework_links(homework_id)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (chatId && /^-?\d{1,24}$/.test(chatId)) query = query.eq("telegram_chat_id", Number(chatId));
      const { data, error: dbError } = await query;
      if (dbError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить сообщения Telegram");
      return c.json(ok({ items: data || [] }, rid));
    } catch (dbError) {
      console.error("[admin:telegram-messages]", dbError);
      return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить сообщения Telegram");
    }
  });

  admin.post("/telegram/messages/:id/publish", requireAuth, async (c) => {
    const rid = requestId();
    if (!await gate(c, ["admin", "moderator"])) return;
    const id = c.req.param("id") || "";
    if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID сообщения");
    const db = createServiceClient(c.env);
    if (!db) return error(c, rid, 503, "DB_UNAVAILABLE", "Сервисный доступ к базе не настроен");
    try {
      const { data: message, error: messageError } = await db.from("telegram_messages")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (messageError) throw messageError;
      if (!message) return error(c, rid, 404, "NOT_FOUND", "Сообщение не найдено");
      const { data: existingLinks, error: linkError } = await db.from("telegram_homework_links")
        .select("homework_id")
        .eq("telegram_message_id", id)
        .limit(1);
      if (linkError) throw linkError;
      if (Array.isArray(existingLinks) && existingLinks.length) {
        return error(c, rid, 409, "ALREADY_PUBLISHED", "Задание по этому сообщению уже создано");
      }
      const { data: chat, error: chatError } = await db.from("telegram_bot_chats")
        .select("*")
        .eq("telegram_chat_id", message.telegram_chat_id)
        .maybeSingle();
      if (chatError) throw chatError;
      if (!chat?.group_id || chat.is_active === false) {
        return error(c, rid, 409, "CHAT_NOT_BOUND", "Сначала привяжите Telegram-чат к учебной группе");
      }
      const text = String(message.message_text || message.caption || "").trim();
      const previousReason = String(message.ai_reason || "");
      const classification = {
        category: "homework" as const,
        confidence: Math.max(0.8, Math.min(1, Number(message.classification_confidence) || 0.8)),
        title: text.slice(0, 120) || "Задание из Telegram",
        summary: text.slice(0, 400),
        subjectHint: message.ai_subject_hint ? String(message.ai_subject_hint) : null,
        dueHint: message.ai_due_hint ? String(message.ai_due_hint) : null,
        tasks: [] as string[],
        reason: "admin_publish",
        provider: previousReason.startsWith("rules_")
          ? "rules" as const
          : previousReason.includes("cloudflare")
            ? "cloudflare" as const
            : previousReason.includes("gigachat")
              ? "gigachat" as const
              : "rules" as const,
        model: null,
      };
      const published = await publishTelegramHomework(db, message, chat, classification);
      await updateMessageClassification(db, id, classification);
      return c.json(ok({ homework: published }, rid));
    } catch (dbError) {
      console.error("[admin:telegram-publish]", dbError);
      return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось опубликовать задание");
    }
  });

  admin.post("/telegram/set-webhook", requireAuth, async (c) => {
    const rid = requestId();
    if (!await gate(c, STRICT_ADMINS)) return;
    const token = String(c.env.TELEGRAM_BOT_TOKEN || "").trim();
    const secret = String(c.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
    const origin = String(c.env.TELEGRAM_WEBHOOK_ORIGIN || "").trim().replace(/\/$/, "");
    const explicitWebhookUrl = String(c.env.TELEGRAM_WEBHOOK_URL || "").trim();
    if (!token || (!origin && !explicitWebhookUrl)) return error(c, rid, 503, "TELEGRAM_NOT_CONFIGURED", "Настройте TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_URL (или TELEGRAM_WEBHOOK_ORIGIN)");
    let response: Response;
    try {
      response = await fetch("https://api.telegram.org/bot" + token + "/setWebhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: explicitWebhookUrl || (() => { try { const parsed = new URL(origin); if (parsed.pathname !== "/" && parsed.pathname !== "") return parsed.toString(); return origin.includes(".workers.dev") ? origin + "/api/webhook" : origin + "/api/v1/telegram/webhook"; } catch { return origin; } })(), allowed_updates: ["message","edited_message"], ...(secret ? { secret_token: secret } : {}) }),
        signal: AbortSignal.timeout(12000),
      });
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 502, "TELEGRAM_WEBHOOK_FAILED", "Не удалось связаться с Telegram"); }
    const result: any = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) return error(c, rid, 502, "TELEGRAM_WEBHOOK_FAILED", "Telegram отклонил настройку webhook");
    return c.json(ok({ configured: true, url: explicitWebhookUrl || (() => { try { const parsed = new URL(origin); if (parsed.pathname !== "/" && parsed.pathname !== "") return parsed.toString(); return origin.includes(".workers.dev") ? origin + "/api/webhook" : origin + "/api/v1/telegram/webhook"; } catch { return origin; } })() }, rid));
  });
}
