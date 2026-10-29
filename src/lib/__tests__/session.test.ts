import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSessionTokens,
  currentUserScope,
  getAccessToken,
  getRefreshToken,
  refreshAccessToken,
  refreshSessionResult,
  SESSION_EXPIRED_EVENT,
  setSessionTokens,
} from "@/lib/auth/session";

const ACCESS_KEY = "mb_access_token";
const REFRESH_KEY = "mb_refresh_token";

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
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("refreshAccessToken", () => {
  it("без refresh-токена не ходит в сеть", async () => {
    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("обновляет access-токен и сохраняет новую пару", async () => {
    localStorage.setItem(REFRESH_KEY, "refresh-1");
    const access = jwt("u1");
    fetchMock.mockResolvedValue(
      json({ ok: true, data: { access_token: access, refresh_token: "refresh-2" } })
    );

    await expect(refreshAccessToken()).resolves.toBe(access);

    expect(getAccessToken()).toBe(access);
    expect(getRefreshToken()).toBe("refresh-2");
    expect(currentUserScope()).toBe("u1");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ refresh_token: "refresh-1" });
  });

  it("20 параллельных обновлений дают ровно один запрос (single-flight)", async () => {
    localStorage.setItem(REFRESH_KEY, "refresh-1");
    const access = jwt("u1");
    let resolveFetch: (value: Response) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })
    );

    const calls = Array.from({ length: 20 }, () => refreshAccessToken());
    resolveFetch(json({ ok: true, data: { access_token: access } }));

    await expect(Promise.all(calls)).resolves.toEqual(Array(20).fill(access));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("refreshAccessToken: ошибки", () => {
  it("INVALID_REFRESH очищает токены и сообщает об истечении сессии", async () => {
    localStorage.setItem(ACCESS_KEY, jwt("u1"));
    localStorage.setItem(REFRESH_KEY, "refresh-1");
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    fetchMock.mockResolvedValue(
      json({ ok: false, error: { code: "INVALID_REFRESH" } }, 401)
    );

    try {
      await expect(refreshAccessToken()).resolves.toBeNull();
    } finally {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    }

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("401 без INVALID_REFRESH не разлогинивает (сервис Auth мог быть недоступен)", async () => {
    localStorage.setItem(ACCESS_KEY, jwt("u1"));
    localStorage.setItem(REFRESH_KEY, "refresh-1");
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    fetchMock.mockResolvedValue(json({ ok: false, error: { code: "UNAUTHORIZED" } }, 401));

    try {
      await expect(refreshAccessToken()).resolves.toBeNull();
    } finally {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    }

    expect(getRefreshToken()).toBe("refresh-1");
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("5xx считается временным сбоем, токены остаются", async () => {
    localStorage.setItem(REFRESH_KEY, "refresh-1");
    fetchMock.mockResolvedValue(json({ ok: false }, 503));

    const result = await refreshSessionResult();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UPSTREAM");
    expect(getRefreshToken()).toBe("refresh-1");
  });

  it("сетевой сбой даёт NETWORK", async () => {
    localStorage.setItem(REFRESH_KEY, "refresh-1");
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await refreshSessionResult();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NETWORK");
  });

  it("битый JSON при 200 даёт BAD_RESPONSE, а не исключение", async () => {
    localStorage.setItem(REFRESH_KEY, "refresh-1");
    fetchMock.mockResolvedValue(
      new Response("not json", { status: 200, headers: { "content-type": "application/json" } })
    );

    const result = await refreshSessionResult();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("BAD_RESPONSE");
  });

  it("200 без access_token даёт BAD_RESPONSE", async () => {
    localStorage.setItem(REFRESH_KEY, "refresh-1");
    fetchMock.mockResolvedValue(json({ ok: true, data: {} }));

    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(getRefreshToken()).toBe("refresh-1");
  });
});

describe("refreshSessionResult", () => {
  it("на успехе отдаёт конверт ApiResult и актуальный refresh-токен", async () => {
    localStorage.setItem(REFRESH_KEY, "refresh-1");
    const access = jwt("u1");
    fetchMock.mockResolvedValue(
      json({ ok: true, data: { access_token: access, refresh_token: "refresh-2" } })
    );

    const result = await refreshSessionResult();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.access_token).toBe(access);
      expect(result.data.refresh_token).toBe("refresh-2");
      expect(result.requestId).toBe("client");
    }
  });
});

describe("хранение токенов", () => {
  it("setSessionTokens/clearSessionTokens синхронны с localStorage", () => {
    setSessionTokens(jwt("u1"), "refresh-1");
    expect(getAccessToken()).toBe(jwt("u1"));
    expect(getRefreshToken()).toBe("refresh-1");

    clearSessionTokens();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("новый пользователь без refresh-токена не наследует refresh предыдущего", () => {
    setSessionTokens(jwt("u1"), "refresh-1");
    setSessionTokens(jwt("u2"));

    expect(currentUserScope()).toBe("u2");
    expect(getRefreshToken()).toBeNull();
  });
});
