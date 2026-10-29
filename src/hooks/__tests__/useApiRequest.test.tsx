import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useApiRequest } from "@/hooks/useApiRequest";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useApiRequest: успех и ошибка", () => {
  it("начинает с loading=true и отдаёт данные после ответа", async () => {
    const fetcher = vi.fn(async () => "payload");
    const { result } = renderHook(() => useApiRequest<string>(fetcher, []));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBe("payload");
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("ошибку Error превращает в error и сбрасывает data", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("Сервер недоступен");
    });
    const { result } = renderHook(() => useApiRequest<string>(fetcher, []));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Сервер недоступен");
    expect(result.current.data).toBeNull();
  });

  it("не-Error отклонение даёт общий русский текст", async () => {
    const fetcher = vi.fn(async () => {
      throw "boom";
    });
    const { result } = renderHook(() => useApiRequest<string>(fetcher, []));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Не удалось загрузить данные");
  });

  it("reload повторяет запрос и убирает прошлую ошибку", async () => {
    const fetcher = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(new Error("Сеть недоступна"))
      .mockResolvedValueOnce("recovered");
    const { result } = renderHook(() => useApiRequest<string>(fetcher, []));

    await waitFor(() => expect(result.current.error).toBe("Сеть недоступна"));

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.data).toBe("recovered"));
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("useApiRequest: отмена", () => {
  it("при unmount прерывает signal и не обновляет состояние", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let resolveFetch: (value: string) => void = () => {};
    let receivedSignal: AbortSignal | null = null;
    const fetcher = vi.fn(
      (signal: AbortSignal) =>
        new Promise<string>((resolve) => {
          receivedSignal = signal;
          resolveFetch = resolve;
        })
    );

    const { unmount } = renderHook(() => useApiRequest<string>(fetcher, []));
    unmount();

    expect(receivedSignal).not.toBeNull();
    expect((receivedSignal as AbortSignal | null)?.aborted).toBe(true);

    // Ответ приходит уже после размонтирования: setState быть не должно.
    resolveFetch("late");
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).not.toHaveBeenCalled();
  });

  it("не запускает fetcher, пока enabled=false, и запускает после", async () => {
    const fetcher = vi.fn(async () => "payload");
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useApiRequest<string>(fetcher, [], { enabled }),
      { initialProps: { enabled: false } }
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.data).toBe("payload"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("смена deps перезапускает запрос и отменяет предыдущий", async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return Promise.resolve("item");
    });
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) =>
        useApiRequest<string>((signal) => fetcher(signal), [id]),
      { initialProps: { id: 1 } }
    );

    await waitFor(() => expect(result.current.data).toBe("item"));

    rerender({ id: 2 });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(signals[0].aborted).toBe(true);
  });
});
