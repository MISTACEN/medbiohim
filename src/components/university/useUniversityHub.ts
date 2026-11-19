"use client";

/** Хаб университета: загрузка публичных данных ФЕСМУ и производные блоки. */
import { useCallback, useEffect, useState } from "react";
import type { UniversityOverview } from "@/components/university/types";

export function useUniversityHub() {
  const [overview, setOverview] = useState<UniversityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/university", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as UniversityOverview | null;
      if (!data) throw new Error(`HTTP ${response.status}`);
      // §2: `ok:true` with per-section errors; `ok:false` only when nothing at all was produced.
      if (data.ok === false && !data.feeds && !data.schedule) throw new Error(data.error || `HTTP ${response.status}`);
      setOverview(data);
      if (data.ok === false) setError(data.error || "Публичные данные ФЕСМУ временно недоступны");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить данные ФЕСМУ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const schedule = overview?.schedule;
  const portal = overview?.portal;

  return { overview, loading, error, loadOverview, schedule, portal };
}

export type UniversityHubState = ReturnType<typeof useUniversityHub>;
