/**
 * Единственный владелец сессии клиента: хранение токенов, разбор области кэша
 * пользователя и ровно один refresh на все параллельные 401.
 *
 * До этого модуля существовало четыре независимых пути обновления токена
 * (`api()`/`getTrainerImageUrl`/`fetchMaterialFile`/`refreshSession`), из-за чего
 * пачка протухших запросов могла вызвать шторм refresh-запросов.
 */
import type { ApiResult } from "@/lib/api";

const API_URL = "/api/v1";
const ACCESS_KEY = "mb_access_token";
const REFRESH_KEY = "mb_refresh_token";

/** Событие «сессия окончательно истекла»: refresh-токен отвергнут сервером. */
export const SESSION_EXPIRED_EVENT = "mbh:session-expired";

export type RefreshTokens = { access_token: string; refresh_token?: string };

/**
 * Сброс пользовательских кэшей при смене аккаунта регистрирует API-клиент —
 * так модуль сессии не зависит от кэшей контента и не создаёт цикл импортов.
 */
let resetUserScopedCaches: (() => void) | null = null;

export function registerUserScopeReset(reset: () => void): void {
  resetUserScopedCaches = reset;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readToken(key: string): string | null {
  const store = storage();
  if (!store) return null;
  const value = store.getItem(key);
  return value && value.trim() ? value.trim() : null;
}

export function getAccessToken(): string | null {
  return readToken(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return readToken(REFRESH_KEY);
}

export function hasAccessToken(): boolean {
  return !!getAccessToken();
}

export function hasRefreshToken(): boolean {
  return !!getRefreshToken();
}

/**
 * Область кэша — `sub` из access-токена. Непрозрачный или битый токен даёт
 * `null`: кэш в этом случае не используется, чтобы данные одного пользователя
 * не попали в кэш другого.
 */
export function currentUserScope(): string | null {
  if (typeof window === "undefined") return null;
  const token = getAccessToken();
  if (!token) return "anon";
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json?.sub === "string" && json.sub ? json.sub : null;
  } catch {
    // Никогда не делим bucket кэша между непрозрачными или битыми токенами:
    // такой запрос идёт без кэша, а авторизацию проверяет сам API.
    return null;
  }
}

export function setSessionTokens(access: string, refresh?: string): void {
  const store = storage();
  if (!store) return;
  const previousScope = currentUserScope();
  store.setItem(ACCESS_KEY, access);
  const nextScope = currentUserScope();
  if (refresh) store.setItem(REFRESH_KEY, refresh);
  // An access token for a different user without a matching refresh token must
  // not keep the previous account's refresh token alive.
  else if (previousScope !== nextScope) store.removeItem(REFRESH_KEY);
  if (previousScope !== nextScope && resetUserScopedCaches) resetUserScopedCaches();
}

export function clearSessionTokens(): void {
  const store = storage();
  store?.removeItem(ACCESS_KEY);
  store?.removeItem(REFRESH_KEY);
  if (resetUserScopedCaches) resetUserScopedCaches();
}

function announceSessionExpired(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  } catch {}
}

type RefreshAttempt = {
  accessToken: string | null;
  /** Код ошибки в словаре API-клиента; пустая строка — временный сбой. */
  errorCode: string;
};

let refreshPromise: Promise<RefreshAttempt> | null = null;

async function performRefresh(): Promise<RefreshAttempt> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return { accessToken: null, errorCode: "NO_REFRESH_TOKEN" };
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    if (!res.ok) {
      let code = "";
      try {
        code = String((JSON.parse(text) as { error?: { code?: string } })?.error?.code || "");
      } catch {}
      if (res.status === 401) {
        // Supabase refresh tokens may remain valid while Auth is unavailable, so
        // the session is cleared only when the endpoint explicitly rejects it.
        if (code === "INVALID_REFRESH") {
          clearSessionTokens();
          announceSessionExpired();
        }
        return { accessToken: null, errorCode: code || "UNAUTHORIZED" };
      }
      return { accessToken: null, errorCode: code || (res.status >= 500 ? "UPSTREAM" : "AUTH_ERROR") };
    }
    let parsed: { data?: RefreshTokens } | null = null;
    try {
      parsed = JSON.parse(text) as { data?: RefreshTokens };
    } catch {
      return { accessToken: null, errorCode: "BAD_RESPONSE" };
    }
    const access = parsed?.data?.access_token;
    if (!access) return { accessToken: null, errorCode: "BAD_RESPONSE" };
    setSessionTokens(access, parsed?.data?.refresh_token);
    return { accessToken: access, errorCode: "" };
  } catch {
    return { accessToken: null, errorCode: "NETWORK" };
  }
}

/**
 * Single-flight обновление access-токена. Все пути (обычный запрос, картинки
 * тренажёров, файлы материалов, `refreshSession`) обязаны ходить сюда.
 */
function refreshOnce(): Promise<RefreshAttempt> {
  if (!getRefreshToken()) return Promise.resolve({ accessToken: null, errorCode: "NO_REFRESH_TOKEN" });
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export function refreshAccessToken(): Promise<string | null> {
  if (!getRefreshToken()) return Promise.resolve(null);
  return refreshOnce().then((attempt) => attempt.accessToken);
}

/** Совместимая с `ApiResult` форма для провайдера авторизации. */
export async function refreshSessionResult(): Promise<ApiResult<RefreshTokens>> {
  const attempt = await refreshOnce();
  if (attempt.accessToken) {
    return {
      ok: true,
      data: { access_token: attempt.accessToken, refresh_token: getRefreshToken() ?? undefined },
      requestId: "client",
    };
  }
  return {
    ok: false,
    error: {
      code: attempt.errorCode || "REFRESH_FAILED",
      message: "Не удалось продлить сессию.",
    },
    requestId: "client",
  };
}
