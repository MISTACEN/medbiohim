const crypto = require("node:crypto");
const { getCommandResponse } = require("../lib/commands");

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function sendTelegramMessage(chatId, response) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const payload = {
    chat_id: chatId,
    text: response.text,
    disable_web_page_preview: true,
  };
  if (response.url) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: "Открыть раздел", url: response.url }]],
    };
  }
  const result = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  if (!result.ok) {
    // Never log the bot token, full Telegram response, or chat ID.
    throw new Error(`Telegram sendMessage failed with HTTP ${result.status}`);
  }
}

module.exports = async function webhook(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret || !process.env.TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ ok: false, error: "BOT_NOT_CONFIGURED" });
  }

  const receivedSecret = req.headers["x-telegram-bot-api-secret-token"];
  if (!safeEqual(receivedSecret, expectedSecret)) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const update = req.body;
  if (!update || typeof update !== "object" || Array.isArray(update)) {
    return res.status(400).json({ ok: false, error: "INVALID_UPDATE" });
  }

  const message = update.message;
  if (!message || !message.chat || message.chat.type !== "private" || typeof message.chat.id !== "number") {
    // Ignore group/channel posts; the MVP is private-chat-only.
    return res.status(200).json({ ok: true, ignored: true });
  }

  const response = getCommandResponse(message.text);
  if (!response) return res.status(200).json({ ok: true, ignored: true });

  try {
    await sendTelegramMessage(message.chat.id, response);
  } catch (error) {
    // Keep the HTTP response free of tokens, payloads, and private chat identifiers.
    console.error("[telegram-bot] sendMessage failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(502).json({ ok: false, error: "TELEGRAM_DELIVERY_FAILED" });
  }

  return res.status(200).json({ ok: true });
};
