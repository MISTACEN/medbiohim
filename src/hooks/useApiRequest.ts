"use client";

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

export type UseApiRequestResult<T> = {
  /** Последний успешный результат fetcher'а; null до первого успеха или после ошибки. */
  data: T | null;
  /** Сообщение последней ошибки; null, пока ошибки нет. */
  error: string | null;
  /** true, пока выполняется текущий запрос (в том числе первый). */
  loading: boolean;
  /** Повторить запрос вручную (например, по кнопке «Повторить»). */
  reload: () => void;
};

/**
 * D9 (TECH-AUDIT-PLAN-2026-10-27 §6): единый слой отменяемой загрузки данных
 * для клиентских страниц — замена ручным `useEffect` + `cancelled`-флагам.
 *
 * Гарантии:
 * - запрос запускается при монтировании и при смене зависимостей;
 * - `AbortController` прерывает работу при размонтировании и смене зависимостей;
 *   сигнал передаётся в fetcher, который может прокинуть его в api()
 *   (`api(path, { signal })`) для реальной отмены fetch;
 * - setState после размонтирования невозможен: результаты отбрасываются
 *   через флаг active;
 * - ошибка fetcher'а превращается в error (сообщение Error или общий текст),
 *   успешный результат — в data.
 */
export function useApiRequest<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList
): UseApiRequestResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  // Свежий fetcher держим в ref: замыкание пересоздаётся каждым рендером,
  // а перезапуск эффекта определяют только deps вызывающей стороны.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        // После unmount/смены зависимостей или отмены никаких обновлений.
        if (!active || controller.signal.aborted) return;
        setData(null);
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : "Не удалось загрузить данные"
        );
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
    // deps передаются динамически вызывающей стороной.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { data, error, loading, reload };
}
