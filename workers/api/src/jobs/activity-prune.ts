/**
 * Cron: чистка ленты активности старше 180 дней (Фаза 5).
 * Без служебного ключа честно пропускаем — не притворяемся, что почистили.
 */
import type { Env } from "../env";
import { createServiceClient } from "../lib/supabase";

export const ACTIVITY_RETENTION_DAYS = 180;

export async function runActivityPrune(env: Env): Promise<{ deleted: number; skipped?: string }> {
  const service = createServiceClient(env);
  if (!service) return { deleted: 0, skipped: "no_service_role" };
  const cutoff = new Date(Date.now() - ACTIVITY_RETENTION_DAYS * 86400000).toISOString();
  const { error, count } = await service
    .from("activity_events")
    .delete({ count: "exact" })
    .lt("created_at", cutoff);
  if (error) {
    // Отсутствие миграции — пропуск, а не сбой cron.
    const code = String((error as any).code || "");
    if (code === "42P01" || code === "PGRST205") return { deleted: 0, skipped: "table_missing" };
    throw error;
  }
  return { deleted: Number(count || 0) };
}
