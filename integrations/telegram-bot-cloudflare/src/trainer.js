/**
 * Тренажёр Telegram-бота: флеш-карты SRS, хим-челлендж, «формула дня»,
 * подписка на утреннюю рассылку.
 *
 * Бот остаётся «тупым почтальоном»: данные и HTML-форматирование берутся с
 * API-воркера (/api/v1/telegram/internal/trainer/*, общий internal secret),
 * бот только доставляет сообщения и передаёт callback-кнопки. Состояние
 * диалога не хранится — всё, что нужно боту, закодировано в callback_data.
 */

const TRAINER_API_PATH = "/api/v1/telegram/internal/trainer";
const REQUEST_TIMEOUT_MS = 10000;

// Оценки повторения — те же 1–4, что и на сайте (/srs/review).
const RATING_BUTTONS = [
  { text: "❌ Не помню", rating: 1 },
  { text: "🤔 Трудно", rating: 2 },
  { text: "😐 Норм", rating: 3 },
  { text: "👍 Легко", rating: 4 },
];

export const TRAINER_COMMANDS = new Set(["drill", "challenge", "formula", "daily"]);

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

/** Bot → API Worker: service binding — основной путь, fetch — фолбэк для локальных тестов. */
async function apiFetch(env, url, init) {
  const binding = env && env.MEDBIOHIM_API;
  if (binding && typeof binding.fetch === "function") return binding.fetch(url, init);
  return fetchWithTimeout(url, init);
}

function apiOrigin(env) {
  return String((env && env.TELEGRAM_API_ORIGIN) || "").trim().replace(/\/$/, "");
}

function internalSecret(env) {
  return String((env && (env.TELEGRAM_INTERNAL_SECRET || env.TELEGRAM_WEBHOOK_SECRET)) || "").trim();
}

/**
 * Вызов внутреннего эндпоинта тренажёра API-воркера. Возвращает данные `data`
 * или null (недоступность API не должна ронять вебхук Telegram — бот ответит
 * «попробуйте позже»).
 */
async function trainerApi(env, path, init) {
  const origin = apiOrigin(env);
  const secret = internalSecret(env);
  if (!origin || !secret) return null;
  let target;
  try {
    target = new URL(`${TRAINER_API_PATH}${path}`, origin);
  } catch {
    return null;
  }
  try {
    const response = await apiFetch(env, target.toString(), {
      ...init,
      headers: {
        ...(init && init.headers),
        "content-type": "application/json",
        "x-medbiohim-internal": secret,
      },
    });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok || !body || body.ok !== true) return null;
    return body.data || {};
  } catch {
    return null;
  }
}

async function telegram(env, method, payload) {
  return fetchWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * Отправка сообщения с HTML из API. Сбой доставки не бросает исключение:
 * Telegram мог повторить обновление, и дубль хуже тихой потери ответа.
 */
async function sendMessage(env, chatId, payload) {
  const body = {
    chat_id: chatId,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...payload,
  };
  try {
    const result = await telegram(env, "sendMessage", body);
    const json = await result.json().catch(() => null);
    return result.ok && json && json.ok === true ? json.result : null;
  } catch {
    return null;
  }
}

async function answerCallback(env, callbackId, text) {
  const payload = { callback_query_id: callbackId };
  if (text) {
    payload.text = String(text).slice(0, 200);
    payload.show_alert = false;
  }
  try {
    await telegram(env, "answerCallbackQuery", payload);
  } catch {
    // Тост не критичен: основной ответ уйдёт сообщением.
  }
}

function linkedMessage(settingsUrl) {
  return {
    text: "Сначала привяжите Telegram к аккаунту MEDBIOHIM: откройте Настройки → Telegram и нажмите «Привязать Telegram».",
    reply_markup: {
      inline_keyboard: [[{ text: "⚙️ Открыть настройки", url: settingsUrl }]],
    },
  };
}

// ---------------------------------------------------------------------------
// Карточки SRS («База» пирамиды знаний)
// ---------------------------------------------------------------------------

function cardText(card) {
  const topic = [card.subject, card.topic].filter(Boolean).map(escapeHtml).join(" · ");
  return `${topic ? `<i>${topic}</i>\n\n` : ""}<b>${escapeHtml(card.front)}</b>`;
}

async function sendNextCard(env, chatId, telegramUserId, intro) {
  const data = await trainerApi(env, `/cards?telegram_user_id=${encodeURIComponent(telegramUserId)}`);
  if (!data) {
    await sendMessage(env, chatId, { text: "Тренажёр временно недоступен. Попробуйте чуть позже." });
    return;
  }
  if (data.linked === false) {
    await sendMessage(env, chatId, linkedMessage(settingsUrl));
    return;
  }
  const card = (data.cards || [])[0];
  if (!card) {
    await sendMessage(env, chatId, {
      text: "🎉 Отлично! Карточек к повторению на сегодня нет.\nНовые появляются, когда вы добавляете вопросы в карточки на сайте (раздел /cards).",
    });
    return;
  }
  await sendMessage(env, chatId, {
    text: `${intro || "🃏 Карточка:"}\n\n${cardText(card)}`,
    reply_markup: {
      inline_keyboard: [[{ text: "👁 Показать ответ", callback_data: `drill:show:${card.id}` }]],
    },
  });
}

// ---------------------------------------------------------------------------
// Хим-челлендж
// ---------------------------------------------------------------------------

function challengeButtons(challenge) {
  const rows = (challenge.variants || []).map((label, index) => [
    { text: `${index + 1}) ${String(label).slice(0, 40)}`, callback_data: `challenge:pick:${challenge.id}:${index}` },
  ]);
  rows.push([{ text: "🎲 Другая реакция", callback_data: "challenge:next" }]);
  return rows;
}

async function sendChallenge(env, chatId, telegramUserId, { id, mode = "daily", intro } = {}) {
  const query = new URLSearchParams({ telegram_user_id: String(telegramUserId) });
  if (id) query.set("id", id);
  else if (mode === "random") query.set("mode", "random");
  const data = await trainerApi(env, `/challenge?${query.toString()}`);
  if (!data) {
    await sendMessage(env, chatId, { text: "Челлендж временно недоступен. Попробуйте чуть позже." });
    return;
  }
  const challenge = data.challenge;
  if (!challenge) {
    await sendMessage(env, chatId, { text: "Челленджей пока нет — банк реакций ещё наполняется." });
    return;
  }
  const topic = [challenge.subject_name, challenge.topic].filter(Boolean).map(escapeHtml).join(" · ");
  await sendMessage(env, chatId, {
    text: `${intro || "🧪 <b>Челлендж дня</b>"}\n\n${topic ? `<i>${topic}</i>\n` : ""}${escapeHtml(challenge.prompt)}\n<code>${escapeHtml(challenge.equation)}</code>`,
    reply_markup: { inline_keyboard: challengeButtons(challenge) },
  });
}

function challengeResultText(result) {
  const parts = [];
  parts.push(result.correct
    ? "✅ <b>Верно!</b>"
    : `❌ <b>Не совсем.</b> Правильный ответ: ${escapeHtml(result.correct_label)}`);
  if (result.explanation) parts.push(`📘 ${escapeHtml(result.explanation)}`);
  if (result.formula_unicode) {
    const title = result.formula ? escapeHtml(result.formula) : "Формула";
    parts.push(`📌 ${title}\n<code>${escapeHtml(result.formula_unicode)}</code>`);
  }
  if (result.stats) {
    const stats = result.stats;
    parts.push(`📈 Сегодня: ${stats.today_correct}/${stats.today_total} верно${stats.streak > 1 ? `, серия ${stats.streak} 🔥` : ""}`);
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Формула дня
// ---------------------------------------------------------------------------

function formulaText(formula) {
  const topic = [formula.subject_name, formula.topic].filter(Boolean).map(escapeHtml).join(" · ");
  return [
    "📌 <b>Формула дня</b>",
    topic ? `<i>${topic}</i>` : "",
    `<b>${escapeHtml(formula.title)}</b>`,
    `<code>${escapeHtml(formula.unicode || formula.latex)}</code>`,
    formula.description ? escapeHtml(formula.description) : "",
  ].filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------
// Подписка на утреннюю рассылку
// ---------------------------------------------------------------------------

function prefsText(prefs) {
  return [
    "🌅 <b>Утренний тренажёр</b>",
    "Каждое утро бот присылает карточки к повторению и челлендж дня.",
    "",
    `🃏 Карточки SRS: <b>${prefs.drill_enabled ? "вкл" : "выкл"}</b>`,
    `🧪 Челлендж дня: <b>${prefs.challenge_enabled ? "вкл" : "выкл"}</b>`,
  ].join("\n");
}

function prefsKeyboard(prefs) {
  return [
    [{ text: prefs.drill_enabled ? "🃏 Карточки: ✅ вкл" : "🃏 Карточки: ⛔ выкл", callback_data: "daily:toggle:drill" }],
    [{ text: prefs.challenge_enabled ? "🧪 Челлендж: ✅ вкл" : "🧪 Челлендж: ⛔ выкл", callback_data: "daily:toggle:challenge" }],
  ];
}

// ---------------------------------------------------------------------------
// Команды и callback-кнопки
// ---------------------------------------------------------------------------

/** Динамическая команда тренажёра; true — если команда обработана здесь. */
export async function handleTrainerCommand(env, command, message, settingsUrl) {
  if (!TRAINER_COMMANDS.has(command)) return false;
  const chatId = message.chat.id;
  const telegramUserId = message.from && Number.isSafeInteger(message.from.id) ? message.from.id : null;
  if (!telegramUserId) return true;

  if (command === "drill") {
    await sendNextCard(env, chatId, telegramUserId, "🃏 <b>Тренажёр карточек</b>");
    return true;
  }
  if (command === "challenge") {
    await sendChallenge(env, chatId, telegramUserId);
    return true;
  }
  if (command === "formula") {
    const data = await trainerApi(env, "/formula");
    const formula = data && data.formula;
    if (!formula) {
      await sendMessage(env, chatId, { text: "Формулы дня пока нет — банк ещё наполняется." });
      return true;
    }
    await sendMessage(env, chatId, { text: formulaText(formula) });
    return true;
  }
  // /daily — настройки утренней рассылки.
  const prefsData = await trainerApi(env, `/prefs?telegram_user_id=${telegramUserId}`);
  if (!prefsData) {
    await sendMessage(env, chatId, { text: "Настройки временно недоступны. Попробуйте чуть позже." });
    return true;
  }
  await sendMessage(env, chatId, {
    text: prefsText(prefsData.prefs),
    reply_markup: { inline_keyboard: prefsKeyboard(prefsData.prefs) },
  });
  return true;
}

/** Callback-кнопки тренажёра; true — если update обработан здесь. */
export async function handleTrainerCallback(env, callback, settingsUrl) {
  const data = typeof (callback && callback.data) === "string" ? callback.data : "";
  const chat = callback && callback.message && callback.message.chat;
  if (!data || !chat || chat.type !== "private") return false;
  if (!/^(drill|challenge|daily|cmd):/.test(data)) return false;

  const telegramUserId = callback.from && Number.isSafeInteger(callback.from.id) ? callback.from.id : null;
  const chatId = Number.isSafeInteger(chat.id) ? chat.id : null;
  if (!telegramUserId || !chatId) return true;

  const parts = data.split(":");
  const kind = parts[0];

  if (kind === "cmd") {
    // Кнопки в /menu, ведущие на команды тренажёра.
    await answerCallback(env, callback.id);
    const command = parts[1];
    if (TRAINER_COMMANDS.has(command)) {
      await handleTrainerCommand(env, command, { chat, from: callback.from }, settingsUrl);
    }
    return true;
  }

  if (kind === "drill") {
    if (parts[1] === "next") {
      await answerCallback(env, callback.id);
      await sendNextCard(env, chatId, telegramUserId, "🃏 <b>Тренажёр карточек</b>");
      return true;
    }
    if (parts[1] === "show") {
      await answerCallback(env, callback.id);
      const cardData = await trainerApi(env, `/card?telegram_user_id=${telegramUserId}&card_id=${encodeURIComponent(parts[2] || "")}`);
      const card = cardData && cardData.card;
      if (!card) {
        await sendMessage(env, chatId, { text: "Карточка не найдена — возможно, уже повторена. Нажмите «Следующая карточка»." });
        return true;
      }
      await sendMessage(env, chatId, {
        text: `💡 <b>Ответ:</b>\n\n${escapeHtml(card.back)}`,
        reply_markup: {
          inline_keyboard: [
            RATING_BUTTONS.map((button) => ({
              text: button.text,
              callback_data: `drill:rate:${card.id}:${button.rating}`,
            })),
            [{ text: "⏭ Следующая карточка", callback_data: "drill:next" }],
          ],
        },
      });
      return true;
    }
    if (parts[1] === "rate") {
      const rating = Number(parts[3]);
      await answerCallback(env, callback.id, rating === 1 ? "Повторим ещё раз" : "Сохранено");
      const review = await trainerApi(env, "/review", {
        method: "POST",
        body: JSON.stringify({ telegram_user_id: telegramUserId, card_id: parts[2] || "", rating }),
      });
      if (!review) {
        await sendMessage(env, chatId, { text: "Не удалось сохранить повтор. Попробуйте ещё раз." });
        return true;
      }
      const dueLeft = Number(review.due_left || 0);
      if (dueLeft > 0) {
        await sendNextCard(env, chatId, telegramUserId, `✅ Повторено. Осталось карточек: ${dueLeft}.`);
      } else {
        await sendMessage(env, chatId, { text: "🎉 Отлично! Все карточки на сегодня повторены.\nВозвращайтесь завтра — и /challenge для хим-тренажёра." });
      }
      return true;
    }
    return true;
  }

  if (kind === "challenge") {
    if (parts[1] === "next") {
      await answerCallback(env, callback.id);
      await sendChallenge(env, chatId, telegramUserId, { mode: "random" });
      return true;
    }
    if (parts[1] === "show") {
      await answerCallback(env, callback.id);
      await sendChallenge(env, chatId, telegramUserId, { id: parts[2] || "" });
      return true;
    }
    if (parts[1] === "pick") {
      const choiceIndex = Number(parts[3]);
      const check = await trainerApi(env, "/challenge/check", {
        method: "POST",
        body: JSON.stringify({ telegram_user_id: telegramUserId, challenge_id: parts[2] || "", choice_index: choiceIndex }),
      });
      if (!check || check.challenge === null) {
        await answerCallback(env, callback.id, "Не удалось проверить ответ");
        return true;
      }
      await answerCallback(env, callback.id, check.correct ? "✅ Верно!" : "❌ Не совсем");
      await sendMessage(env, chatId, {
        text: challengeResultText(check),
        reply_markup: {
          inline_keyboard: [[{ text: "🎲 Ещё челлендж", callback_data: "challenge:next" }]],
        },
      });
      return true;
    }
    return true;
  }

  if (kind === "daily") {
    const field = parts[2] === "challenge" ? "challenge_enabled" : "drill_enabled";
    const current = await trainerApi(env, `/prefs?telegram_user_id=${telegramUserId}`);
    const prefs = (current && current.prefs) || { drill_enabled: true, challenge_enabled: true };
    const updated = { ...prefs, [field]: !prefs[field] };
    await answerCallback(env, callback.id);
    const saved = await trainerApi(env, "/prefs", {
      method: "POST",
      body: JSON.stringify({ telegram_user_id: telegramUserId, ...updated }),
    });
    const nextPrefs = (saved && saved.prefs) || updated;
    await sendMessage(env, chatId, {
      text: prefsText(nextPrefs),
      reply_markup: { inline_keyboard: prefsKeyboard(nextPrefs) },
    });
    return true;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Утренняя рассылка (cron)
// ---------------------------------------------------------------------------

/**
 * FA-тренажёр: утренние карточки и челлендж дня. Данные — с API-воркера
 * (GET /internal/trainer/morning), бот только доставляет. Возвращает счётчики
 * доставки — без чатов и текстов в логах.
 */
export async function runTrainerMorning(env) {
  const data = await trainerApi(env, "/morning");
  if (!data || !Array.isArray(data.chats)) {
    return { ok: false, error: "TRAINER_DATA_UNAVAILABLE", sent: 0, skipped: 0 };
  }
  let sent = 0;
  let skipped = 0;
  for (const chat of data.chats) {
    const html = typeof chat.html === "string" ? chat.html : "";
    const chatId = Number(chat.chat_id);
    if (!html.trim() || !Number.isSafeInteger(chatId)) {
      skipped += 1;
      continue;
    }
    const keyboard = Array.isArray(chat.keyboard) && chat.keyboard.length
      ? chat.keyboard
        .filter((button) => button && typeof button.text === "string" && typeof button.callback_data === "string")
        .map((button) => [{ text: button.text, callback_data: button.callback_data }])
      : [];
    const result = await sendMessage(env, chatId, {
      text: html,
      reply_markup: keyboard.length ? { inline_keyboard: keyboard } : undefined,
    });
    if (result) sent += 1;
    else skipped += 1;
  }
  return { ok: true, date: data.date || null, sent, skipped, chats: data.chats.length };
}
