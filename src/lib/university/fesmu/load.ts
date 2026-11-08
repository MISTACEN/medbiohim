/**
 * Загрузка расписаний FESMU через кэш (ЗАДАЧА A3: вынесено из монолита fesmu.ts).
 */
import { CACHE_TTL_MS, PARSE_ERROR, fesmuFetch } from "./_shared";
import { readThrough } from "./cache";
import { parseScheduleDocuments } from "./documents";
import type { ScheduleItem } from "../types";

export type ScheduleLoad = {
  ok: boolean;
  items: ScheduleItem[];
  cached: boolean;
  stale: boolean;
  fetched_at: string | null;
  cache_age_seconds: number | null;
  error: string | null;
};

export async function loadSchedule(
  key: string,
  pageUrl: string,
  document: boolean,
  force: boolean,
): Promise<ScheduleLoad> {
  const result = await readThrough<ScheduleItem[]>(
    key,
    CACHE_TTL_MS,
    async () => {
      const response = await fesmuFetch(pageUrl);
      if (!response.ok) return { value: null, error: response.error ?? `HTTP ${response.status}` };
      const items = parseScheduleDocuments(response.body, pageUrl, { document });
      if (items.length === 0) return { value: null, error: PARSE_ERROR };
      return { value: items, error: null };
    },
    force,
  );
  return {
    ok: result.value !== null,
    items: result.value ?? [],
    cached: result.cached,
    stale: result.stale,
    fetched_at: result.fetched_at,
    cache_age_seconds: result.cache_age_seconds,
    error: result.error,
  };
}
