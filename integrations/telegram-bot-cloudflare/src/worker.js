import { constantTimeEqual, validateTelegramInitData } from "./initdata.js";
import { validateTelegramLoginWidget } from "./loginwidget.js";

const MAX_BODY_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_APP_ORIGIN = "https://medbiohim.vercel.app";
const UPDATE_DEDUP_TTL_SECONDS = 24 * 60 * 60;
const UPDATE_DEDUP_PREFIX = "telegram:update:";

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || !left || !right) return false;
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * A `.vercel.app` host other than the canonical one is a preview/branch
 * deployment — a stale build that must never be presented as the site.
 */
function isPreviewHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host !== "vercel.app" && !host.endsWith(".vercel.app")) return false;
  return host !== "medbiohim.vercel.app";
}

function safeAppOrigin(value, fallback) {
  try {
    const url = new URL(value || fallback);
    if (url.protocol !== "https:") return fallback;
    if (isPreviewHost(url.hostname)) return fallback;
    return url.origin;
  } catch {
    return fallback;
  }
}

// There is exactly one canonical site. Preview/branch deployments and private
// hosts are never emitted, even if they somehow end up in the environment.
function appOrigin(env) {
  return safeAppOrigin(env && env.MEDBIOHIM_APP_URL, DEFAULT_APP_ORIGIN);
}

function appUrl(env, path = "/") {
  return new URL(path, appOrigin(env)).toString();
}

function openButton(env, label, path) {
  return [[{ text: label, url: appUrl(env, path) }]];
}

// Real sections of the canonical site. `button` is the inline-keyboard label,
// `path` is a page on the canonical origin only.
const SITE_SECTIONS = [
  {
    command: "schedule",
    path: "/schedule",
    button: "📅 Расписание",
    text: "Расписание занятий MEDBIOHIM: пары, аудитории и изменения.",
  },
  {
    command: "homework",
    path: "/homework",
    button: "📝 Задания",
    text: "Задания и домашняя работа MEDBIOHIM. Импорт заданий работает в подключённой учебной группе, где настроен конвейер MEDBIOHIM: пришлите текст, фото или документ и подпишите предмет и срок, если они не очевидны. В личном чате команда ничего не импортирует — она открывает раздел заданий на сайте.",
  },
  {
    command: "subjects",
    path: "/subjects",
    button: "📚 Предметы",
    text: "Предметы, темы и атлас MEDBIOHIM.",
  },
  {
    command: "materials",
    path: "/materials",
    button: "📖 Материалы",
    text: "Учебные материалы, лекции и файлы MEDBIOHIM.",
  },
  {
    command: "tests",
    path: "/tests",
    button: "🧪 Тесты",
    text: "Тесты, банк вопросов и режим подготовки MEDBIOHIM.",
  },
  {
    command: "tickets",
    path: "/tickets",
    button: "🎫 Билеты",
    text: "Экзаменационные билеты и подготовка к ним.",
  },
  {
    command: "university",
    path: "/university",
    button: "🏛 Вузовский хаб",
    text: "Вузовский хаб ДВГМУ: учебные материалы, сохранённое и импорт.",
  },
  {
    command: "cards",
    path: "/cards",
    button: "🃏 Карточки SRS",
    text: "Карточки для интервального повторения (SRS).",
  },
  {
    command: "progress",
    path: "/progress",
    button: "📈 Прогресс",
    text: "Ваш прогресс обучения на платформе MEDBIOHIM.",
  },
  {
    command: "calculators",
    path: "/calculators",
    button: "🧮 Калькуляторы",
    text: "Медицинские калькуляторы MEDBIOHIM.",
  },
  {
    command: "latin",
    path: "/latin",
    button: "🔤 Латынь",
    text: "Латинский язык: термины и тренировки.",
  },
  {
    command: "extension",
    path: "/extension",
    button: "🧩 Расширение",
    text: "Браузерное расширение MEDBIOHIM: быстрый доступ к разделам платформы.",
  },
  {
    command: "login",
    path: "/login",
    button: "🔑 Войти",
    text: "Вход в аккаунт MEDBIOHIM.",
  },
  {
    command: "register",
    path: "/register",
    button: "🆕 Регистрация",
    text: "Создание аккаунта MEDBIOHIM.",
  },
  {
    command: "status",
    path: "/settings",
    button: "⚙️ Настройки → Telegram",
    text: "Показать статус привязки прямо в боте нельзя: для этого нужен токен вашего аккаунта, а бот его не получает. Проверьте привязку на сайте: Настройки → Telegram. Там же её можно отвязать.",
  },
];

const SECTION_BY_COMMAND = new Map(SITE_SECTIONS.map((section) => [section.command, section]));

// Registered with Telegram for this bot. /oldsite, /main and /site are
// deliberately absent: they stay as hidden aliases for cached old menus.
const BOT_COMMANDS = [
  { command: "start", description: "Начать и открыть меню" },
  { command: "help", description: "Помощь и список команд" },
  { command: "menu", description: "Все разделы кнопками" },
  { command: "app", description: "Открыть MEDBIOHIM" },
  { command: "login", description: "Войти в аккаунт" },
  { command: "register", description: "Создать аккаунт" },
  { command: "link", description: "Привязать Telegram к аккаунту" },
  { command: "status", description: "Статус привязки и настройки" },
  { command: "schedule", description: "Расписание занятий" },
  { command: "homework", description: "Задания и домашняя работа" },
  { command: "subjects", description: "Предметы и атлас" },
  { command: "materials", description: "Учебные материалы" },
  { command: "tests", description: "Тесты и подготовка" },
  { command: "tickets", description: "Экзаменационные билеты" },
  { command: "university", description: "Вузовский хаб ДВГМУ" },
  { command: "cards", description: "Карточки SRS" },
  { command: "progress", description: "Прогресс обучения" },
  { command: "calculators", description: "Медицинские калькуляторы" },
  { command: "latin", description: "Латинский язык" },
  { command: "extension", description: "Браузерное расширение" },
  { command: "privacy", description: "Приватность и данные" },
];

const PRIVACY_TEXT = [
  "Приватность MEDBIOHIM.",
  "Привязка Telegram к аккаунту действительно есть: сайт создаёт в разделе Настройки → Telegram одноразовую ссылку вида /start link_<48 hex-символов>, и бот подтверждает её на сервере MEDBIOHIM.",
  "При привязке бот передаёт только ваш Telegram id, username и first_name. Больше ничего.",
  "Бот не читает вашу переписку, не хранит пароли, коды входа и токены, не показывает учебные или медицинские данные без привязки и никогда не пишет первым — только отвечает на входящие сообщения.",
  "В группах сообщения пересылаются в учебный конвейер только если он настроен администратором; в личном чате ничего не пересылается.",
  "Не отправляйте боту пароли, коды входа и другие секреты.",
].join("\n");

const HELP_TEXT = [
  "MEDBIOHIM — учебная платформа. Единый сайт, одна версия.",
  "Разделы: /schedule, /homework, /subjects, /materials, /tests, /tickets, /university, /cards, /progress, /calculators, /latin, /extension.",
  "Аккаунт: /login, /register, /link — привязка Telegram, /status — где проверить привязку. Все разделы кнопками — /menu, платформа внутри Telegram — /app.",
  "Бот отвечает только на входящие команды, не пишет первым и не показывает личные данные без привязки. Подробнее — /privacy.",
].join("\n");

function menuButtons(env) {
  const rows = [];
  for (let i = 0; i < SITE_SECTIONS.length; i += 2) {
    rows.push(
      SITE_SECTIONS.slice(i, i + 2).map((section) => ({
        text: section.button,
        url: appUrl(env, section.path),
      })),
    );
  }
  return rows;
}

function isAddressedToBot(addressedBot, env) {
  if (!addressedBot) return true;
  const configuredBot = ((env && env.TELEGRAM_BOT_USERNAME) || "").replace(/^@/, "").toLowerCase();
  return Boolean(configuredBot) && addressedBot.toLowerCase() === configuredBot;
}

function parseCommand(text, env) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const first = trimmed.split(/\s+/, 1)[0];
  const [name, addressedBot] = first.slice(1).split("@", 2);
  if (!isAddressedToBot(addressedBot, env)) return null;
  return name.toLowerCase();
}

function commandResponse(text, env) {
  const command = parseCommand(text, env);
  if (!command) return null;

  const section = SECTION_BY_COMMAND.get(command);
  if (section) {
    return {
      text: section.text,
      buttons: openButton(env, section.button, section.path),
      webAppUrl: null,
      menu: false,
    };
  }

  const commands = {
    start: {
      text: "Привет! Я бот MEDBIOHIM. Отсюда можно открыть любой раздел платформы. Войдите кнопкой ниже, затем откройте на сайте Настройки → Telegram, чтобы привязать бота. Все разделы кнопками — /menu, помощь — /help.",
      buttons: openButton(env, "🚀 Открыть MEDBIOHIM", "/"),
      menu: true,
    },
    help: {
      text: HELP_TEXT,
      buttons: openButton(env, "🧭 Все разделы", "/"),
      menu: true,
    },
    menu: {
      text: "Разделы MEDBIOHIM — выберите кнопку ниже. Полный список команд: /help.",
      buttons: menuButtons(env),
    },
    app: {
      text: "Открыть MEDBIOHIM внутри Telegram.",
      webAppUrl: appUrl(env, "/"),
    },
    link: {
      text: "Чтобы привязать Telegram: войдите в MEDBIOHIM, откройте Настройки → Telegram и нажмите «Привязать Telegram». Сайт создаст одноразовую ссылку и откроет этого бота с командой /start link_<48 символов>; ссылка действует один раз. Бот передаст на сервер только ваш Telegram id, username и имя.",
      buttons: openButton(env, "⚙️ Открыть настройки", "/settings"),
    },
    privacy: {
      text: PRIVACY_TEXT,
      buttons: openButton(env, "⚙️ Настройки → Telegram", "/settings"),
    },
    // Hidden aliases kept only because old Telegram menus may still be cached
    // on user devices. They always resolve to the single canonical site.
    site: {
      text: "MEDBIOHIM — единый сайт, одна актуальная версия.",
      buttons: openButton(env, "🚀 Открыть MEDBIOHIM", "/"),
    },
    oldsite: {
      text: "Открыть MEDBIOHIM.",
      buttons: openButton(env, "🚀 Открыть MEDBIOHIM", "/login"),
    },
    main: {
      text: "Открыть MEDBIOHIM.",
      buttons: openButton(env, "🚀 Открыть MEDBIOHIM", "/login"),
    },
  };

  const result = commands[command] || {
    text: "Не знаю эту команду. Напишите /help, чтобы увидеть список доступных команд.",
  };
  return {
    text: result.text,
    buttons: result.buttons || null,
    webAppUrl: result.webAppUrl || null,
    menu: result.menu === true,
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

// Optional idempotency: only active when a KV namespace is bound to
// TELEGRAM_UPDATES. Without the binding the worker behaves exactly as before.
async function isDuplicateUpdate(env, updateId) {
  const store = env && env.TELEGRAM_UPDATES;
  if (!store || typeof store.get !== "function" || typeof store.put !== "function") return false;
  if (!Number.isSafeInteger(updateId)) return false;
  const key = `${UPDATE_DEDUP_PREFIX}${updateId}`;
  try {
    const seen = await store.get(key);
    if (seen) return true;
    await store.put(key, "1", { expirationTtl: UPDATE_DEDUP_TTL_SECONDS });
    return false;
  } catch {
    // A broken or unbound store must never drop a real update.
    return false;
  }
}

async function sendTelegramMessage(env, chatId, response) {
  const payload = { chat_id: chatId, text: response.text, disable_web_page_preview: true };
  if (response.menu) {
    try {
      await fetchWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commands: BOT_COMMANDS }),
      });
    } catch {
      // Do not prevent the user from receiving /start if Telegram menu setup is temporarily unavailable.
    }
  }
  if (response.buttons) {
    payload.reply_markup = { inline_keyboard: response.buttons };
  } else if (response.webAppUrl) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: "Открыть MEDBIOHIM", web_app: { url: response.webAppUrl } }]],
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


async function confirmAccountLink(env, message, token) {
  const endpoint = env.TELEGRAM_ACCOUNT_LINK_WEBHOOK_URL;
  if (!endpoint) {
    await sendTelegramMessage(env, message.chat.id, {
      text: "Привязка аккаунта пока не настроена на сервере MEDBIOHIM. Откройте настройки сайта и попробуйте позже.",
    });
    return false;
  }
  let target;
  try { target = new URL(endpoint); } catch { throw new Error("Invalid account-link URL"); }
  if (target.protocol !== "https:") throw new Error("Account-link URL must use HTTPS");
  const user = message.from;
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) throw new Error("Invalid Telegram user");
  const result = await fetchWithTimeout(target.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      token,
      telegram_user_id: String(user.id),
      username: typeof user.username === "string" ? user.username : null,
      first_name: typeof user.first_name === "string" ? user.first_name : null,
    }),
  });
  let body;
  try { body = await result.json(); } catch { body = null; }
  if (!result.ok || !body || body.ok !== true) {
    const messageText = result.status === 410 || result.status === 409
      ? "Ссылка устарела или аккаунт уже связан. Вернитесь в настройки MEDBIOHIM и создайте новую ссылку."
      : "Не удалось подтвердить привязку. Попробуйте создать новую ссылку в настройках сайта.";
    await sendTelegramMessage(env, message.chat.id, { text: messageText });
    return false;
  }
  await sendTelegramMessage(env, message.chat.id, {
    text: "Telegram успешно привязан к вашему аккаунту MEDBIOHIM. Вернитесь на сайт и обновите настройки.",
  });
  return true;
}

function ingestUrl(env) {
  return String((env && (env.TELEGRAM_INGEST_URL || env.TELEGRAM_HOMEWORK_WEBHOOK_URL)) || "").trim();
}

async function relayGroupUpdate(env, update) {
  const endpoint = ingestUrl(env);
  if (!endpoint) return { configured: false, data: null };
  const secret = String(env.TELEGRAM_INGEST_SECRET || env.TELEGRAM_WEBHOOK_SECRET || "");
  let target;
  try { target = new URL(endpoint); } catch { throw new Error("Invalid relay URL"); }
  if (target.protocol !== "https:") throw new Error("Relay URL must use HTTPS");
  const result = await fetchWithTimeout(target.toString(), {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(update),
  });
  let body = null;
  try { body = await result.json(); } catch { body = null; }
  if (!result.ok || !body || body.ok !== true) throw new Error("Homework relay failed");
  return { configured: true, data: body.data || null };
}

/** A short group reply, only when the API says something useful happened. */
async function sendIngestReply(env, chatId, reply) {
  if (!reply || typeof reply.text !== "string" || !reply.text.trim()) return;
  const payload = {
    chat_id: chatId,
    text: reply.text.trim().slice(0, 4000),
    disable_web_page_preview: true,
  };
  if (typeof reply.path === "string" && reply.path.startsWith("/")) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: "Открыть MEDBIOHIM", url: appUrl(env, reply.path) }]],
    };
  }
  try {
    await fetchWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // The message is already stored by the API; a failed courtesy reply must
    // not make Telegram retry and duplicate the homework.
  }
}

/**
 * Shared secret for the internal API → bot call. A dedicated
 * `TELEGRAM_INTERNAL_SECRET` wins; otherwise the webhook secret is reused, since
 * both Workers already have to agree on it.
 */
function internalSecret(env) {
  return String((env && (env.TELEGRAM_INTERNAL_SECRET || env.TELEGRAM_WEBHOOK_SECRET)) || "").trim();
}

/**
 * `POST /api/verify-initdata` — Mini App login verification for the API Worker.
 *
 * Only this Worker holds `TELEGRAM_BOT_TOKEN`, and it never leaves: the caller
 * receives the verified Telegram identity, never the token, the hash or the
 * signed string. Every verification failure collapses to one generic answer so
 * the endpoint cannot be used as an oracle.
 */
/**
 * `POST /api/verify-ingest` — API Worker confirms that a forwarded group update
 * carries the bot's ingest secret. This lets the API stay stateless: it does not
 * need a copy of the secret, exactly like Mini App initData verification.
 */
async function handleVerifyIngest(request, env) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", allow: "POST" },
    });
  }
  const expected = String((env && (env.TELEGRAM_INGEST_SECRET || env.TELEGRAM_WEBHOOK_SECRET)) || "").trim();
  if (!expected) return json({ ok: false, error: "INGEST_NOT_CONFIGURED" }, 503);
  const provided = request.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!safeEqual(provided, expected)) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  return json({ ok: true });
}

async function handleVerifyInitData(request, env) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", allow: "POST" },
    });
  }

  const secret = internalSecret(env);
  if (!secret) return json({ ok: false, error: "INTERNAL_NOT_CONFIGURED" }, 503);
  if (!constantTimeEqual(request.headers.get("x-medbiohim-internal") || "", secret)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "BOT_NOT_CONFIGURED" }, 503);

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "INVALID_BODY" }, 400);
  }
  const initData = typeof body?.init_data === "string" ? body.init_data : "";
  if (!initData) return json({ ok: false, error: "INVALID_BODY" }, 400);

  const result = await validateTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
  if (!result.ok) {
    // Deliberately generic: never tell the caller which check failed.
    return json({ ok: false, error: "INVALID_INIT_DATA" }, 401);
  }
  return json({ ok: true, user: result.user, auth_date: result.auth_date });
}

/**
 * `POST /api/verify-widget` — Login Widget ("Sign in with Telegram" on the
 * website) verification for the API Worker. Same trust model as
 * `/api/verify-initdata`: the bot token never leaves this Worker, the caller
 * gets the verified identity or one generic rejection.
 */
async function handleVerifyWidget(request, env) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", allow: "POST" },
    });
  }

  const secret = internalSecret(env);
  if (!secret) return json({ ok: false, error: "INTERNAL_NOT_CONFIGURED" }, 503);
  if (!constantTimeEqual(request.headers.get("x-medbiohim-internal") || "", secret)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "BOT_NOT_CONFIGURED" }, 503);

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "INVALID_BODY" }, 400);
  }
  const widget = body && typeof body === "object" && !Array.isArray(body) ? body.widget : null;

  const result = await validateTelegramLoginWidget(widget, env.TELEGRAM_BOT_TOKEN);
  if (!result.ok) {
    // Deliberately generic: never tell the caller which check failed.
    return json({ ok: false, error: "INVALID_WIDGET_PAYLOAD" }, 401);
  }
  return json({ ok: true, user: result.user, auth_date: result.auth_date });
}

/**
 * FA1 + §9: доставuka уведомлений. Бот — «тупой почтальон»: текст приходит
 * готовым из API-воркера (форматирование живёт в репо API), бот только
 * отправляет через Telegram API. Доступ — по общему internal secret.
 */
async function handleNotify(request, env) {
  if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "BOT_NOT_CONFIGURED" }, 503);
  const secret = internalSecret(env);
  if (!secret) return json({ ok: false, error: "INTERNAL_NOT_CONFIGURED" }, 503);
  if (!constantTimeEqual(request.headers.get("x-medbiohim-internal") || "", secret)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);
  }
  let body;
  try { body = JSON.parse(text); } catch { return json({ ok: false, error: "INVALID_BODY" }, 400); }

  const chatId = Number(body && body.chat_id);
  const html = body && typeof body.html === "string" ? body.html : "";
  if (!Number.isFinite(chatId) || !html.trim()) return json({ ok: false, error: "INVALID_BODY" }, 400);

  const payload = { chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true };
  if (body.button && typeof body.button.label === "string" && typeof body.button.url === "string") {
    payload.reply_markup = { inline_keyboard: [[{ text: body.button.label, url: body.button.url }]] };
  }
  const result = await fetchWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  let response;
  try { response = await result.json(); } catch { response = null; }
  if (!result.ok || !response || response.ok !== true) throw new Error("Telegram delivery failed");
  return json({ ok: true, delivered: true });
}

/**
 * FA1: утренний дайджест по cron. Данные берёт с API-воркера
 * (GET /telegram/internal/digest?date=…) по общему секрету; форматирование —
 * на стороне API (поле html). Чат без данных — «пустой день» не отправляется.
 */
function digestApiOrigin(env) {
  return String((env && env.TELEGRAM_API_ORIGIN) || "").trim().replace(/\/$/, "");
}

function digestDate(dateUtc) {
  return dateUtc.toISOString().slice(0, 10);
}

async function handleDigest(env) {
  const origin = digestApiOrigin(env);
  const secret = internalSecret(env);
  if (!env.TELEGRAM_BOT_TOKEN || !origin || !secret) {
    return { ok: false, error: "DIGEST_NOT_CONFIGURED", sent: 0, skipped: 0 };
  }
  const date = digestDate(new Date());
  const endpoint = new URL("/api/v1/telegram/internal/digest", origin);
  endpoint.searchParams.set("date", date);
  const response = await fetchWithTimeout(endpoint.toString(), {
    method: "GET",
    headers: { "x-medbiohim-internal": secret },
  });
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || !payload || payload.ok !== true) {
    return { ok: false, error: "DIGEST_DATA_UNAVAILABLE", sent: 0, skipped: 0 };
  }
  const chats = (payload.data && Array.isArray(payload.data.chats)) ? payload.data.chats : [];
  let sent = 0;
  let skipped = 0;
  for (const chat of chats) {
    const html = typeof chat.html === "string" ? chat.html : "";
    if (!html.trim()) { skipped += 1; continue; }
    try {
      await fetchWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat.chat_id, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
      });
      sent += 1;
    } catch {
      skipped += 1;
    }
  }
  return { ok: true, date, sent, skipped, chats: chats.length };
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/health") {
    return json({
      ok: true,
      service: "medbiohim-telegram-bot",
      configured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET),
      internal: Boolean(internalSecret(env)),
      ingest: Boolean(ingestUrl(env)),
    });
  }
  if (url.pathname === "/api/verify-initdata") return handleVerifyInitData(request, env);
  if (url.pathname === "/api/verify-widget") return handleVerifyWidget(request, env);
  if (url.pathname === "/api/verify-ingest") return handleVerifyIngest(request, env);
  if (url.pathname === "/api/notify" && request.method === "POST") {
    try {
      return await handleNotify(request, env);
    } catch {
      return json({ ok: false, error: "TELEGRAM_DELIVERY_FAILED" }, 502);
    }
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

  if (await isDuplicateUpdate(env, update.update_id)) {
    return json({ ok: true, duplicate: true });
  }

  const message = update.message || update.edited_message;
  if (!message?.chat || typeof message.chat.id !== "number") return json({ ok: true, ignored: true });

  if (message.chat.type === "group" || message.chat.type === "supergroup") {
    try {
      const result = await relayGroupUpdate(env, update);
      if (result.data?.reply) await sendIngestReply(env, message.chat.id, result.data.reply);
      return json({
        ok: true,
        forwarded: result.configured,
        status: result.data?.status || null,
      });
    } catch {
      // Do not log payloads, chat IDs, secrets, or upstream response bodies.
      return json({ ok: false, error: "HOMEWORK_RELAY_FAILED" }, 502);
    }
  }
  if (message.chat.type !== "private") return json({ ok: true, ignored: true });

  const text = typeof message.text === "string" ? message.text.trim() : "";
  const linkStart = text.match(/^\/start(?:@([^\s]+))?\s+link_([a-f0-9]{48})$/i);
  if (linkStart) {
    if (!isAddressedToBot(linkStart[1], env)) return json({ ok: true, ignored: true });
    try {
      await confirmAccountLink(env, message, linkStart[2].toLowerCase());
      return json({ ok: true, accountLink: true });
    } catch {
      return json({ ok: false, error: "ACCOUNT_LINK_FAILED" }, 502);
    }
  }
  const response = commandResponse(message.text, env);
  if (!response) return json({ ok: true, ignored: true });
  try {
    await sendTelegramMessage(env, message.chat.id, response);
  } catch {
    return json({ ok: false, error: "TELEGRAM_DELIVERY_FAILED" }, 502);
  }
  return json({ ok: true });
}

/** Именованный экспорт для тестов и cron-покрытия: тело scheduled как функция. */
export async function runScheduledDigest(env) {
  const result = await handleDigest(env);
  // Лог без чатов/пейлоадов — только счётчики доставки.
  console.log("[telegram:digest]", JSON.stringify(result));
  return result;
}

export { handleNotify, handleDigest };

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      runScheduledDigest(env).catch((error) => {
        console.error("[telegram:digest]", String(error));
      })
    );
  },
};
