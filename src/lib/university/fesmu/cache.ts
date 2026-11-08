/**
 * Кэш адаптера FESMU (30-минутный TTL с отдачей устаревшего значения) —
 * вынесен из монолита fesmu.ts (ЗАДАЧА A3, образец routes/teacher/).
 */
import { describeError } from "./_shared";

/* ------------------------------------------------------------------ *
 * Cache (contract §1.2)
 * ------------------------------------------------------------------ */

type CacheEntry<T> = { value: T; fetchedAt: number; ttlMs: number };

const cache = new Map<string, CacheEntry<unknown>>();

/** Drops every cached payload (used by tests and after a manual refresh). */
export function clearFesmuCache(): void {
  cache.clear();
}

export type CachedResult<T> = {
  value: T | null;
  cached: boolean;
  stale: boolean;
  fetched_at: string | null;
  cache_age_seconds: number | null;
  error: string | null;
};

function ageSeconds(from: number): number {
  return Math.max(0, Math.round((Date.now() - from) / 1000));
}

/**
 * 30-minute TTL cache with stale-serving: a failed refresh returns the last good
 * value with `cached: true, stale: true` plus the failure in `error`.
 */
export async function readThrough<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<{ value: T | null; error: string | null }>,
  force: boolean,
): Promise<CachedResult<T>> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && !force && Date.now() - hit.fetchedAt < hit.ttlMs) {
    return {
      value: hit.value,
      cached: true,
      stale: false,
      fetched_at: new Date(hit.fetchedAt).toISOString(),
      cache_age_seconds: ageSeconds(hit.fetchedAt),
      error: null,
    };
  }

  let loaded: { value: T | null; error: string | null };
  try {
    loaded = await load();
  } catch (cause) {
    loaded = { value: null, error: describeError(cause) };
  }

  if (loaded.value !== null && !loaded.error) {
    const fetchedAt = Date.now();
    cache.set(key, { value: loaded.value, fetchedAt, ttlMs });
    return {
      value: loaded.value,
      cached: false,
      stale: false,
      fetched_at: new Date(fetchedAt).toISOString(),
      cache_age_seconds: 0,
      error: null,
    };
  }

  if (hit) {
    return {
      value: hit.value,
      cached: true,
      stale: true,
      fetched_at: new Date(hit.fetchedAt).toISOString(),
      cache_age_seconds: ageSeconds(hit.fetchedAt),
      error: loaded.error ?? "Не удалось обновить данные источника",
    };
  }

  return {
    value: null,
    cached: false,
    stale: false,
    fetched_at: null,
    cache_age_seconds: null,
    error: loaded.error ?? "Не удалось загрузить данные источника",
  };
}
