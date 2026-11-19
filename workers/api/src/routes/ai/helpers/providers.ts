import type { Env } from "../../../env";
import { ok } from "../../../lib/response";
import { withAiCall } from "../../../lib/ai-usage";
import type { AiUsageContext } from "../../../lib/ai-usage";
import { WorkersAiError, workersAiComplete, workersAiConfigured } from "../../../lib/workers-ai";
// Shared JavaScript AI provider implementation bundled by Wrangler.
// @ts-expect-error The integration module is plain JavaScript without type declarations.
import { generateAiCompletion } from "../../../../../../integrations/cloudflare-api/src/ai-chat.js";
import { getRedis } from "../../../lib/redis";
import { compactForWorkersAi, FAST_WORKERS_AI_MODEL } from "./text";
import type { ChatMessage, ProviderResult } from "./text";

/**
 * Провайдеры, которые можно СОХРАНИТЬ в ai_conversations.provider: после
 * миграции 20261115_ai_conversations_provider_expand CHECK пропускает весь
 * список SUPPORTED_PROVIDERS. Значение вне списка честно трактуем как «auto» —
 * прежнее поведение для старых клиентов.
 */
export const CONVERSATION_PROVIDERS = ["auto", "openai", "groq", "gigachat", "gemini", "mistral", "openrouter", "custom"] as const;

export type ConversationProvider = (typeof CONVERSATION_PROVIDERS)[number];

export function normalizeConversationProvider(value: unknown): ConversationProvider {
  const key = String(value || "auto").trim().toLowerCase();
  return (CONVERSATION_PROVIDERS as readonly string[]).includes(key) ? key as ConversationProvider : "auto";
}

export async function generate(
  env: Env,
  messages: ChatMessage[],
  requested?: string,
  temperature = 0.25,
  onAttempt?: (attempt: Record<string, unknown>) => void,
  userOverride?: unknown,
  model?: string,
  unhealthy?: string[],
  images?: string[],
): Promise<ProviderResult> {
  const system = messages.find((message) => message.role === "system");
  const context = [...(system ? [system] : []), ...messages.filter((message) => message.role !== "system").slice(-23)];
  const result = await generateAiCompletion(env, context.map((message) => ({
    role: message.role,
    content: message.content.slice(0, 12000),
  })), requested || "auto", fetch, { temperature,
    ...(onAttempt ? { onAttempt } : {}),
    ...(userOverride ? { userOverride } : {}),
    ...(model ? { model } : {}),
    ...(unhealthy?.length ? { unhealthy } : {}),
    ...(images?.length ? { images } : {}),
  });
  return { text: result.content, provider: result.provider, model: result.model };
}

/**
 * Внешние провайдеры (Groq, GigaChat, Mistral) могут отказать все сразу —
 * например, из-за сертификатов или исчерпанных ключей. Workers AI работает
 * внутри Cloudflare без ключей, поэтому он последний фолбэк тьютора.
 */
/**
 * Второй проход по уменьшенному запросу. Биндинг Workers AI отвечает ровно и
 * быстро на короткий промпт (3-7 с), но иногда зависает сверх 25 с — тогда
 * ответ не успевал и студент получал 502. Повтор с урезанным контекстом и
 * меньшим лимитом токенов укладывается в бюджет прокси и обычно проходит.
 */

export async function generateWithFallback(
  env: Env,
  messages: ChatMessage[],
  requested?: string,
  temperature = 0.25,
  onAttempt?: (attempt: Record<string, unknown>) => void,
  userOverride?: unknown,
  model?: string,
  unhealthy?: string[],
  images?: string[],
): Promise<ProviderResult> {
  try {
    return await generate(env, messages, requested, temperature, onAttempt, userOverride, model, unhealthy, images);
  } catch (error) {
    if (!workersAiConfigured(env)) throw error;
    console.error("[ai:workers-ai-fallback]", error instanceof Error ? error.message : String(error));
    const attempt = async (input: ChatMessage[], maxTokens: number, timeoutMs: number) =>
      workersAiComplete(env, input, { temperature, maxTokens, timeoutMs });
    try {
      const result = await attempt(messages, 900, 10000);
      return { text: result.content, provider: result.provider, model: result.model };
    } catch (retryError) {
      const code = retryError instanceof WorkersAiError ? retryError.code : "NOT_AVAILABLE";
      if (code !== "TIMEOUT" && code !== "NOT_AVAILABLE") throw retryError;
      console.error("[ai:workers-ai-retry]", code);
      const compact = compactForWorkersAi(messages);
      try {
        // Модель поменьше отвечает за секунды — важно уложиться в бюджет прокси.
        const result = await workersAiComplete(env, compact, {
          temperature, maxTokens: 400, timeoutMs: 8000, model: FAST_WORKERS_AI_MODEL,
        });
        return { text: result.content, provider: result.provider, model: result.model };
      } catch (fastError) {
        console.error("[ai:workers-ai-retry2]", fastError instanceof Error ? fastError.message : String(fastError));
        const result = await attempt(compact, 300, 6000);
        return { text: result.content, provider: result.provider, model: result.model };
      }
    }
  }
}

/**
 * Ответ тьютора с записью в журнал ИИ: одна строка на ответ, включая все
 * фолбэки между провайдерами (итоговый provider/model и суммарная задержка).
 */

/**
 * Ответ тьютора с записью в журнал ИИ: одна строка на ответ, включая все
 * фолбэки между провайдерами (итоговый provider/model и суммарная задержка).
 */
export function trackedGeneration(
  env: Env,
  messages: ChatMessage[],
  requested: string | undefined,
  temperature: number,
  usage: AiUsageContext,
  userOverride?: unknown,
  model?: string,
  unhealthy?: string[],
  images?: string[],
): Promise<ProviderResult> {
  return withAiCall(env, usage, () =>
    generateWithFallback(env, messages, requested, temperature, (attempt) => {
      (usage.attempts ??= []).push(attempt);
      // Каждая реальная попытка — проба провайдера для честного /providers:
      // отказ живёт в Redis 10 минут и убирает провайдера из выбора /tutor.
      const id = String(attempt?.id || "");
      if (id && id !== "custom") {
        void recordProviderProbe(env, id, attempt?.outcome === "ok", `${attempt?.outcome || "error"} ${attempt?.status || ""}`.trim());
      }
    }, userOverride, model, unhealthy, images));
}

/**
 * Провайдеры, которые можно СОХРАНИТЬ в ai_conversations.provider: после
 * миграции 20261115_ai_conversations_provider_expand CHECK пропускает весь
 * список SUPPORTED_PROVIDERS. Значение вне списка честно трактуем как «auto» —
 * прежнее поведение для старых клиентов.
 */

/**
 * Честный /providers: провайдер, чей последний живой вызов провалился
 * (диагностика админа или реальный вызов студента), помечается degraded на
 * 10 минут — и в /tutor он больше не предлагается, пока сам не ответит.
 * Кэш в Redis: пишется при diagnostics и при фолбэке в trackedGeneration.
 */
export const PROBE_TTL_SECONDS = 600;

export const PROBED_PROVIDERS = ["groq", "mistral", "gigachat", "openai", "openrouter", "gemini"];

export async function recordProviderProbe(env: Env, provider: string, ok: boolean, detail: string): Promise<void> {
  const redis = getRedis(env);
  if (!redis) return;
  try {
    await redis.set(`ai:probe:${provider}`, JSON.stringify({ ok, detail: detail.slice(0, 120), at: Date.now() }), { ex: PROBE_TTL_SECONDS });
  } catch { /* кэш проб не критичен */ }
}

export async function readProviderProbes(env: Env): Promise<Record<string, { ok: boolean; detail: string } | null>> {
  const redis = getRedis(env);
  const out: Record<string, { ok: boolean; detail: string } | null> = {};
  if (!redis) return out;
  try {
    for (const id of PROBED_PROVIDERS) {
      const raw = await redis.get(`ai:probe:${id}`);
      out[id] = raw ? (JSON.parse(String(raw)) as { ok: boolean; detail: string }) : null;
    }
  } catch { /* без кэша — статус как есть */ }
  return out;
}
