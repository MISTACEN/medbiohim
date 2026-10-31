/**
 * Единственный владелец сессии клиента: cookie-транспорт (RFC
 * docs/COOKIES-RFC-E1.md §3.3, этап 3) и ровно один refresh на все
 * параллельные 401.
 *
 * Токены живут в HttpOnly куках (mb_at/mb_rt), которые ставит и ротирует
 * сервер (`POST /api/auth/session`, `POST /api/auth/refresh`) — JavaScript их
 * не читает и никуда не пишет. Поверх этого модуль держит:
 *
 * 1. in-memory access-токен — единственный источник `Authorization: Bearer`
 *    для вызовов, идущих мимо same-origin прокси (кросс-доменные прямые
 *    запросы к воркеру, куда куки не идут). Он не персистится: перезагрузка
 *    страницы его теряет, восстановление — через `/api/auth/refresh`.
 * 2. Флаг `mb_auth_transport=cookie` в localStorage — метка версии транспорта,
 *    чтобы старые вкладки на localStorage не смешивали режимы.
 *
 * Legacy-ключи токенов (`mb_access_token`/`mb_refresh_token`) только
 * удаляются — никогда не читаются и не пишутся.
 */
import type { ApiResult } from "@/lib/api";

const AUTH_SESSION_URL = "/api/auth/session";
const AUTH_REFRESH_URL = "/api/auth/refresh";
const LEGACY_ACCESS_KEY = "mb_access_token";
const LEGACY_REFRESH_KEY = "mb_refresh_token";
const TRANSPORT_FLAG_KEY = "mb_auth_transport";
const TRANSPORT_FLAG_VALUE = "cookie";

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

// --- in-memory состояние сессии (никогда не персистится) -------------------

let inMemoryAccessToken: string | null = null;
/**
 * «Сессия подтверждена сервером» без доступного access-токена: куки валидны,
 * но JavaScript их не видит. Ставится после успешного `/auth/me` по кукам.
 * Смерть сессии (logout/истечение) сбрасывает её вместе с токеном.
 */
let sessionAlive = false;

/** Считать сессию подтверждённой по кукам (после успешного /auth/me). */
export function markSessionAlive(): void {
  sessionAlive = true;
}

/** In-memory Bearer для кросс-доменных вызовов; null после перезагрузки страницы. */
export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

/**
 * Refresh-токен с этапа 3 недоступен клиенту (HttpOnly кука mb_rt, Path=/api/auth).
 * Оставлено для совместимости поверхности @/lib/api; всегда null.
 */
export function getRefreshToken(): string | null {
  return null;
}

export function hasAccessToken(): boolean {
  return !!inMemoryAccessToken || sessionAlive;
}

/** С этапа 3 факт наличия refresh-куки клиенту неизвестен; всегда false. */
export function hasRefreshToken(): boolean {
  return false;
}

/**
 * Область кэша — `sub` из access-токена. Без in-memory токена (свежая загрузка
 * страницы на куках) даёт "anon": кэш в этом случае общий с гостевым, но живёт
 * только до перезагрузки вкладки, а авторизацию проверяет сам API.
 */
export function currentUserScope(): string | null {
  const token = inMemoryAccessToken;
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

/** Удалить legacy-ключи токенов из localStorage (mb_theme/mb_app_theme не трогаем). */
export function clearLegacyTokenStorage(): void {
  const store = storage();
  if (!store) return;
  store.removeItem(LEGACY_ACCESS_KEY);
  store.removeItem(LEGACY_REFRESH_KEY);
}

/**
 * Сохранить сессию после входа/регистрации/Google-callback: in-memory токен +
 * обмен токенов на HttpOnly куки через POST /api/auth/session (same-origin).
 * В localStorage пишется только флаг транспорта; legacy-ключи удаляются.
 */
export async function setSessionTokens(access: string, refresh?: string): Promise<void> {
  const previousScope = currentUserScope();
  inMemoryAccessToken = access;
  sessionAlive = true;
  const nextScope = currentUserScope();
  const store = storage();
  if (store) {
    store.setItem(TRANSPORT_FLAG_KEY, TRANSPORT_FLAG_VALUE);
    clearLegacyTokenStorage();
  }
  // An access token for a different user must not keep the previous account's
  // caches alive.
  if (previousScope !== nextScope && resetUserScopedCaches) resetUserScopedCaches();
  try {
    await fetch(AUTH_SESSION_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: access, ...(refresh ? { refresh_token: refresh } : {}) }),
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // Куки не поставились (например, офлайн) — последующие запросы получат 401
    // и пройдут обычный путь 401 → refresh, как любой протухший access.
  }
}

export function clearSessionTokens(): void {
  inMemoryAccessToken = null;
  sessionAlive = false;
  clearLegacyTokenStorage();
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

/**
 * POST /api/auth/refresh — сервер ротирует куки сам (single-flight на сервере),
 * в теле 200 отдаёт свежий access для in-memory Bearer. 401 = refresh-токен
 * отвергнут (куки сервер уже очистил) → сессия завершена; 502/сеть — временный
 * сбой, состояние сессии сохраняется.
 */
async function performRefresh(): Promise<RefreshAttempt> {
  try {
    const res = await fetch(AUTH_REFRESH_URL, {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
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
        // Сервер уже очистил куки — на клиенте завершаем сессию целиком.
        clearSessionTokens();
        announceSessionExpired();
        return { accessToken: null, errorCode: code || "INVALID_REFRESH" };
      }
      // Временный сбой (502 UPSTREAM, сеть): сессию не разлогиниваем.
      return { accessToken: null, errorCode: code || (res.status >= 500 ? "UPSTREAM" : "AUTH_ERROR") };
    }
    let parsed: { access_token?: unknown } | null = null;
    try {
      parsed = JSON.parse(text) as { access_token?: unknown };
    } catch {
      return { accessToken: null, errorCode: "BAD_RESPONSE" };
    }
    const access = typeof parsed?.access_token === "string" ? parsed.access_token : "";
    if (!access) return { accessToken: null, errorCode: "BAD_RESPONSE" };
    inMemoryAccessToken = access;
    sessionAlive = true;
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
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export function refreshAccessToken(): Promise<string | null> {
  return refreshOnce().then((attempt) => attempt.accessToken);
}

/** Совместимая с `ApiResult` форма для провайдера авторизации. */
export async function refreshSessionResult(): Promise<ApiResult<RefreshTokens>> {
  const attempt = await refreshOnce();
  if (attempt.accessToken) {
    return {
      ok: true,
      data: { access_token: attempt.accessToken },
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
