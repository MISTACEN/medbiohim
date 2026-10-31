import { createClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import type { Env } from "../env";
import { fail, ok, requestId } from "../lib/response";

const telegram = new Hono<{ Bindings: Env }>();

function constantTimeEqual(actual: string, expected: string): boolean {
  if (!actual || !expected || actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i += 1) {
    difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

telegram.post("/account-link/confirm", async (c) => {
  const rid = requestId();
  // Бот аутентифицируется одним из двух общих секретов: классическим
  // TELEGRAM_WEBHOOK_SECRET (заголовок Telegram) или общим внутренним
  // TELEGRAM_INTERNAL_SECRET (тот же, что verify-initdata/notify). Раньше
  // здесь требовался только webhook-секрет, которого на API-воркере нет —
  // подтверждение привязки всегда отвечало 503.
  const webhookSecret = c.env.TELEGRAM_WEBHOOK_SECRET || "";
  const internalSecret = c.env.TELEGRAM_INTERNAL_SECRET || "";
  if (!webhookSecret && !internalSecret) {
    const { body, status } = fail("BOT_NOT_CONFIGURED", "Подтверждение Telegram временно недоступно", 503, rid);
    return c.json(body, status as 503);
  }
  const providedTelegram = c.req.header("x-telegram-bot-api-secret-token") || "";
  const providedInternal = c.req.header("x-medbiohim-internal") || "";
  const authorized = (webhookSecret && constantTimeEqual(providedTelegram, webhookSecret))
    || (internalSecret && constantTimeEqual(providedInternal, internalSecret));
  if (!authorized) {
    const { body, status } = fail("UNAUTHORIZED", "Недействительный секрет Telegram webhook", 401, rid);
    return c.json(body, status as 401);
  }

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    const { body, status } = fail("VALIDATION_ERROR", "Ожидался объект подтверждения", 400, rid);
    return c.json(body, status as 400);
  }
  const input = payload as Record<string, unknown>;
  const token = typeof input.token === "string" ? input.token.toLowerCase() : "";
  const telegramUserId = typeof input.telegram_user_id === "string" ? input.telegram_user_id : "";
  if (!/^[a-f0-9]{48}$/.test(token) || !/^[1-9][0-9]{0,17}$/.test(telegramUserId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректные данные привязки", 422, rid);
    return c.json(body, status as 422);
  }
  const username = typeof input.username === "string" ? input.username.trim().slice(0, 64) || null : null;
  const firstName = typeof input.first_name === "string" ? input.first_name.trim().slice(0, 128) || null : null;
  const serviceKey = c.env.SUPABASE_SERVICE_ROLE_KEY || c.env.SUPABASE_SERVICE_KEY || c.env.SUPABASE_SECRET_KEY;
  if (!serviceKey) {
    const { body, status } = fail("TELEGRAM_LINK_UNAVAILABLE", "Сервис привязки Telegram не настроен", 503, rid);
    return c.json(body, status as 503);
  }

  try {
    const admin = createClient(c.env.SUPABASE_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await admin.rpc("confirm_telegram_account_link", {
      p_token_hash: await sha256Hex(token),
      p_telegram_user_id: telegramUserId,
      p_username: username,
      p_first_name: firstName,
    });
    if (error) {
      console.error("[telegram:account-link]", { code: error.code, message: error.message, requestId: rid });
      const { body, status } = fail("TELEGRAM_LINK_UNAVAILABLE", "Не удалось подтвердить привязку Telegram", 503, rid);
      return c.json(body, status as 503);
    }
    const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
    if (result.status === "linked") return c.json(ok({ linked: true }, rid));
    if (result.status === "invalid") {
      const { body, status } = fail("LINK_TOKEN_INVALID", "Ссылка истекла или уже использована. Создайте новую.", 410, rid);
      return c.json(body, status as 410);
    }
    if (result.status === "already_linked") {
      const { body, status } = fail("TELEGRAM_ALREADY_LINKED", "Один из аккаунтов уже связан с другим профилем.", 409, rid);
      return c.json(body, status as 409);
    }
    const { body, status } = fail("TELEGRAM_LINK_UNAVAILABLE", "Не удалось подтвердить привязку Telegram", 503, rid);
    return c.json(body, status as 503);
  } catch (error) {
    console.error("[telegram:account-link]", { error: String(error), requestId: rid });
    const { body, status } = fail("TELEGRAM_LINK_UNAVAILABLE", "Не удалось подтвердить привязку Telegram", 503, rid);
    return c.json(body, status as 503);
  }
});

export default telegram;
