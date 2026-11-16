"use client";

/**
 * «Сейчас на сайте N» — один агрегат, без имён и списков.
 * Сердцебиение ставит наш ключ присутствия на 120 секунд, поэтому счётчик
 * честно показывает активных за последние две минуты. Redis недоступен —
 * виджет просто не рисуется.
 */
import { useEffect, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { getPresenceCount, presenceHeartbeat } from "@/lib/api/misc";

export function PresenceBadge() {
  const [count, setCount] = useState<number | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      await presenceHeartbeat();
      const response = await getPresenceCount();
      if (cancelled) return;
      if (response.ok && response.data?.available) {
        setAvailable(true);
        setCount(Number(response.data.count || 0));
      }
    }

    void tick();
    const timer = setInterval(() => void tick(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!available) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)]">
        <Loader2 className="h-3 w-3 animate-spin" /> присутствие…
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs font-semibold"
      title="Активные за последние 2 минуты"
    >
      <Users className="h-3.5 w-3.5 text-[var(--primary)]" />
      Сейчас учатся: {count ?? 0}
    </span>
  );
}
