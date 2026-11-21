"use client";

/**
 * Индикатор офлайн-очереди.
 *
 * Показывает, сколько ответов ждёт сети, и отправляет очередь, как только
 * браузер сообщает о подключении. В обычном состоянии не занимает места.
 */
import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { flushOutbox, outboxAvailable, pendingWrites } from "@/lib/offline";

export function OfflineIndicator() {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setPending(await pendingWrites());
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
  }, []);

  const flush = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await flushOutbox();
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  useEffect(() => {
    if (!outboxAvailable) return;
    void flush();
    const handleOnline = () => {
      setOnline(true);
      void flush();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const timer = window.setInterval(() => {
      void pendingWrites().then(setPending);
    }, 30000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(timer);
    };
  }, [flush]);

  if (!outboxAvailable || (online && pending === 0)) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm shadow-lg">
      <span className="flex items-center gap-2 text-slate-700">
        <CloudOff className="h-4 w-4 text-slate-400" />
        {pending > 0
          ? `Ждут сети: ${pending} ${pending === 1 ? "ответ" : "ответов"}`
          : "Нет сети — ответы сохранятся на устройстве"}
      </span>
      {pending > 0 ? (
        <button
          type="button"
          onClick={() => void flush()}
          disabled={busy || !online}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          <RefreshCw className={"h-3.5 w-3.5 " + (busy ? "animate-spin" : "")} />
          Отправить
        </button>
      ) : null}
    </div>
  );
}
