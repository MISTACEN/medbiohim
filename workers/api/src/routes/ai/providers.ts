/** Каталог AI-провайдеров и диагностика их доступности. */
import { Hono } from "hono";

import type { Env } from "../../env";
import { ok, requestId } from "../../lib/response";
import { requireAdmin, requireAuth, type AuthVariables } from "../../middleware/auth";

import { getRedis } from "../../lib/redis";

import { withAiCall } from "../../lib/ai-usage";

// Shared JavaScript AI provider implementation bundled by Wrangler.
// @ts-expect-error The integration module is plain JavaScript without type declarations.
import { generateAiCompletion, getAiProviderStatus, listProviderModels } from "../../../../../integrations/cloudflare-api/src/ai-chat.js";
// Корпус «Подготовка к ЦНС» для RAG тьютора (только physiology, вне лекций).

const ai = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
import { recordProviderProbe, readProviderProbes } from "./helpers";

ai.get("/providers", requireAuth, async (c) => {
  const status = getAiProviderStatus(c.env) as any;
  // Degraded-пометки: провайдер, проваливший последний живой вызов, честно
  // помечается недоступным — фронтенд его в выборе не предлагает.
  const probes = await readProviderProbes(c.env);
  for (const [id, probe] of Object.entries(probes)) {
    const meta = status.providers?.[id];
    if (!meta?.configured || !probe) continue;
    if (!probe.ok) {
      meta.available = false;
      meta.reason = `degraded: ${probe.detail} — проверьте /ai/diagnostics`;
    }
  }
  // Живые списки моделей (GET /models провайдера): статический список протухает,
  // когда Groq удаляет старые модели — выбранная в тьюторе модель падала в фолбэк.
  // Кэш в Redis на 6 часов: /providers вызывается на каждый вход в тьютор.
  try {
    const redis = await getRedis(c.env);
    const liveIds = Object.keys(status.providers).filter((id) => status.providers[id]?.configured);
    await Promise.all(liveIds.map(async (id) => {
      try {
        const cached = redis ? await redis.get(`ai:models:${id}`) : null;
        if (cached) {
          const parsed = JSON.parse(String(cached));
          if (Array.isArray(parsed) && parsed.length) { status.providers[id].models = parsed; return; }
        }
        const live = await listProviderModels(c.env as any, id, fetch);
        if (Array.isArray(live) && live.length) {
          status.providers[id].models = live;
          if (redis) void redis.set(`ai:models:${id}`, JSON.stringify(live), { ex: 6 * 3600 });
        }
      } catch { /* нет живого списка — остаётся статический */ }
    }));
  } catch { /* без Redis — статические списки */ }
  // BYOM: пользовательская модель появляется в списке, если настроена.
  try {
    const { data: config } = await c.get("supabase")
      .from("user_ai_configs")
      .select("provider,model,prefer_own,key_hint")
      .eq("user_id", c.get("user").id)
      .maybeSingle();
    if (config) {
      status.providers = status.providers || {};
      status.providers.custom = {
        configured: true,
        available: true,
        model: String(config.model || ""),
        models: [String(config.model || "")].filter(Boolean),
        reason: `своя модель (${config.provider === "anthropic" ? "Claude" : "OpenAI-compatible"})${config.key_hint ? " · ···" + config.key_hint : ""}`,
        prefer_own: config.prefer_own === true,
      };
      if (config.prefer_own === true) status.default = "custom";
    }
  } catch { /* без конфига — просто платформенные */ }
  return c.json(ok(status, requestId()));
});

/**
 * GET /ai/diagnostics — живая проверка внешних провайдеров.
 *
 * Нужна, когда «все провайдеры падают»: из ответа видно, ключ не приняли (HTTP 401/404),
 * сеть недоступна (network) или ответ не успел за таймаут. Ключи и тела ответов
 * провайдеров не возвращаются — только статус, этап и время.
 */
ai.get("/diagnostics", requireAdmin, async (c) => {
  const rid = requestId();
  const status = getAiProviderStatus(c.env) as any;
  const attempts: Array<Record<string, unknown>> = [];
  const providers: Array<Record<string, unknown>> = [];
  const probe = { role: "user" as const, content: "Ответь одним словом: ок" };
  for (const id of ["groq", "mistral", "gigachat", "openai", "openrouter", "gemini"]) {
    const meta = status.providers?.[id];
    if (!meta?.configured) {
      providers.push({ id, configured: false, model: meta?.model ?? null });
      continue;
    }
    const started = Date.now();
    // Каждая проверка — своя строка журнала; в попытках видны и предыдущие
    // провайдеры, поэтому видно, кто отказал до успеха.
    try {
      const result = await withAiCall<{ content: string; provider: string; model: string }>(
        c.env,
        {
          route: "GET /ai/diagnostics",
          feature: "diagnostics",
          userId: c.get("user").id,
          requestId: rid,
          attempts,
          metadata: { requested: id },
        },
        () => generateAiCompletion(
          c.env as any,
          [probe],
          id,
          fetch,
          { temperature: 0, onAttempt: (attempt: Record<string, unknown>) => attempts.push({ ...attempt, requested: id }) },
        ),
      );
      // «ok» — это ответил ИМЕННО запрошенный провайдер. Раньше фолбэк
      // (например, Mistral ответил 429, а ответ дал Groq) отмечался как успех
      // запрошенного провайдера, и диагностика врала.
      const servedByRequested = String(result.provider || "") === id;
      providers.push({
        id,
        configured: true,
        ok: servedByRequested,
        provider: result.provider,
        model: result.model,
        ms: Date.now() - started,
        ...(servedByRequested ? {} : { fell_back_to: result.provider }),
      });
      await recordProviderProbe(c.env, id, servedByRequested, servedByRequested ? "ok" : `fell back to ${result.provider}`);
    } catch (error: any) {
      providers.push({ id, configured: true, ok: false, code: String(error?.code || "ERROR"), ms: Date.now() - started });
      await recordProviderProbe(c.env, id, false, String(error?.code || "ERROR"));
    }
  }
  return c.json(ok({ region: status.region, default_provider: status.default, providers, attempts }, rid));
});

export default ai;
