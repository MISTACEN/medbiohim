import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSessionTokens,
  currentUserScope,
  getAccessToken,
  hasAccessToken,
  refreshAccessToken,
  refreshSessionResult,
  SESSION_EXPIRED_EVENT,
  setSessionTokens,
} from "@/lib/auth/session";

const LEGACY_ACCESS_KEY = "mb_access_token";
const LEGACY_REFRESH_KEY = "mb_refresh_token";
const TRANSPORT_FLAG_KEY = "mb_auth_transport";

/** Минимальный JWT: сессии нужен только payload.sub (base64url). */
function jwt(sub: string): string {
  const payload = btoa(JSON.stringify({ sub }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.sig`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  // По умолчанию: refresh отдаёт access в теле 200; session-обмен — 204.
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/auth/refresh")) return json({ ok: true, access_token: jwt("u1") });
    return new Response(null, { status: 204 });
  });
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Вход: обмен токенов на HttpOnly куки + in-memory access. */
async function signIn(sub = "u1", refresh = "refresh-1") {
  await setSessionTokens(jwt(sub), refresh);
}

describe("refreshAccessToken", () => {
  it("ходит в POST /api/auth/refresh и берёт access из тела (не из localStorage)", async () => {
    await signIn();
    fetchMock.mockClear();
    const access = jwt("u2");
    fetchMock.mockResolvedValue(json({ ok: true, access_token: access }));

    await expect(refreshAccessToken()).resolves.toBe(access);
    expect(getAccessToken()).toBe(access);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(String(init.body ?? "")).not.toContain("refresh");
  });

  it("20 параллельных обновлений дают ровно один запрос (single-flight)", async () => {
    await signIn();
    fetchMock.mockClear();
    const access = jwt("u1");
    let resolveFetch: (value: Response) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })
    );

    const calls = Array.from({ length: 20 }, () => refreshAccessToken());
    resolveFetch(json({ ok: true, access_token: access }));

    await expect(Promise.all(calls)).resolves.toEqual(Array(20).fill(access));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("refreshAccessToken: ошибки", () => {
  it("401 (refresh-токен отвергнут, куки сервер уже очистил) завершает сессию", async () => {
    await signIn();
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    fetchMock.mockResolvedValue(json({ ok: false, error: { code: "INVALID_REFRESH" } }, 401));

    try {
      await expect(refreshAccessToken()).resolves.toBeNull();
    } finally {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    }

    expect(getAccessToken()).toBeNull();
    expect(hasAccessToken()).toBe(false);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("502 UPSTREAM — временный сбой, сессия сохраняется", async () => {
    await signIn();
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    fetchMock.mockResolvedValue(json({ ok: false, error: { code: "UPSTREAM" } }, 502));

    try {
      const result = await refreshSessionResult();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UPSTREAM");
    } finally {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    }

    expect(hasAccessToken()).toBe(true);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("сетевой сбой даёт NETWORK", async () => {
    await signIn();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await refreshSessionResult();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NETWORK");
  });

  it("битый JSON при 200 даёт BAD_RESPONSE, а не исключение", async () => {
    await signIn();
    fetchMock.mockResolvedValue(
      new Response("not json", { status: 200, headers: { "content-type": "application/json" } })
    );

    const result = await refreshSessionResult();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("BAD_RESPONSE");
  });

  it("200 без access_token даёт BAD_RESPONSE", async () => {
    await signIn();
    fetchMock.mockResolvedValue(json({ ok: true }));

    await expect(refreshAccessToken()).resolves.toBeNull();
  });
});

describe("refreshSessionResult", () => {
  it("на успехе отдаёт конверт ApiResult с access-токеном из тела", async () => {
    await signIn();
    const access = jwt("u9");
    fetchMock.mockResolvedValue(json({ ok: true, access_token: access }));

    const result = await refreshSessionResult();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.access_token).toBe(access);
      expect(result.requestId).toBe("client");
    }
  });
});

describe("хранение сессии", () => {
  it("setSessionTokens обменивает токены на куки и не пишет токены в localStorage", async () => {
    localStorage.setItem(LEGACY_ACCESS_KEY, "old");
    localStorage.setItem(LEGACY_REFRESH_KEY, "old");

    await setSessionTokens(jwt("u1"), "refresh-1");

    expect(getAccessToken()).toBe(jwt("u1"));
    expect(hasAccessToken()).toBe(true);
    // Токены ушли на сервер в обмен на куки.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("/api/auth/session");
    expect(JSON.parse(String(init.body))).toEqual({ access_token: jwt("u1"), refresh_token: "refresh-1" });
    // localStorage: только флаг транспорта; legacy-ключи удалены.
    expect(localStorage.getItem(TRANSPORT_FLAG_KEY)).toBe("cookie");
    expect(localStorage.getItem(LEGACY_ACCESS_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_REFRESH_KEY)).toBeNull();
  });

  it("clearSessionTokens чистит память и legacy-ключи", async () => {
    localStorage.setItem(LEGACY_ACCESS_KEY, "old");
    localStorage.setItem(LEGACY_REFRESH_KEY, "old");
    await signIn();
    clearSessionTokens();

    expect(getAccessToken()).toBeNull();
    expect(hasAccessToken()).toBe(false);
    expect(localStorage.getItem(LEGACY_ACCESS_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_REFRESH_KEY)).toBeNull();
  });

  it("область кэша — sub in-memory токена; без токена — anon", async () => {
    await signIn("u1");
    expect(currentUserScope()).toBe("u1");

    clearSessionTokens();
    expect(currentUserScope()).toBe("anon");
  });
});
