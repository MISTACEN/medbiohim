"use client";

/**
 * Доступные пользователю разделы (Access Control).
 *
 * Один запрос на сессию; null = ответа нет (гость, ошибка сети) — навигация
 * тогда показывает всё (fail-open на клиенте). Реальную проверку делает
 * Worker: закрытый раздел не отдаст данные даже при прямом URL.
 */
import { useEffect, useState } from "react";
import { myModules } from "@/lib/api/access";
import { hasToken } from "@/lib/api";

export function useModuleAccess(enabled: boolean): {
  keys: Set<string> | null;
} {
  const [keys, setKeys] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!enabled || !hasToken()) return;
    let cancelled = false;
    void (async () => {
      const result = await myModules();
      if (cancelled) return;
      if (result.ok && Array.isArray(result.data?.items)) {
        setKeys(new Set(result.data.items.map((item) => item.key)));
      }
      // Ошибка → keys остаётся null: навигация не исчезает из-за сбоя.
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { keys };
}
