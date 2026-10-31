/**
 * Пересчёт курса групп по календарю.
 *
 * Читающий код считает курс от `admission_year` и так, но в `groups.course_number`
 * остаётся устаревшее значение для отчётов и старого клиента. Этот cron раз в
 * сутки приводит колонку к тому же правилу (1 сентября — новый курс), не меняя
 * id группы и не трогая персональные `course_override`.
 *
 * Вся математика — в SQL-функции `medbiohim_rollover_group_courses`: она же
 * вызывается e2e-скриптом на живой базе. Здесь только честный запуск и отчёт.
 */
import type { Env } from "../env";
import { createServiceClient } from "../lib/supabase";

export type RolloverResult = {
  /** Сколько групп реально перешли на новый курс. Повторный запуск даёт 0. */
  updated: number;
  /** Процесс не запускался — с причиной, а не с нулём «как будто всё ок». */
  skipped: boolean;
  reason?: "service_role_missing" | "rpc_unavailable";
};

/** Минимальный клиент: тесты подменяют его без Supabase. */
export type RolloverClient = {
  rpc: (name: string) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type RolloverDeps = {
  createClient?: (env: Env) => RolloverClient | null;
  log?: (message: string, payload?: unknown) => void;
};

export async function runCourseRollover(env: Env, deps: RolloverDeps = {}): Promise<RolloverResult> {
  const log = deps.log ?? ((message, payload) => console.log(message, payload ?? ""));
  const factory = deps.createClient ?? ((e: Env) => createServiceClient(e) as RolloverClient | null);
  const supabase = factory(env);
  if (!supabase) {
    log("[course-rollover] service_role не настроен — пересчёт не выполняется");
    return { updated: 0, skipped: true, reason: "service_role_missing" };
  }
  const { data, error } = await supabase.rpc("medbiohim_rollover_group_courses");
  if (error) {
    log("[course-rollover] RPC недоступен (миграция не применена?)", error);
    return { updated: 0, skipped: true, reason: "rpc_unavailable" };
  }
  const updated = Number((data as { updated?: unknown } | null)?.updated ?? 0);
  const result = { updated: Number.isFinite(updated) ? updated : 0, skipped: false };
  log("[course-rollover] итог", result);
  return result;
}
