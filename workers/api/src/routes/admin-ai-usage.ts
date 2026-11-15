import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAdmin, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";
import { AI_DAILY_LIMITS } from "../lib/ai-usage";

/**
 * Админская сводка журнала ИИ (миграция `20261115_ai_call_log.sql`).
 *
 * Считает не воркер: агрегаты по дням, функциям, провайдерам, моделям и
 * маршрутам собирает SQL-функция, иначе пришлось бы тянуть тысячи строк.
 * Журнал закрыт RLS без политик, поэтому читаем сервисным клиентом, а доступ
 * к маршруту дополнительно ограничен ролью admin.
 */
const adminAiUsage = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

adminAiUsage.get("/ai-usage", requireAdmin, async (c) => {
  const rid = requestId();
  const requested = Number(c.req.query("days") || 7);
  const days = Number.isFinite(requested) ? Math.min(90, Math.max(1, Math.round(requested))) : 7;
  const service = createServiceClient(c.env);
  if (!service) {
    const { body, status } = fail(
      "AI_USAGE_UNAVAILABLE",
      "Журнал ИИ-вызовов требует SUPABASE_SERVICE_ROLE_KEY",
      503,
      rid,
    );
    return c.json(body, status as 503);
  }
  try {
    const { data, error } = await service.rpc("medbiohim_ai_call_stats", { p_days: days });
    if (error) throw error;
    return c.json(ok({ days, limits: AI_DAILY_LIMITS, stats: data ?? null }, rid));
  } catch (error) {
    console.error("[admin:ai-usage]", error instanceof Error ? error.message : String(error));
    const { body, status } = fail("AI_USAGE_UNAVAILABLE", "Не удалось прочитать журнал ИИ-вызовов", 503, rid);
    return c.json(body, status as 503);
  }
});

export default adminAiUsage;
