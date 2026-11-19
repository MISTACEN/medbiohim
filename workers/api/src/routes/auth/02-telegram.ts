import { ok, fail, requestId } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import { rateLimit } from "../../lib/redis";
import { hasRemoteVerifier, validateTelegramInitData, verifyTelegramInitDataRemote } from "../../lib/telegram-initdata";
import { hasWidgetVerifier, validateTelegramLoginWidget, verifyTelegramLoginWidgetRemote } from "../../lib/telegram-widget";
import { readJson, clientIp, mintTelegramSession } from "./shared";

import type { AuthRouter } from "./types";

export function registerTelegramRoutes(auth: AuthRouter) {
auth.post("/telegram/webapp", async (c) => {
  const rid = requestId();
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, `auth:telegram-webapp:${ip}`, 20, 60);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много попыток входа", 429, rid);
    return c.json(body, status as 429);
  }

  const botToken = c.env.TELEGRAM_BOT_TOKEN?.trim();
  const canVerifyRemotely = hasRemoteVerifier(c.env);
  if (!botToken && !canVerifyRemotely) {
    const { body, status } = fail("TELEGRAM_NOT_CONFIGURED", "Вход через Telegram временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }

  const body = await readJson<{ init_data?: string }>(c);
  if (!body || typeof body.init_data !== "string" || !body.init_data) {
    const { body: b, status } = fail("VALIDATION", "Нужен init_data", 400, rid);
    return c.json(b, status as 400);
  }

  // Local crypto when this Worker owns the token; otherwise delegate to the bot
  // Worker, which does. The bot token never has to be copied here.
  const verification = botToken
    ? await validateTelegramInitData(body.init_data, botToken)
    : await verifyTelegramInitDataRemote(body.init_data, c.env);
  if (!verification.ok) {
    if (!botToken && (verification.error === "internal_not_configured" || verification.error === "internal_unavailable")) {
      // An infrastructure problem, not the caller's credentials — never report it
      // as a signature failure.
      const { body: b, status } = fail("TELEGRAM_LOGIN_UNAVAILABLE", "Вход через Telegram временно недоступен", 503, rid);
      return c.json(b, status as 503);
    }
    // Deliberately generic: never tell a forger which check failed.
    const { body: b, status } = fail("INVALID_INIT_DATA", "Не удалось подтвердить данные Telegram", 401, rid);
    return c.json(b, status as 401);
  }

  const service = createServiceClient(c.env);
  if (!service) {
    const { body: b, status } = fail("TELEGRAM_LOGIN_UNAVAILABLE", "Вход через Telegram временно недоступен", 503, rid);
    return c.json(b, status as 503);
  }

  try {
    const minted = await mintTelegramSession(service, c.env, verification.user.id, rid);
    if (!minted.ok) {
      const { body: b, status } = fail(minted.code, minted.message, minted.status, rid);
      return c.json(b, status as 409);
    }
    // Same envelope as /login so the shared frontend client keeps working.
    return c.json(ok({ ...minted.session, session: minted.session }, rid));
  } catch (error) {
    console.error("[auth:telegram-webapp]", {
      stage: "unhandled",
      error: error instanceof Error ? error.name : "unknown",
      requestId: rid,
    });
    const { body: b, status } = fail("AUTH_UPSTREAM", "Сервис авторизации временно недоступен", 503, rid);
    return c.json(b, status as 503);
  }
});

auth.get("/telegram/config", (c) => {
  const rid = requestId();
  const botUsername = c.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!botUsername) {
    const { body, status } = fail("TELEGRAM_NOT_CONFIGURED", "Вход через Telegram временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
  return c.json(ok({ bot_username: botUsername }, rid));
});

auth.post("/telegram/widget", async (c) => {
  const rid = requestId();
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, `auth:telegram-widget:${ip}`, 20, 60);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много попыток входа", 429, rid);
    return c.json(body, status as 429);
  }

  const botToken = c.env.TELEGRAM_BOT_TOKEN?.trim();
  const canVerifyRemotely = hasWidgetVerifier(c.env);
  if (!botToken && !canVerifyRemotely) {
    const { body, status } = fail("TELEGRAM_NOT_CONFIGURED", "Вход через Telegram временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }

  const body = await readJson<Record<string, unknown>>(c);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const { body: b, status } = fail("VALIDATION", "Нужен payload виджета", 400, rid);
    return c.json(b, status as 400);
  }

  const verification = botToken
    ? await validateTelegramLoginWidget(body, botToken)
    : await verifyTelegramLoginWidgetRemote(body, c.env);
  if (!verification.ok) {
    if (!botToken && (verification.error === "internal_not_configured" || verification.error === "internal_unavailable")) {
      // An infrastructure problem, not the caller's credentials — never report it
      // as a signature failure.
      const { body: b, status } = fail("TELEGRAM_LOGIN_UNAVAILABLE", "Вход через Telegram временно недоступен", 503, rid);
      return c.json(b, status as 503);
    }
    // Deliberately generic: never tell a forger which check failed.
    const { body: b, status } = fail("INVALID_INIT_DATA", "Не удалось подтвердить данные Telegram", 401, rid);
    return c.json(b, status as 401);
  }

  const service = createServiceClient(c.env);
  if (!service) {
    const { body: b, status } = fail("TELEGRAM_LOGIN_UNAVAILABLE", "Вход через Telegram временно недоступен", 503, rid);
    return c.json(b, status as 503);
  }

  try {
    const minted = await mintTelegramSession(service, c.env, verification.user.id, rid);
    if (!minted.ok) {
      const { body: b, status } = fail(minted.code, minted.message, minted.status, rid);
      return c.json(b, status as 409);
    }
    // Same envelope as /login so the shared frontend client keeps working.
    return c.json(ok({ ...minted.session, session: minted.session }, rid));
  } catch (error) {
    console.error("[auth:telegram-widget]", {
      stage: "unhandled",
      error: error instanceof Error ? error.name : "unknown",
      requestId: rid,
    });
    const { body: b, status } = fail("AUTH_UPSTREAM", "Сервис авторизации временно недоступен", 503, rid);
    return c.json(b, status as 503);
  }
});
}
