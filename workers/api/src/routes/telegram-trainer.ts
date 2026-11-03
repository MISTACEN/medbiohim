import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import type { AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";
import { latexToUnicode } from "../lib/latex-unicode";
import { nextReviewState } from "./srs";

/**
 * Тренажёр Telegram-бота: ежедневные флеш-карты SRS («База» пирамиды знаний),
 * хим-челлендж (уравнять реакцию / назвать продукт) и «формула дня».
 *
 * Доступ только для бот-воркера по общему секрету (TELEGRAM_INTERNAL_SECRET /
 * TELEGRAM_WEBHOOK_SECRET) — тот же механизм, что у /telegram/internal/digest.
 * Пользователь внутри ищется по привязке Telegram (telegram_accounts), никаких
 * студенческих JWT здесь нет. Вся математика повторения — общий nextReviewState
 * из routes/srs.ts, чтобы бот и сайт не разошлись.
 */
const telegramTrainer = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const DUE_CARD_LIMIT = 10;
const TRAINER_LINKED_LIMIT = 500;
const RATING_MIN = 1;
const RATING_MAX = 4;

function constantTimeEqual(actual: string, expected: string): boolean {
  if (!actual || !expected || actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i += 1) {
    difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}

function internalSecret(env: Env): string {
  return String(env.TELEGRAM_INGEST_SECRET || env.TELEGRAM_WEBHOOK_SECRET || "").trim();
}

function escapeHtml(value: string | null | undefined): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** FNV-1a: детерминированный «жребий» дня без криптографии. */
function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseTelegramUserId(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function resolveUserId(supabase: any, telegramUserId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from("telegram_accounts")
    .select("user_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (error) throw error;
  return String((data as any)?.user_id || "") || null;
}

type TrainerCard = {
  id: string;
  front: string;
  back: string;
  subject: string;
  topic: string;
};

async function loadDueCards(supabase: any, userId: string, limit: number): Promise<TrainerCard[]> {
  const { data, error } = await supabase
    .from("srs_cards")
    .select("id,front,back,subject_slug,topic,due_at")
    .eq("user_id", userId)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(Math.max(1, Math.min(50, limit)));
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: String(row.id || ""),
    front: String(row.front || ""),
    back: String(row.back || ""),
    subject: String(row.subject_slug || ""),
    topic: String(row.topic || ""),
  }));
}

async function loadDueCount(supabase: any, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("srs_cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("due_at", new Date().toISOString());
  if (error) throw error;
  return Number(count || 0);
}

type ChallengeRow = {
  id: string;
  kind: string;
  prompt: string;
  equation: string;
  variants: Array<{ label?: string }>;
  correct_index: number;
  explanation: string;
  formula: string | null;
  subject_name: string | null;
  topic: string | null;
};

async function loadActiveChallenges(supabase: any): Promise<ChallengeRow[]> {
  const { data, error } = await supabase
    .from("bot_chem_challenges")
    .select("id,kind,prompt,equation,variants,correct_index,explanation,formula,subject_name,topic")
    .eq("is_active", true)
    .limit(300);
  if (error) throw error;
  return (data || []) as ChallengeRow[];
}

/**
 * Детерминированная перестановка вариантов: правильный ответ не должен
 * стоять на одном месте каждый день, а сервер при проверке воспроизводит
 * тот же порядок (stateless-бот хранит только индекс варианта).
 */
function shuffleOrder(challenge: ChallengeRow, seed: string): number[] {
  const order = challenge.variants.map((_, index) => index);
  let hash = stableHash(seed);
  for (let i = order.length - 1; i > 0; i -= 1) {
    hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491) >>> 0;
    const j = hash % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

async function challengeStats(supabase: any, telegramUserId: number): Promise<{ today_total: number; today_correct: number; streak: number }> {
  const dayStart = new Date(`${isoDate(new Date())}T00:00:00Z`).toISOString();
  const { data, error } = await supabase
    .from("bot_challenge_attempts")
    .select("challenge_id,is_correct,created_at")
    .eq("telegram_user_id", telegramUserId)
    .gte("created_at", dayStart)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  const attempts = (data || []) as Array<{ challenge_id: string; is_correct: boolean }>;
  const todayCorrect = attempts.filter((row) => row.is_correct).length;
  // Серия подряд: сколько последних попыток дня были верными до первой ошибки.
  let streak = 0;
  for (const row of attempts) {
    if (!row.is_correct) break;
    streak += 1;
  }
  return { today_total: attempts.length, today_correct: todayCorrect, streak };
}

function guardInternal(c: any): boolean {
  const secret = internalSecret(c.env);
  if (!secret) return false;
  return constantTimeEqual(c.req.header("x-medbiohim-internal") || "", secret);
}

telegramTrainer.get("/internal/trainer/cards", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  const telegramUserId = parseTelegramUserId(c.req.query("telegram_user_id"));
  if (!telegramUserId) {
    const { body, status } = fail("VALIDATION_ERROR", "telegram_user_id обязателен", 422, rid);
    return c.json(body, status as 422);
  }
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const userId = await resolveUserId(supabase, telegramUserId);
    if (!userId) return c.json(ok({ linked: false, cards: [], due: 0 }, rid));
    const cards = await loadDueCards(supabase, userId, DUE_CARD_LIMIT);
    const due = await loadDueCount(supabase, userId);
    return c.json(ok({ linked: true, cards, due, total: cards.length }, rid));
  } catch (error) {
    console.error("[trainer:cards]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Тренажёр временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

telegramTrainer.get("/internal/trainer/card", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  const telegramUserId = parseTelegramUserId(c.req.query("telegram_user_id"));
  const cardId = String(c.req.query("card_id") || "").trim();
  if (!telegramUserId || !/^[0-9a-f-]{36}$/i.test(cardId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Нужны telegram_user_id и card_id", 422, rid);
    return c.json(body, status as 422);
  }
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const userId = await resolveUserId(supabase, telegramUserId);
    if (!userId) return c.json(ok({ linked: false }, rid));
    const { data, error } = await supabase
      .from("srs_cards")
      .select("id,front,back,subject_slug,topic")
      .eq("id", cardId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return c.json(ok({ card: null }, rid));
    return c.json(
      ok(
        {
          card: {
            id: String((data as any).id),
            front: String((data as any).front || ""),
            back: String((data as any).back || ""),
            subject: String((data as any).subject_slug || ""),
            topic: String((data as any).topic || ""),
          },
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[trainer:card]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Тренажёр временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

telegramTrainer.post("/internal/trainer/review", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  let payload: any = {};
  try { payload = await c.req.json(); } catch {}
  const telegramUserId = parseTelegramUserId(payload?.telegram_user_id);
  const cardId = String(payload?.card_id || "").trim();
  const rating = Number(payload?.rating);
  if (!telegramUserId || !/^[0-9a-f-]{36}$/i.test(cardId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Нужны telegram_user_id и card_id", 422, rid);
    return c.json(body, status as 422);
  }
  if (!Number.isFinite(rating) || rating < RATING_MIN || rating > RATING_MAX) {
    const { body, status } = fail("VALIDATION_ERROR", "Оценка должна быть от 1 до 4", 422, rid);
    return c.json(body, status as 422);
  }
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const userId = await resolveUserId(supabase, telegramUserId);
    if (!userId) return c.json(ok({ linked: false }, rid));
    const { data: current, error: readError } = await supabase
      .from("srs_cards")
      .select("id,user_id,ease,interval,reps")
      .eq("id", cardId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) return c.json(ok({ card: null }, rid));

    const next = nextReviewState(current as any, rating);
    const now = new Date();
    const { error: writeError } = await supabase
      .from("srs_cards")
      .update({
        ease: next.ease,
        interval: next.interval,
        reps: next.reps,
        due_at: next.due_at,
        reviewed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", cardId)
      .eq("user_id", userId);
    if (writeError) throw writeError;

    const dueLeft = await loadDueCount(supabase, userId);
    return c.json(ok({ reviewed: true, rating, due_left: dueLeft, next_due_at: next.due_at }, rid));
  } catch (error) {
    console.error("[trainer:review]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить повтор", 503, rid);
    return c.json(body, status as 503);
  }
});

telegramTrainer.get("/internal/trainer/challenge", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  const telegramUserId = parseTelegramUserId(c.req.query("telegram_user_id"));
  const mode = String(c.req.query("mode") || "daily") === "random" ? "random" : "daily";
  const requestedId = String(c.req.query("id") || "").trim();
  if (!telegramUserId) {
    const { body, status } = fail("VALIDATION_ERROR", "telegram_user_id обязателен", 422, rid);
    return c.json(body, status as 422);
  }
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    // Режим by-id нужен боту для кнопки «Пройти челлендж» из утренней рассылки.
    if (requestedId) {
      if (!/^[0-9a-f-]{36}$/i.test(requestedId)) {
        const { body, status } = fail("VALIDATION_ERROR", "Некорректный id челленджа", 422, rid);
        return c.json(body, status as 422);
      }
      const { data, error } = await supabase
        .from("bot_chem_challenges")
        .select("id,kind,prompt,equation,variants,correct_index,explanation,formula,subject_name,topic")
        .eq("id", requestedId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return c.json(ok({ challenge: null }, rid));
      const row = data as ChallengeRow;
      const date = isoDate(new Date());
      const order = shuffleOrder(row, `${row.id}:${telegramUserId}:${date}`);
      return c.json(
        ok(
          {
            challenge: {
              id: row.id,
              kind: row.kind,
              prompt: row.prompt,
              equation: row.equation,
              variants: order.map((originalIndex) => String((row.variants[originalIndex] as any)?.label || `Вариант ${originalIndex + 1}`)),
              subject_name: row.subject_name || "",
              topic: row.topic || "",
            },
          },
          rid,
        ),
      );
    }

    const challenges = await loadActiveChallenges(supabase);
    if (!challenges.length) return c.json(ok({ challenge: null }, rid));
    const date = isoDate(new Date());
    const seed = mode === "daily" ? `${date}` : `${telegramUserId}:${date}:${Date.now()}`;
    const challenge = challenges[stableHash(seed) % challenges.length];
    const order = shuffleOrder(challenge, `${challenge.id}:${telegramUserId}:${date}`);
    return c.json(
      ok(
        {
          challenge: {
            id: challenge.id,
            kind: challenge.kind,
            prompt: challenge.prompt,
            equation: challenge.equation,
            variants: order.map((originalIndex) => String((challenge.variants[originalIndex] as any)?.label || `Вариант ${originalIndex + 1}`)),
            subject_name: challenge.subject_name || "",
            topic: challenge.topic || "",
          },
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[trainer:challenge]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Челлендж временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

telegramTrainer.post("/internal/trainer/challenge/check", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  let payload: any = {};
  try { payload = await c.req.json(); } catch {}
  const telegramUserId = parseTelegramUserId(payload?.telegram_user_id);
  const challengeId = String(payload?.challenge_id || "").trim();
  const choice = Number(payload?.choice_index);
  if (!telegramUserId || !/^[0-9a-f-]{36}$/i.test(challengeId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Нужны telegram_user_id и challenge_id", 422, rid);
    return c.json(body, status as 422);
  }
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data: challenge, error: readError } = await supabase
      .from("bot_chem_challenges")
      .select("id,kind,prompt,equation,variants,correct_index,explanation,formula,subject_name,topic")
      .eq("id", challengeId)
      .eq("is_active", true)
      .maybeSingle();
    if (readError) throw readError;
    if (!challenge) return c.json(ok({ challenge: null }, rid));
    const row = challenge as ChallengeRow;

    const date = isoDate(new Date());
    const order = shuffleOrder(row, `${row.id}:${telegramUserId}:${date}`);
    const labels = row.variants.map((variant, index) => String(variant?.label || `Вариант ${index + 1}`));
    if (!Number.isSafeInteger(choice) || choice < 0 || choice >= order.length) {
      const { body, status } = fail("VALIDATION_ERROR", "Некорректный вариант", 422, rid);
      return c.json(body, status as 422);
    }
    const chosenOriginalIndex = order[choice];
    const isCorrect = chosenOriginalIndex === row.correct_index;

    // Попытка фиксируется для серии; сбой записи не ломает ответ студенту.
    try {
      await supabase.from("bot_challenge_attempts").insert({
        telegram_user_id: telegramUserId,
        challenge_id: row.id,
        chosen_label: labels[chosenOriginalIndex],
        is_correct: isCorrect,
      });
    } catch (attemptError) {
      console.error("[trainer:attempt]", attemptError);
    }

    const stats = await challengeStats(supabase, telegramUserId);
    return c.json(
      ok(
        {
          correct: isCorrect,
          chosen_label: labels[chosenOriginalIndex],
          correct_label: labels[row.correct_index],
          explanation: String(row.explanation || ""),
          formula: String(row.formula || ""),
          formula_unicode: latexToUnicode(String(row.formula || "")),
          equation: row.equation,
          subject_name: row.subject_name || "",
          topic: row.topic || "",
          stats,
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[trainer:challenge-check]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Проверка временно недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

telegramTrainer.get("/internal/trainer/formula", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data, error } = await supabase
      .from("bot_formulas")
      .select("id,title,latex,description,subject_name,topic")
      .eq("is_active", true)
      .limit(200);
    if (error) throw error;
    const formulas = (data || []) as any[];
    if (!formulas.length) return c.json(ok({ formula: null }, rid));
    const date = isoDate(new Date());
    const formula = formulas[stableHash(date) % formulas.length];
    return c.json(
      ok(
        {
          formula: {
            id: String(formula.id),
            title: String(formula.title || ""),
            latex: String(formula.latex || ""),
            unicode: latexToUnicode(String(formula.latex || "")),
            description: String(formula.description || ""),
            subject_name: String(formula.subject_name || ""),
            topic: String(formula.topic || ""),
          },
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[trainer:formula]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Формулы временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});

telegramTrainer.get("/internal/trainer/prefs", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  const telegramUserId = parseTelegramUserId(c.req.query("telegram_user_id"));
  if (!telegramUserId) {
    const { body, status } = fail("VALIDATION_ERROR", "telegram_user_id обязателен", 422, rid);
    return c.json(body, status as 422);
  }
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data, error } = await supabase
      .from("bot_daily_prefs")
      .select("drill_enabled,challenge_enabled")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();
    if (error) throw error;
    return c.json(
      ok(
        {
          prefs: {
            drill_enabled: (data as any)?.drill_enabled !== false,
            challenge_enabled: (data as any)?.challenge_enabled !== false,
          },
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[trainer:prefs-read]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Подписка временно недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

telegramTrainer.post("/internal/trainer/prefs", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  let payload: any = {};
  try { payload = await c.req.json(); } catch {}
  const telegramUserId = parseTelegramUserId(payload?.telegram_user_id);
  if (!telegramUserId) {
    const { body, status } = fail("VALIDATION_ERROR", "telegram_user_id обязателен", 422, rid);
    return c.json(body, status as 422);
  }
  const drillEnabled = payload?.drill_enabled === undefined ? true : payload.drill_enabled === true;
  const challengeEnabled = payload?.challenge_enabled === undefined ? true : payload.challenge_enabled === true;
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data, error } = await supabase
      .from("bot_daily_prefs")
      .upsert(
        { telegram_user_id: telegramUserId, drill_enabled: drillEnabled, challenge_enabled: challengeEnabled, updated_at: new Date().toISOString() },
        { onConflict: "telegram_user_id" },
      )
      .select("telegram_user_id,drill_enabled,challenge_enabled")
      .maybeSingle();
    if (error) throw error;
    return c.json(ok({ saved: true, prefs: data || null }, rid));
  } catch (error) {
    console.error("[trainer:prefs]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить подписку", 503, rid);
    return c.json(body, status as 503);
  }
});

/**
 * Утренняя рассылка (cron бота): кому что отправить. Форматирование HTML —
 * на стороне API, бот только доставляет и прикладывает callback-кнопки.
 */
telegramTrainer.get("/internal/trainer/morning", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data: accounts, error: accountsError } = await supabase
      .from("telegram_accounts")
      .select("telegram_user_id,first_name")
      .limit(TRAINER_LINKED_LIMIT);
    if (accountsError) throw accountsError;

    const { data: prefsRows, error: prefsError } = await supabase
      .from("bot_daily_prefs")
      .select("telegram_user_id,drill_enabled,challenge_enabled")
      .limit(TRAINER_LINKED_LIMIT);
    if (prefsError) throw prefsError;
    const prefs = new Map<number, { drill_enabled: boolean; challenge_enabled: boolean }>();
    for (const row of prefsRows || []) {
      prefs.set(Number((row as any).telegram_user_id), {
        drill_enabled: (row as any).drill_enabled !== false,
        challenge_enabled: (row as any).challenge_enabled !== false,
      });
    }

    const challenges = await loadActiveChallenges(supabase);
    const date = isoDate(new Date());
    const dailyChallenge = challenges.length
      ? challenges[stableHash(date) % challenges.length]
      : null;

    const chats: Array<{ chat_id: number; html: string; keyboard: Array<{ text: string; callback_data: string }> }> = [];
    for (const account of accounts || []) {
      const telegramUserId = Number((account as any).telegram_user_id);
      if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) continue;
      const userPrefs = prefs.get(telegramUserId) || { drill_enabled: true, challenge_enabled: true };
      if (!userPrefs.drill_enabled && !userPrefs.challenge_enabled) continue;

      const parts: string[] = [];
      const keyboard: Array<{ text: string; callback_data: string }> = [];

      if (userPrefs.drill_enabled) {
        const userId = String((account as any).user_id || "");
        // head:true — Supabase возвращает количество в count, без строк.
        const { count: dueCount, error: dueError } = await supabase
          .from("srs_cards")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .lte("due_at", new Date().toISOString());
        if (dueError) throw dueError;
        if (Number(dueCount || 0) > 0) {
          parts.push(`🃏 Карточек к повторению: <b>${Number(dueCount)}</b>`);
          keyboard.push({ text: "🃏 Начать тренажёр", callback_data: "drill:next" });
        }
      }

      if (userPrefs.challenge_enabled && dailyChallenge) {
        const { count: attempted } = await supabase
          .from("bot_challenge_attempts")
          .select("challenge_id", { count: "exact", head: true })
          .eq("telegram_user_id", telegramUserId)
          .eq("challenge_id", dailyChallenge.id)
          .gte("created_at", new Date(`${date}T00:00:00Z`).toISOString());
        if (!attempted) {
          const kindLabel = dailyChallenge.kind === "balance" ? "Уравняйте реакцию" : "Назовите продукт";
          parts.push(
            `🧪 <b>Челлендж дня</b> — ${escapeHtml(kindLabel)}:\n<code>${escapeHtml(dailyChallenge.equation)}</code>`,
          );
          keyboard.push({ text: "🧪 Пройти челлендж", callback_data: `challenge:show:${dailyChallenge.id}` });
        }
      }

      if (!parts.length) continue;
      const firstName = escapeHtml((account as any).first_name || "");
      const greeting = firstName ? `🌅 Доброе утро, ${firstName}!` : "🌅 Доброе утро!";
      chats.push({ chat_id: telegramUserId, html: [greeting, ...parts].join("\n\n"), keyboard });
    }

    return c.json(ok({ date, chats }, rid));
  } catch (error) {
    console.error("[trainer:morning]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Утренняя рассылка временно недоступна", 503, rid);
    return c.json(body, status as 503);
  }
});

export default telegramTrainer;
