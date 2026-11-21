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
import { fetchWithTimeout } from "../lib/fetch-with-timeout";

const MAX_PLANS = 200;
const MAX_REPORT_QUESTIONS = 5;

/**
 * Утренний отчёт в Telegram: что двойник разобрал на сегодня.
 * chat_id — telegram_user_id из telegram_accounts (личный чат с ботом).
 * Любая проблема доставки не должна ломать ночной прогон: логируем и идём дальше.
 */
export async function notifyPlanReport(
  env: Env,
  service: any,
  plan: { id: string; user_id: string; subject_slug?: string | null },
  day: string,
): Promise<boolean> {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return false;
  const { data: account } = await service
    .from("telegram_accounts")
    .select("telegram_user_id")
    .eq("user_id", plan.user_id)
    .maybeSingle();
  const chatId = account?.telegram_user_id ? String(account.telegram_user_id) : "";
  if (!chatId) return false;

  const { data: items } = await service
    .from("study_agent_items")
    .select("question_text")
    .eq("plan_id", plan.id)
    .eq("day", day)
    .limit(50);
  const questions = (items || []).map((item: any) => String(item.question_text || "")).filter(Boolean);
  if (!questions.length) return false;

  const subject = String(plan.subject_slug || "предмет");
  const body = [
    `🎯 Двойник разобрал ${questions.length} ${plural(questions.length, "вопрос", "вопроса", "вопросов")} на сегодня`,
    `Предмет: ${subject}`,
    "",
    ...questions.slice(0, MAX_REPORT_QUESTIONS).map((q: string, i: number) => `${i + 1}. ${q.slice(0, 120)}`),
    questions.length > MAX_REPORT_QUESTIONS ? `… и ещё ${questions.length - MAX_REPORT_QUESTIONS}` : "",
    "",
    "Открыть план: https://medbiohim.vercel.app/study",
  ]
    .filter((line, index) => line !== "" || index < 4)
    .join("\n");

  try {
    const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: body, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      console.warn("[exam-agent:telegram]", res.status);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[exam-agent:telegram]", error instanceof Error ? error.message : "unavailable");
    return false;
  }
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export async function runExamAgentNightly(
  env: Env,
  now: Date = new Date(),
): Promise<{ day: string; plans: number; items: number; notified?: number; skipped?: string }> {
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
  let notified = 0;
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
      if (await notifyPlanReport(env, service, plan as any, day)) notified += 1;
    } catch (planError) {
      console.warn("[exam-agent:plan]", planError instanceof Error ? planError.message : "unavailable");
    }
  }
  return { day, plans: processed, items, notified };
}
