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

export async function logActivity(env: Env, input: ActivityInput): Promise<boolean> {
  try {
    if (!input?.userId || !KNOWN.has(String(input.kind))) return false;
    const service = createServiceClient(env);
    if (!service) return false; // без service_role лента просто не ведётся
    const { error } = await service.from("activity_events").insert({
      user_id: input.userId,
      kind: input.kind,
      subject_slug: input.subjectSlug ? String(input.subjectSlug).slice(0, 80) : null,
      ref_id: input.refId ? String(input.refId).slice(0, 120) : null,
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
