const crypto = require("node:crypto");
const { getCommandResponse } = require("../lib/commands");

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function parseUpdateBody(req) {
  let body = req.body;
  if (body === undefined || body === null) {
    if (typeof req[Symbol.asyncIterator] !== "function") return null;
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 256 * 1024) throw new Error("REQUEST_TOO_LARGE");
      chunks.push(buffer);
    }
    body = Buffer.concat(chunks);
  }
  if (Buffer.isBuffer(body)) body = body.toString("utf8");
  if (typeof body === "string") {
    if (Buffer.byteLength(body, "utf8") > 256 * 1024) throw new Error("REQUEST_TOO_LARGE");
    try { body = JSON.parse(body); } catch { return null; }
  }
  return body && typeof body === "object" && !Array.isArray(body) ? body : null;
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
  let resultBody = null;
  try { resultBody = await result.json(); } catch {}
  if (!result.ok || !resultBody || resultBody.ok !== true) {
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

  let update;
  try {
    update = await parseUpdateBody(req);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      return res.status(413).json({ ok: false, error: "PAYLOAD_TOO_LARGE" });
    }
    return res.status(400).json({ ok: false, error: "INVALID_UPDATE" });
  }
  if (!update) return res.status(400).json({ ok: false, error: "INVALID_UPDATE" });

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
