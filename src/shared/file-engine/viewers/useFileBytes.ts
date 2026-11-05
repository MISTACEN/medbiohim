"use client";

/**
 * Чтение файла для встроенного разбора.
 *
 * Файлы MEDBIOHIM отдаются same-origin через Worker (или подписанной ссылкой),
 * поэтому запрос идёт с credentials: same-origin. Размер проверяется дважды:
 * по Content-Length и по фактическому буферу — заголовку доверять нельзя.
 */
import { useCallback, useEffect, useState } from "react";

export type FileBytesState = {
  status: "loading" | "ready" | "error";
  bytes: ArrayBuffer | null;
  error: string | null;
};

export function useFileBytes(url: string, maxBytes: number) {
  const [state, setState] = useState<FileBytesState>({ status: "loading", bytes: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!url) {
      setState({ status: "error", bytes: null, error: "Ссылка на файл недоступна." });
      return;
    }
    const controller = new AbortController();
    let active = true;
    setState({ status: "loading", bytes: null, error: null });

    void (async () => {
      try {
        const response = await fetch(url, { credentials: "same-origin", signal: controller.signal });
        if (!response.ok) throw new Error(`Сервер вернул ${response.status}. Файл не открылся.`);

        const declared = Number(response.headers.get("content-length") || 0);
        if (declared && declared > maxBytes) {
          throw new Error("Файл больше предела встроенного просмотра. Скачайте оригинал.");
        }

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > maxBytes) {
          throw new Error("Файл больше предела встроенного просмотра. Скачайте оригинал.");
        }
        if (!active) return;
        setState({ status: "ready", bytes: buffer, error: null });
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setState({
          status: "error",
          bytes: null,
          error: error instanceof Error ? error.message : "Не удалось прочитать файл.",
        });
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [url, maxBytes, attempt]);

  return { ...state, reload };
}
