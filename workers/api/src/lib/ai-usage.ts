/**
 * Журнал ИИ-вызовов и суточные квоты.
 *
 * До этого модуля 11 точек вызова ИИ (тьютор, карточки-паки, конспект с
 * пропусками, сортировка Telegram, генерация лекций, диагностика) не
 * оставляли записей: нельзя было ни оценить расход, ни увидеть, какой
 * провайдер деградировал. Теперь каждый логический вызов пишет строку в
 * `ai_call_log` (маршрут, провайдер, модель, задержка, результат), а дорогие
 * генерации дополнительно ограничены суточной квотой на пользователя.
 *
 * Журнал — служебный: запись идёт сервисным клиентом, сбой записи никогда не
 * ломает ответ студенту (как и лента событий в lib/activity.ts).
 *
 * Квота считается в Redis по ключу суток UTC и переживает перезапуск воркера.
 * Если Redis не настроен (локальная разработка), лимит не блокирует вызов —
 * иначе dev-окружение переставало бы отвечать через N запросов.
 */
import type { Env } from "../env";
import { createServiceClient } from "./supabase.ts";
import { rateLimit } from "./redis.ts";

export const AI_FEATURES = [
  "tutor_chat",
  "lecture_cloze",
  "card_pack",
  "lecture_generate",
  "telegram_sort",
  "diagnostics",
] as const;

export type AiFeature = (typeof AI_FEATURES)[number];

/**
 * Суточные лимиты на пользователя. null — журналируем, но не ограничиваем:
 * сортировка Telegram идёт от бота (без пользователя), диагностика доступна
 * только админу и запускается вручную.
 */
export const AI_DAILY_LIMITS: Record<AiFeature, number | null> = {
  tutor_chat: 150,
  lecture_cloze: 20,
  card_pack: 25,
  lecture_generate: 30,
  telegram_sort: null,
  diagnostics: null,
};

const FEATURE_LABELS: Record<AiFeature, string> = {
  tutor_chat: "ответов тьютора",
  lecture_cloze: "конспектов с пропусками",
  card_pack: "наборов карточек",
  lecture_generate: "черновиков лекций",
  telegram_sort: "сортировок Telegram",
  diagnostics: "проверок провайдеров",
};

const KNOWN_FEATURES = new Set<string>(AI_FEATURES);

export type AiOutcome = "ok" | "error" | "rate_limited";

/** Контекст вызова: кто, откуда и по какой функции потратил ИИ. */
export type AiUsageContext = {
  route: string;
  feature: AiFeature;
  userId?: string | null;
  subjectSlug?: string | null;
  requestId?: string | null;
  /** Попытки по провайдерам; заполняется вызывающим кодом по ссылке. */
  attempts?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
};

export type AiLogEntry = AiUsageContext & {
  outcome: AiOutcome;
  provider?: string | null;
  model?: string | null;
  latencyMs?: number | null;
  errorCode?: string | null;
};

function text(value: unknown, max: number): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Запись в журнал. Возвращает false, если записать не удалось, и не бросает. */
export async function logAiCall(env: Env, entry: AiLogEntry, client?: any): Promise<boolean> {
  try {
    if (!entry || !KNOWN_FEATURES.has(String(entry.feature))) return false;
    const db = client ?? createServiceClient(env);
    if (!db) return false; // без service_role журнал просто не ведётся
    const latency = Number(entry.latencyMs);
    const { error } = await db.from("ai_call_log").insert({
      route: text(entry.route, 120) ?? "unknown",
      feature: entry.feature,
      provider: text(entry.provider, 64),
      model: text(entry.model, 120),
      latency_ms: Number.isFinite(latency) ? Math.max(0, Math.round(latency)) : null,
      outcome: entry.outcome,
      error_code: text(entry.errorCode, 80),
      user_id: text(entry.userId, 64),
      subject_slug: text(entry.subjectSlug, 80),
      request_id: text(entry.requestId, 64),
      attempts: Array.isArray(entry.attempts) ? entry.attempts.slice(0, 10) : [],
      metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {},
    });
    if (error) {
      console.warn("[ai-usage:log]", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[ai-usage:log]", error instanceof Error ? error.message : "unavailable");
    return false;
  }
}

export type AiCallOptions<T> = {
  /** Как достать провайдера и модель из результата вызова. */
  describe?: (result: T) => { provider?: string | null; model?: string | null };
  client?: any;
  now?: () => number;
};

/**
 * Обёртка одного логического вызова ИИ: замеряет задержку, пишет результат
 * (ok/error с кодом) и пропускает ответ или ошибку дальше без изменений.
 */
export async function withAiCall<T>(
  env: Env,
  usage: AiUsageContext,
  run: () => Promise<T>,
  options: AiCallOptions<T> = {},
): Promise<T> {
  const now = options.now ?? (() => Date.now());
  const started = now();
  try {
    const result = await run();
    const seen = options.describe ? options.describe(result) : (result as any);
    await logAiCall(env, {
      ...usage,
      outcome: "ok",
      provider: seen?.provider ?? null,
      model: seen?.model ?? null,
      latencyMs: now() - started,
    }, options.client);
    return result;
  } catch (error) {
    await logAiCall(env, {
      ...usage,
      outcome: "error",
      errorCode: String((error as any)?.code || (error as any)?.name || "ERROR"),
      latencyMs: now() - started,
    }, options.client);
    throw error;
  }
}

export type AiQuota = {
  allowed: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
};

/**
 * Суточная квота пользователя на функцию. Проверка сразу и расходует попытку:
 * так «зависший» или падающий провайдер не даёт бесконечно долбить внешний API.
 */
export async function aiDailyQuota(
  env: Env,
  feature: AiFeature,
  userId: string | null | undefined,
  deps: { limit?: typeof rateLimit } = {},
): Promise<AiQuota> {
  const limit = AI_DAILY_LIMITS[feature];
  if (!limit) return { allowed: true, limit: null, used: 0, remaining: null };
  if (!userId) return { allowed: true, limit, used: 0, remaining: limit };
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const endOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  // TTL дольше суток: ключ не должен исчезнуть раньше, чем кончится его день.
  const ttl = Math.max(60, Math.ceil((endOfDay - now.getTime()) / 1000) + 600);
  const consume = deps.limit ?? rateLimit;
  const result = await consume(env, `ai:day:${feature}:${userId}:${day}`, limit, ttl);
  return {
    allowed: result.allowed,
    limit,
    used: Math.max(0, limit - result.remaining),
    remaining: result.remaining,
  };
}

/** Сообщение для отказа по квоте — одинаковое для всех маршрутов. */
export function aiQuotaMessage(quota: AiQuota, feature: AiFeature): string {
  return `Дневной лимит ${FEATURE_LABELS[feature] || "ИИ-генераций"} исчерпан (${quota.limit} в сутки). Попробуйте завтра.`;
}

/** Отклонённый квотой вызов тоже виден в журнале: это сигнал о нагрузке. */
export async function logAiQuotaRejection(
  env: Env,
  usage: AiUsageContext,
  client?: any,
): Promise<boolean> {
  return logAiCall(env, { ...usage, outcome: "rate_limited" }, client);
}
