/**
 * Cron: ночная подготовка «двойника» к экзамену (фаза 2.6).
 *
 * Для каждого активного плана exam_agent раскладывает разборы на завтра.
 * Идемпотентность двойная: пропуск, если на завтра уже есть пункты, плюс
 * уникальный индекс (plan_id, day, question_text) на случай гонки.
 */
import type { Env } from "../env";
import { createServiceClient } from "../lib/supabase";
import { AGENT_PLAN_KIND, agentDay, buildAgentItems } from "../lib/exam-agent";

const MAX_PLANS = 200;

export async function runExamAgentNightly(
  env: Env,
  now: Date = new Date(),
): Promise<{ day: string; plans: number; items: number; skipped?: string }> {
  const service = createServiceClient(env);
  if (!service) return { day: agentDay(now, 1), plans: 0, items: 0, skipped: "no_service_role" };

  const day = agentDay(now, 1);
  const { data: plans, error } = await service
    .from("study_plans")
    .select("id,user_id,subject_slug,event_date")
    .eq("event_kind", AGENT_PLAN_KIND)
    .eq("status", "active")
    .gte("event_date", day)
    .limit(MAX_PLANS);
  if (error) {
    const code = String((error as any).code || "");
    if (code === "42P01" || code === "PGRST205") return { day, plans: 0, items: 0, skipped: "table_missing" };
    throw error;
  }

  let processed = 0;
  let items = 0;
  for (const plan of plans || []) {
    if (!plan?.id || !plan?.subject_slug) continue;
    const { count, error: countError } = await service
      .from("study_agent_items")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", plan.id)
      .eq("day", day);
    if (countError) {
      console.warn("[exam-agent:count]", countError.message);
      continue;
    }
    if ((count || 0) > 0) continue; // на завтра уже подготовлено
    try {
      items += await buildAgentItems(service, plan as any, day);
      processed += 1;
    } catch (planError) {
      console.warn("[exam-agent:plan]", planError instanceof Error ? planError.message : "unavailable");
    }
  }
  return { day, plans: processed, items };
}
