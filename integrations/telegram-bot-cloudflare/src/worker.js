const MAX_BODY_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_APP_ORIGIN = "https://medbiohim.vercel.app";

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || !left || !right) return false;
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function appOrigin(env) {
  try {
    const url = new URL(env.MEDBIOHIM_APP_URL || DEFAULT_APP_ORIGIN);
    if (url.protocol !== "https:") return DEFAULT_APP_ORIGIN;
    return url.origin;
  } catch {
    return DEFAULT_APP_ORIGIN;
  }
}

function parseCommand(text, env) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const first = trimmed.split(/\s+/, 1)[0];
  const [name, addressedBot] = first.slice(1).split("@", 2);
  const configuredBot = (env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "").toLowerCase();
  if (addressedBot && (!configuredBot || addressedBot.toLowerCase() !== configuredBot)) return null;
  return name.toLowerCase();
}

function commandResponse(text, env) {
  const origin = appOrigin(env);
  const command = parseCommand(text, env);
  if (!command) return null;
  const commands = {
    start: {
      text: "Привет! MEDBIOHIM помогает готовиться к занятиям, тестам и экзаменам. Откройте платформу кнопкой ниже или используйте /help. Пока бот не запрашивает личные данные.",
      webApp: true,
    },
    help: {
      text: "Команды MEDBIOHIM:\n/start — приветствие и кнопка открытия приложения\n/app — открыть MEDBIOHIM внутри Telegram\n/site — открыть платформу\n/schedule — открыть расписание на сайте\n/tests — открыть тесты\n/subjects — открыть предметы и атлас\n/materials — открыть материалы\n/homework — как передать задание из учебной группы\n/privacy — правила приватности",
    },
    homework: {
      text: "Чтобы бот мог разобрать задание, оно должно быть отправлено в подключённую учебную группу, где настроен импорт MEDBIOHIM. Можно прислать текст, фото или документ; подпишите предмет/срок, если они не очевидны. Проверьте результат в платформе. В личном чате эта команда ничего не импортирует.",
    },
    site: { text: "Открыть MEDBIOHIM", path: "/" },
    app: { text: "Открыть MEDBIOHIM внутри Telegram", webApp: true },
    schedule: { text: "Открыть расписание MEDBIOHIM", path: "/schedule" },
    tests: { text: "Открыть тесты MEDBIOHIM", path: "/tests" },
    subjects: { text: "Открыть предметы и атлас MEDBIOHIM", path: "/subjects" },
    materials: { text: "Открыть материалы MEDBIOHIM", path: "/materials" },
    privacy: {
      text: "Бот пока не связывает Telegram с аккаунтом MEDBIOHIM и не получает личные данные. Не отправляйте сюда пароли, коды входа, токены или медицинские/учебные персональные данные. Приватные функции появятся только после отдельной безопасной привязки аккаунта.",
    },
  };
  const result = commands[command] || {
    text: "Не знаю эту команду. Напишите /help, чтобы увидеть список доступных команд.",
  };
  return {
    text: result.text,
    url: result.path ? new URL(result.path, origin).toString() : null,
    webAppUrl: result.webApp ? new URL("/", origin).toString() : null,
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function readUpdate(request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return { error: "PAYLOAD_TOO_LARGE", status: 413 };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return { error: "PAYLOAD_TOO_LARGE", status: 413 };
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "INVALID_UPDATE", status: 400 };
    return { update: value };
  } catch {
    return { error: "INVALID_UPDATE", status: 400 };
  }
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function sendTelegramMessage(env, chatId, response) {
  const payload = { chat_id: chatId, text: response.text, disable_web_page_preview: true };
  if (response.webAppUrl) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: "Открыть MEDBIOHIM", web_app: { url: response.webAppUrl } }]],
    };
  } else if (response.url) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: "Открыть раздел", url: response.url }]],
    };
  }
  const result = await fetchWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  let body;
  try { body = await result.json(); } catch { body = null; }
  if (!result.ok || !body || body.ok !== true) throw new Error("Telegram delivery failed");
}

async function relayGroupUpdate(env, update) {
  const endpoint = env.TELEGRAM_HOMEWORK_WEBHOOK_URL;
  if (!endpoint) return { configured: false };
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  let target;
  try { target = new URL(endpoint); } catch { throw new Error("Invalid relay URL"); }
  if (target.protocol !== "https:") throw new Error("Relay URL must use HTTPS");
  const result = await fetchWithTimeout(target.toString(), {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(update),
  });
  if (!result.ok) throw new Error("Homework relay failed");
  return { configured: true };
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/health") {
    return json({ ok: true, service: "medbiohim-telegram-bot", configured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET) });
  }
  if (url.pathname !== "/api/webhook") return json({ ok: false, error: "NOT_FOUND" }, 404);
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", allow: "POST" },
    });
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ ok: false, error: "BOT_NOT_CONFIGURED" }, 503);
  }
  if (!safeEqual(request.headers.get("x-telegram-bot-api-secret-token"), env.TELEGRAM_WEBHOOK_SECRET)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const parsed = await readUpdate(request);
  if (parsed.error) return json({ ok: false, error: parsed.error }, parsed.status);
  const update = parsed.update;
  const message = update.message || update.edited_message;
  if (!message?.chat || typeof message.chat.id !== "number") return json({ ok: true, ignored: true });

  if (message.chat.type === "group" || message.chat.type === "supergroup") {
    try {
      const result = await relayGroupUpdate(env, update);
      return json({ ok: true, forwarded: result.configured });
    } catch {
      // Do not log payloads, chat IDs, secrets, or upstream response bodies.
      return json({ ok: false, error: "HOMEWORK_RELAY_FAILED" }, 502);
    }
  }
  if (message.chat.type !== "private") return json({ ok: true, ignored: true });

  const response = commandResponse(message.text, env);
  if (!response) return json({ ok: true, ignored: true });
  try {
    await sendTelegramMessage(env, message.chat.id, response);
  } catch {
    return json({ ok: false, error: "TELEGRAM_DELIVERY_FAILED" }, 502);
  }
  return json({ ok: true });
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
