/**
 * Кэш общих GET-ответов (TECH-AUDIT-PLAN-2026-10-27 §6, D5).
 * Поведение не менялось при выносе из src/lib/api.ts: память + sessionStorage,
 * TTL 60 c, per-user ключи и отдача устаревшего значения при временных сбоях.
 */
import { api } from "./client";
import type { ApiResult, ApiSuccess } from "./types";
import { currentUserScope } from "@/lib/auth/session";
import { cacheableGetPrefixes } from "../endpoints";

type CacheEntry<T> = { value: ApiSuccess<T>; expires: number };
const apiCache = new Map<string, CacheEntry<any>>();
const API_CACHE_TTL = 60_000;

function isCacheableGet(path: string, options: RequestInit) {
  if ((options.method || "GET").toUpperCase() !== "GET") return false;
  if (typeof window === "undefined") return false;
  return cacheableGetPrefixes.some((prefix) => path === prefix || path.startsWith(prefix));
}

export async function apiCached<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  if (!isCacheableGet(path, options)) return api<T>(path, options);
  const userScope = currentUserScope();
  if (userScope === null) return api<T>(path, options);
  const key = path + "|user:" + userScope;
  const now = Date.now();
  let stale: ApiSuccess<T> | null = null;

  const memory = apiCache.get(key);
  if (memory) {
    if (memory.expires > now) return memory.value as ApiResult<T>;
    stale = memory.value as ApiSuccess<T>;
  }

  const storageKey = "mb_api_cache:" + key;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheEntry<T>;
      if (parsed.value?.ok) {
        if (parsed.expires > now) {
          apiCache.set(key, parsed);
          return parsed.value;
        }
        stale = parsed.value as ApiSuccess<T>;
      }
    }
  } catch {}

  const result = await api<T>(path, options);
  if (result.ok) {
    const entry = { value: result, expires: Date.now() + API_CACHE_TTL };
    apiCache.set(key, entry);
    try { sessionStorage.setItem(storageKey, JSON.stringify(entry)); } catch {}
    return result;
  }

  // If SpaceWeb/Supabase is temporarily slow or unavailable, keep the last
  // successful shared content visible instead of replacing the whole page
  // with "Database is not available".
  if (stale && ["NETWORK", "UPSTREAM", "DB_UNAVAILABLE", "BAD_RESPONSE"].includes(result.error.code)) {
    return { ...stale, stale: true };
  }
  return result;
}

export function invalidateApiCache(prefix = "") {
  for (const key of apiCache.keys()) {
    if (!prefix || key.startsWith(prefix)) apiCache.delete(key);
  }
  if (typeof window !== "undefined") {
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i) || "";
        if (key.startsWith("mb_api_cache:") && (!prefix || key.slice(13).startsWith(prefix))) sessionStorage.removeItem(key);
      }
    } catch {}
  }
}
