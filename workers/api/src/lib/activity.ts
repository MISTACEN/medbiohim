/**
 * Запись событий учебной ленты (Фаза 5 дорожной карты).
 *
 * Пишет только служебный клиент: у authenticated нет политик insert, поэтому
 * историю нельзя подделать через API. Любая ошибка записи — предупреждение, а не
 * отказ основного действия: лента не должна ломать тест или лекцию.
 */
import type { Env } from "../env";
import { createServiceClient } from "./supabase";

export const ACTIVITY_KINDS = [
  "test_finished",
  "lecture_opened",
  "tutor_message",
  "srs_review",
  "homework_marked",
  "assignment_updated",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

const KNOWN = new Set<string>(ACTIVITY_KINDS);

export type ActivityInput = {
  userId: string;
  kind: ActivityKind;
  subjectSlug?: string | null;
  refId?: string | null;
  payload?: Record<string, unknown>;
};

/**
 * Открытие лекции — самое частое событие: студент возвращается к той же
 * лекции несколько раз за вечер. Без дебаунса «Недавно» превращается в список
 * из десяти одинаковых строк, поэтому повтор той же лекции в пределах получаса
 * не пишется.
 */
export const LECTURE_OPEN_DEBOUNCE_MINUTES = 30;

export function lectureDebounceSince(now = Date.now()): string {
  return new Date(now - LECTURE_OPEN_DEBOUNCE_MINUTES * 60000).toISOString();
}

/** Есть ли уже такое же событие (та же лекция) в окне дебаунса. */
async function recentlyLogged(
  service: any,
  userId: string,
  refId: string | null,
): Promise<boolean> {
  try {
    let query = service
      .from("activity_events")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "lecture_opened")
      .gte("created_at", lectureDebounceSince())
      .limit(1);
    // Без ref_id дебаунсить нечем: считаем, что события нет.
    if (!refId) return false;
    query = query.eq("ref_id", refId);
    const { data, error } = await query;
    // Сбой проверки не должен терять событие: пишем как обычно.
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

export async function logActivity(env: Env, input: ActivityInput): Promise<boolean> {
  try {
    if (!input?.userId || !KNOWN.has(String(input.kind))) return false;
    const service = createServiceClient(env);
    if (!service) return false; // без service_role лента просто не ведётся
    const refId = input.refId ? String(input.refId).slice(0, 120) : null;
    if (input.kind === "lecture_opened" && (await recentlyLogged(service, String(input.userId), refId))) {
      return false;
    }
    const { error } = await service.from("activity_events").insert({
      user_id: input.userId,
      kind: input.kind,
      subject_slug: input.subjectSlug ? String(input.subjectSlug).slice(0, 80) : null,
      ref_id: refId,
      payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    });
    if (error) {
      console.warn("[activity:log]", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[activity:log]", error instanceof Error ? error.message : "unavailable");
    return false;
  }
}
