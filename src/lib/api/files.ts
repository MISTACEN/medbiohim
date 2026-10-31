/**
 * Файлы, аватары и blob-медиа (картинки тренажёра, файлы материалов)
 * (TECH-AUDIT-PLAN-2026-10-27 §6, D5). Поведение не менялось при выносе
 * из src/lib/api.ts: те же кэши object URL, лимит параллелизма и refresh.
 */
import { api, API_URL } from "./client";
import { invalidateApiCache } from "./cache";
import type { ApiResult } from "./types";
import {
  currentUserScope,
  getAccessToken,
  refreshAccessToken,
  registerUserScopeReset,
} from "@/lib/auth/session";
import { endpoints } from "../endpoints";

const materialFileCache = new Map<string, string>();
const trainerImageCache = new Map<string, string>();
const trainerImageInflight = new Map<string, Promise<string | null>>();
const trainerCardCache = new Map<string, any>();
const trainerCardInflight = new Map<string, Promise<ApiResult<any>>>();

// The session module clears these caches when the account behind the tokens changes.
registerUserScopeReset(clearUserScopedCaches);

function clearUserScopedCaches() {
  invalidateApiCache();
  for (const url of trainerImageCache.values()) { if (url.startsWith("blob:")) { try { URL.revokeObjectURL(url); } catch {} } }
  for (const url of materialFileCache.values()) { if (url.startsWith("blob:")) { try { URL.revokeObjectURL(url); } catch {} } }
  trainerImageCache.clear();
  trainerImageInflight.clear();
  materialFileCache.clear();
  trainerCardCache.clear();
  trainerCardInflight.clear();
}

function logTrainerImageResponse(res: Response, startedAt: number) {
  if (typeof window === "undefined") return;
  const entry: any = { at: Date.now(), method: "GET", path: endpoints.content.trainerFeedImageLabel(), status: res.status, durationMs: Date.now() - startedAt, source: res.headers.get("x-mbh-api-source") || "unknown", requestId: res.headers.get("x-request-id") || "", fallback: res.headers.get("x-mbh-transport-fallback") === "true", ok: res.ok, kind: "image_response" };
  const persist = () => {
    try { const key = "mbh:api-log-buffer"; const prior = JSON.parse(sessionStorage.getItem(key) || "[]"); sessionStorage.setItem(key, JSON.stringify([entry, ...(Array.isArray(prior) ? prior : [])].slice(0, 1000))); } catch {}
    window.dispatchEvent(new CustomEvent("mbh:api-log", { detail: entry }));
  };
  if (!res.ok && (res.headers.get("content-type") || "").includes("json")) {
    void res.clone().json().then((payload: any) => { if (payload?.error?.code) entry.errorCode = String(payload.error.code).slice(0, 80); }).catch(() => {}).finally(persist);
  } else persist();
}

// Keep image bursts from overwhelming the authenticated Worker/Supabase path when
// a feed renders many cards at once. Failed 503s are surfaced to the UI for manual
// retry instead of multiplying an upstream outage into hundreds of retry requests.
const MAX_CONCURRENT_TRAINER_IMAGE_REQUESTS = 6;
let activeTrainerImageRequests = 0;
const trainerImageQueue: Array<() => void> = [];
async function withTrainerImageConcurrency<T>(task: () => Promise<T>): Promise<T> {
  if (activeTrainerImageRequests >= MAX_CONCURRENT_TRAINER_IMAGE_REQUESTS) {
    await new Promise<void>(resolve => trainerImageQueue.push(resolve));
  } else {
    activeTrainerImageRequests++;
  }
  try { return await task(); }
  finally {
    // Transfer the occupied slot directly to the next waiter. Decrement only
    // when no waiter exists, otherwise a newly arriving task could race ahead.
    const next = trainerImageQueue.shift();
    if (next) next();
    else activeTrainerImageRequests--;
  }
}

export async function getTrainerImageUrl(id: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const idKey = String(id);
  const userScope = currentUserScope();
  const cacheKey = userScope === null ? null : `${userScope}|${idKey}`;
  if (cacheKey) {
    const cached = trainerImageCache.get(cacheKey);
    if (cached) return cached;
    const pending = trainerImageInflight.get(cacheKey);
    if (pending) return pending;
  }

  const run = async () => {
    let token = getAccessToken();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const bust = attempt === 0 ? "" : `?retry=${attempt}-${Date.now()}`;
        let imageRequestStartedAt = Date.now();
        let res = await fetch(`${API_URL}${endpoints.content.trainerFeedImage(idKey)}${bust}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        logTrainerImageResponse(res, imageRequestStartedAt);
        if (res.status === 401) {
          // A feed renders many cards at once; they must share one refresh, not start their own.
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            token = refreshed;
            imageRequestStartedAt = Date.now();
            res = await fetch(`${API_URL}${endpoints.content.trainerFeedImage(idKey)}?retry=auth-${Date.now()}`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
              signal: AbortSignal.timeout(15000),
            });
            logTrainerImageResponse(res, imageRequestStartedAt);
          }
        }
        if (res.ok) {
          const blob = await res.blob();
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            if (cacheKey && currentUserScope() === userScope) trainerImageCache.set(cacheKey, url);
            return url;
          }
        }
        // Do not fan out retries for deterministic auth, access, missing-file or
        // validation errors when a feed renders many cards concurrently.
        if ([401, 403, 404, 410, 422, 503].includes(res.status)) return null;
        if (res.status < 500 && res.status !== 429) return null;
      } catch {}
      if (attempt < 1) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
    return null;
  };
  const promise = withTrainerImageConcurrency(run).finally(() => { if (cacheKey) trainerImageInflight.delete(cacheKey); });
  if (cacheKey) trainerImageInflight.set(cacheKey, promise);
  return promise;
}

export async function retryTrainerImage(id: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const idKey = String(id);
  const userScope = currentUserScope();
  const cacheKey = userScope === null ? null : `${userScope}|${idKey}`;
  const old = cacheKey ? trainerImageCache.get(cacheKey) : undefined;
  if (old) { try { URL.revokeObjectURL(old); } catch {} trainerImageCache.delete(cacheKey!); }
  if (cacheKey) trainerImageInflight.delete(cacheKey);
  return getTrainerImageUrl(idKey);
}

export function prefetchTrainerImages(ids: (string | null | undefined)[]): void {
  if (typeof window === "undefined") return;
  const userScope = currentUserScope();
  for (const id of ids) {
    if (!id) continue;
    const idKey = String(id);
    const cacheKey = userScope === null ? null : `${userScope}|${idKey}`;
    if (cacheKey && (trainerImageCache.has(cacheKey) || trainerImageInflight.has(cacheKey))) continue;
    void getTrainerImageUrl(idKey);
  }
}

export function peekTrainerImageUrl(id: string): string | null {
  if (typeof window === "undefined") return null;
  const userScope = currentUserScope();
  return userScope === null ? null : trainerImageCache.get(`${userScope}|${String(id)}`) ?? null;
}

/** Карточный кэш тренажёра — общий с getTrainerFeedCard в ./content. */
export { trainerCardCache, trainerCardInflight };

// --- SA3: аватар ---------------------------------------------------------
// Загруженный аватар отдаётся только аутентифицированным прокси, поэтому в
// <img src> его нельзя подставить напрямую: скачиваем блоб с Bearer-токеном
// и кэшируем object URL на время жизни вкладки (как в тренировочных картинках).
const avatarCache = new Map<string, string>();
const avatarInflight = new Map<string, Promise<string | null>>();

/** Сбросить кэш аватара: после загрузки/удаления старая картинка уже неверна. */
export function forgetAvatar(userId?: string) {
  if (!userId) {
    for (const url of avatarCache.values()) { try { URL.revokeObjectURL(url); } catch {} }
    avatarCache.clear();
    avatarInflight.clear();
    return;
  }
  const scope = currentUserScope();
  const key = scope === null ? null : `${scope}|${userId}`;
  if (!key) return;
  const cached = avatarCache.get(key);
  if (cached) { try { URL.revokeObjectURL(cached); } catch {} }
  avatarCache.delete(key);
  avatarInflight.delete(key);
}

/** Object URL аватара пользователя или null, если аватара нет/он недоступен. */
export async function getAvatarUrl(userId: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const idKey = String(userId);
  const userScope = currentUserScope();
  const cacheKey = userScope === null ? null : `${userScope}|${idKey}`;
  if (cacheKey) {
    const cached = avatarCache.get(cacheKey);
    if (cached) return cached;
    const pending = avatarInflight.get(cacheKey);
    if (pending) return pending;
  }
  const run = async () => {
    let token = getAccessToken();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const bust = attempt === 0 ? "" : `?retry=${attempt}-${Date.now()}`;
        const res = await fetch(`${API_URL}${endpoints.files.avatarDetail(idKey)}${bust}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        });
        if (res.status === 401 && attempt === 0) {
          const refreshed = await refreshAccessToken();
          if (refreshed) { token = refreshed; continue; }
        }
        if (res.ok) {
          const blob = await res.blob();
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            if (cacheKey && currentUserScope() === userScope) avatarCache.set(cacheKey, url);
            return url;
          }
        }
        // 404 — аватара просто нет; повторять бессмысленно.
        if ([400, 401, 403, 404, 422].includes(res.status)) return null;
      } catch {}
      if (attempt < 1) await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
    }
    return null;
  };
  const promise = run().finally(() => { if (cacheKey) avatarInflight.delete(cacheKey); });
  if (cacheKey) avatarInflight.set(cacheKey, promise);
  return promise;
}

/** Загрузить аватар (JPEG/PNG/WebP до 2 МБ). Сервер проверяет тип и размер сам. */
export async function uploadAvatar(file: File): Promise<ApiResult<{ avatar_key: string; avatar_url: string }>> {
  const form = new FormData();
  form.append("file", file);
  const result = await api<{ avatar_key: string; avatar_url: string }>(endpoints.files.avatar(), { method: "POST", body: form });
  if (result.ok) forgetAvatar();
  return result;
}

/** Удалить загруженный аватар (внешний avatar_url из Google не затрагивается). */
export async function deleteAvatar(): Promise<ApiResult<{ deleted: boolean }>> {
  const result = await api<{ deleted: boolean }>(endpoints.files.avatar(), { method: "DELETE" });
  if (result.ok) forgetAvatar();
  return result;
}

export async function getMaterialFileUrl(id: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const idKey = String(id);
  const userScope = currentUserScope();
  const cacheKey = userScope === null ? null : `${userScope}|${idKey}`;
  if (cacheKey) {
    const cached = materialFileCache.get(cacheKey);
    if (cached) return cached;
  }
  const cacheForCurrentUser = (url: string) => {
    if (cacheKey && currentUserScope() === userScope) materialFileCache.set(cacheKey, url);
    return url;
  };
  try {
    const negotiate = async (token: string | null) => {
      const res = await fetch(`${API_URL}${endpoints.content.materialFileUrl(idKey)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const parsed = await res.json() as { ok?: boolean; data?: { url?: string | null; mode?: string; expires_in?: number } };
      if (!parsed?.ok) return null;
      return parsed.data ?? null;
    };

    let token = getAccessToken();
    let meta = await negotiate(token);
    if (meta?.url) {
      // B2 presigned URLs and Upstash Blob signedReadUrl links expire.
      // Never cache signed or explicitly expiring URLs: reopen through the API
      // to mint a fresh signature after navigation or the five-minute TTL.
      if (meta.mode === "presigned" || meta.mode === "upstash-blob" || Number(meta.expires_in) > 0) return meta.url;
      return cacheForCurrentUser(meta.url);
    }

    if (!meta) {
      const access = await refreshAccessToken();
      if (access) {
        token = access;
        meta = await negotiate(access);
        if (meta?.url) {
          // Apply the same expiry rule after refreshing the access token.
          if (meta.mode === "presigned" || meta.mode === "upstash-blob" || Number(meta.expires_in) > 0) return meta.url;
          return cacheForCurrentUser(meta.url);
        }
      }
    }

    // Legacy Histology files are private/authenticated binary responses.
    // Fetch them with Bearer and expose only a local blob URL to the viewer.
    const res = await fetch(`${API_URL}${endpoints.content.materialFile(idKey)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 401) {
      const access = await refreshAccessToken();
      if (access) {
        const retry = await fetch(`${API_URL}${endpoints.content.materialFile(idKey)}`, {
          headers: { Authorization: `Bearer ${access}` },
          cache: "no-store",
          signal: AbortSignal.timeout(30000),
        });
        if (!retry.ok) return null;
        const blob = await retry.blob();
        if (blob.size === 0) return null;
        return cacheForCurrentUser(URL.createObjectURL(blob));
      }
    }
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    return cacheForCurrentUser(URL.createObjectURL(blob));
  } catch { return null; }
}

export async function fetchHistologySourceFile(path: string): Promise<Blob | null> {
  if (typeof window === "undefined") return null;
  const key = String(path);

  const requestFile = async (token: string | null) => {
    return fetch(
      API_URL + endpoints.content.histologySourceFile() + "?path=" + encodeURIComponent(key),
      { headers: token ? { Authorization: "Bearer " + token } : {}, cache: "no-store", signal: AbortSignal.timeout(30000) }
    );
  };

  let token = getAccessToken();
  try {
    let res = await requestFile(token);
    if (res.status === 401) {
      const access = await refreshAccessToken();
      if (access) {
        token = access;
        res = await requestFile(access);
      }
    }
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size ? blob : null;
  } catch { return null; }
}

export async function fetchMaterialFile(id: string): Promise<Blob | null> {
  if (typeof window === "undefined") return null;
  const token = getAccessToken();
  try {
    let res = await fetch(`${API_URL}${endpoints.content.materialFile(id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        res = await fetch(`${API_URL}${endpoints.content.materialFile(id)}`, { headers: { Authorization: `Bearer ${refreshed}` }, cache: "no-store", signal: AbortSignal.timeout(30000) });
      }
    }
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size ? blob : null;
  } catch { return null; }
}

export async function uploadFile(file: File, groupId?: string, specialtySlug?: string) {
  const fd = new FormData();
  fd.append("file", file);
  if (groupId) fd.append("group_id", groupId);
  if (specialtySlug) fd.append("specialty_slug", specialtySlug);
  return api<any>(endpoints.files.upload(), { method: "POST", body: fd });
}
export async function getFileDownload(id: string): Promise<any> { return api<any>(endpoints.files.file(id)); }
export async function getFile(id: string): Promise<any> { return api(endpoints.files.file(id)) as any; }
export function fileDownloadUrl(id: string): string { return `${API_URL}${endpoints.files.fileDownload(id)}`; }
