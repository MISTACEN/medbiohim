import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// api.ts импортирует сессию из "@/lib/auth/session"; в тестах api()/кэша
// подменяем её, чтобы проверять именно поведение клиента, а не refresh.
const session = vi.hoisted(() => ({
  accessToken: null as string | null,
  scope: "user-1" as string | null,
  refresh: vi.fn<() => Promise<string | null>>(),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getAccessToken: () => session.accessToken,
  currentUserScope: () => session.scope,
  hasAccessToken: () => Boolean(session.accessToken),
  hasRefreshToken: () => true,
  refreshAccessToken: session.refresh,
  refreshSessionResult: vi.fn(),
  registerUserScopeReset: vi.fn(),
  setSessionTokens: session.setTokens,
  clearSessionTokens: session.clearTokens,
}));

import { api, apiCached, invalidateApiCache, listSubjects } from "@/lib/api";

type FakeResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};

function fakeResponse(
  body: string,
  status = 200,
  headers: Record<string, string> = {}
): FakeResponse {
  const normalized = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => normalized.get(name.toLowerCase()) ?? null },
    text: async () => body,
  };
}

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return fakeResponse(JSON.stringify(payload), status, {
    "content-type": "application/json",
    ...headers,
  });
}

function success<T>(data: T, requestId = "r-1"): FakeResponse {
  return jsonResponse({ ok: true, data, requestId });
}

function failure(code: string, requestId = "r-err", status = 500, message = ""): FakeResponse {
  return jsonResponse({ ok: false, error: { code, message }, requestId }, status);
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  session.accessToken = null;
  session.scope = "user-1";
  session.refresh.mockReset();
  sessionStorage.clear();
  localStorage.clear();
  invalidateApiCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("api(): успешные ответы", () => {
  it("разбирает JSON-конверт и сохраняет requestId", async () => {
    fetchMock.mockResolvedValue(success({ items: [1, 2] }, "req-1"));

    const result = await api<{ items: number[] }>("/subjects");

    expect(result).toEqual({ ok: true, data: { items: [1, 2] }, requestId: "req-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ходит на same-origin /api/v1, добавляет слеш и no-store", async () => {
    fetchMock.mockResolvedValue(success({}));

    await api("subjects");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/subjects");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toMatchObject({ Accept: "application/json" });
  });

  it("подставляет Bearer-токен, если он есть", async () => {
    session.accessToken = "access-42";
    fetchMock.mockResolvedValue(success({}));

    await api("/auth/me");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access-42");
  });
});

describe("api(): ошибки API", () => {
  it("204 без тела превращает в BAD_RESPONSE с русским текстом и requestId из заголовка", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse("", 204, { "x-request-id": "req-204" })
    );

    const result = await api("/tests/1/start", { method: "POST", body: "{}" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("BAD_RESPONSE");
      expect(result.error.message).toContain("неожиданный ответ");
      expect(result.requestId).toBe("req-204");
    }
  });

  it("JSON-конверт ошибки отдаётся как есть (POST без повторов)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          ok: false,
          error: { code: "VALIDATION", message: "Проверьте заполненные поля." },
          requestId: "req-9",
        },
        400
      )
    );

    const result = await api("/homeworks", { method: "POST", body: "{}" });

    expect(result).toEqual({
      ok: false,
      error: { code: "VALIDATION", message: "Проверьте заполненные поля." },
      requestId: "req-9",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("GET с временной ошибкой повторяется один раз", async () => {
    fetchMock.mockImplementation(async () => failure("DB_UNAVAILABLE", "req-retry", 503));

    const result = await api("/subjects");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DB_UNAVAILABLE");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("GET с 404 не повторяется", async () => {
    fetchMock.mockImplementation(async () => failure("NOT_FOUND", "req-404", 404));

    await api("/subjects/missing");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("сетевой сбой POST не повторяется и даёт NETWORK", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await api("/homeworks", { method: "POST", body: "{}" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NETWORK");
      expect(result.error.message).toBe(
        "Нет связи с сервером. Проверьте интернет и попробуйте снова."
      );
      expect(result.requestId).toBe("client");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("сетевой сбой GET повторяется — один сбой не должен ронять страницу", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await api("/subjects");

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("api(): 401 и refresh", () => {
  it("после 401 обновляет токен и повторяет запрос с новым Bearer", async () => {
    session.refresh.mockResolvedValue("fresh-token");
    fetchMock
      .mockResolvedValueOnce(failure("UNAUTHORIZED", "req-401", 401))
      .mockResolvedValueOnce(success({ id: "u1" }, "req-ok"));

    const result = await api<{ id: string }>("/auth/me");

    expect(result).toEqual({ ok: true, data: { id: "u1" }, requestId: "req-ok" });
    expect(session.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, retryInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer fresh-token"
    );
  });

  it("если refresh не удался, второй запрос не отправляется", async () => {
    session.refresh.mockResolvedValue(null);
    fetchMock.mockResolvedValue(failure("UNAUTHORIZED", "req-401", 401));

    const result = await api("/auth/me");

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("api(): отмена через AbortSignal", () => {
  it("передаёт отменённый сигнал в fetch и не бросает исключение наружу", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockImplementation(
      async (_url: string, init: RequestInit) =>
        (init.signal as AbortSignal).aborted
          ? Promise.reject(new DOMException("Aborted", "AbortError"))
          : success({})
    );

    const result = await api("/homeworks", { method: "POST", body: "{}", signal: controller.signal });

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.signal as AbortSignal).aborted).toBe(true);
  });

  it("отмена в полёте отклоняет запрос и не оставляет зависший промис", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        })
    );

    const controller = new AbortController();
    const pending = api("/homeworks", { method: "POST", body: "{}", signal: controller.signal });
    controller.abort();
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("отменённый GET не повторяется и не маскируется под сетевой сбой", async () => {
    // Регрессия: раньше AbortError превращался в NETWORK, NETWORK считался
    // временным — и отменённый запрос уходил в сеть второй раз, а страница
    // показывала «Нет связи с сервером».
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockImplementation(
      async (_url: string, init: RequestInit) =>
        (init.signal as AbortSignal).aborted
          ? Promise.reject(new DOMException("Aborted", "AbortError"))
          : success({})
    );

    const result = await api("/homeworks", { signal: controller.signal });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("ABORTED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("отмена GET в полёте не порождает повторный запрос", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        })
    );

    const controller = new AbortController();
    const pending = api("/subjects", { signal: controller.signal });
    controller.abort();
    const result = await pending;

    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("ABORTED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("api(): события загрузки", () => {
  it("диспатчит mbh:api-start и mbh:api-end даже при ошибке", async () => {
    const start = vi.fn();
    const end = vi.fn();
    window.addEventListener("mbh:api-start", start);
    window.addEventListener("mbh:api-end", end);
    fetchMock.mockResolvedValue(failure("VALIDATION", "r", 400));

    try {
      await api("/homeworks", { method: "POST", body: "{}" });
    } finally {
      window.removeEventListener("mbh:api-start", start);
      window.removeEventListener("mbh:api-end", end);
    }

    expect(start).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });
});

describe("apiCached(): кэш", () => {
  it("второй вызов в пределах TTL не ходит в сеть", async () => {
    fetchMock.mockResolvedValue(success({ items: ["a"] }, "req-cache"));

    const first = await apiCached<{ items: string[] }>("/subjects");
    const second = await apiCached<{ items: string[] }>("/subjects");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(second).toMatchObject({ ok: true, requestId: "req-cache" });
  });

  it("разные query-ключи кэшируются раздельно", async () => {
    fetchMock
      .mockResolvedValueOnce(success({ items: ["1"] }, "req-course-1"))
      .mockResolvedValueOnce(success({ items: ["2"] }, "req-course-2"));

    const first = await apiCached("/subjects?course=1");
    const second = await apiCached("/subjects?course=2");
    const firstAgain = await apiCached("/subjects?course=1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(firstAgain).toEqual(first);
    expect(second).not.toEqual(first);
  });

  it("некэшируемый путь (/dashboard) всегда идёт в сеть", async () => {
    fetchMock.mockResolvedValue(success({}));

    await apiCached("/dashboard");
    await apiCached("/dashboard");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("без области пользователя кэш отключается", async () => {
    session.scope = null;
    fetchMock.mockResolvedValue(success({}));

    await apiCached("/subjects");
    await apiCached("/subjects");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("кэш разделён по пользователю: смена аккаунта не отдаёт чужие данные", async () => {
    fetchMock
      .mockResolvedValueOnce(success({ items: ["user-1"] }, "req-u1"))
      .mockResolvedValueOnce(success({ items: ["user-2"] }, "req-u2"));

    const first = await apiCached("/subjects");
    session.scope = "user-2";
    const second = await apiCached("/subjects");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first).not.toEqual(second);
  });

  it("invalidateApiCache(prefix) сбрасывает только совпавшие пути", async () => {
    fetchMock.mockResolvedValue(success({}));

    await apiCached("/subjects");
    await apiCached("/tests");
    invalidateApiCache("/subjects");
    await apiCached("/subjects");
    await apiCached("/tests");

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("при временной ошибке отдаёт последний успешный ответ с флагом stale", async () => {
    fetchMock.mockResolvedValueOnce(success({ items: ["cached"] }, "req-cached"));
    await apiCached("/subjects");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    fetchMock.mockImplementation(async () => failure("DB_UNAVAILABLE", "req-down", 503));

    const result = await apiCached<{ items: string[] }>("/subjects");

    expect(result).toMatchObject({
      ok: true,
      stale: true,
      data: { items: ["cached"] },
      requestId: "req-cached",
    });
  });

  it("без успешного кэша ошибка возвращается как есть", async () => {
    fetchMock.mockImplementation(async () => failure("DB_UNAVAILABLE", "req-down", 503));

    const result = await apiCached("/subjects");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DB_UNAVAILABLE");
  });
});

describe("listSubjects(): фильтрация границы API", () => {  it("выбрасывает битые карточки предметов из ответа", async () => {
    fetchMock.mockResolvedValue(
      success({
        items: [
          { id: "s1", name: "Гистология" },
          { id: "broken" },
          null,
          { id: "s2", name: "Химия" },
        ],
      })
    );

    const result = await listSubjects();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toEqual([
        { id: "s1", name: "Гистология" },
        { id: "s2", name: "Химия" },
      ]);
    }
  });
});
