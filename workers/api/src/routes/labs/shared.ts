import { createServiceClient } from "../../lib/supabase";

import { getCallerRoles } from "../../lib/caller-roles";

export { getCallerRoles };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LAB_TYPES = ["physiology", "biochemistry", "histology", "anatomy", "pharmacology"];
export const MISSING_RELATION = new Set(["42P01", "PGRST205", "PGRST106"]);

/**
 * Таблицы лабораторных созданы в схеме `labs` (database/migrations/001).
 * PostgREST может её не отдавать, а у authenticated нет грантов — поэтому
 * сначала пробуем `labs` серверным клиентом, при отсутствии схемы/таблицы
 * откатываемся на public. Раньше запрос шёл только в public и вся страница
 * лабораторных отдавала 503.
 */
export async function labsQuery(c: any, build: (db: any) => any): Promise<{ data: any; error: any }> {
  const db = createServiceClient(c.env) || c.get("supabase");
  const run = (schema: "labs" | "public") => build(schema === "labs" ? db.schema("labs") : db);
  let result = await run("labs");
  const code = String((result as any)?.error?.code || "");
  if ((result as any)?.error && MISSING_RELATION.has(code)) result = await run("public");
  return result;
}

/**
 * GET /labs/templates
 * List available lab templates
 */
