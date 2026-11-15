"use client";

/**
 * Баннер резервного канала (C3 Layero-контура): основной API (/api/v1)
 * недоступен N запросов подряд — показываем ссылку на резервное зеркало.
 * URL приходит из NEXT_PUBLIC_FALLBACK_MIRROR_URL; без него баннер не рисуем,
 * чтобы не пугать ссылкой «в никуда». События канала — mbh:api-channel-down/up
 * из src/lib/api/client.ts.
 */
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

const MIRROR_URL = process.env.NEXT_PUBLIC_FALLBACK_MIRROR_URL || "";

export function FallbackBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!MIRROR_URL) return;
    const down = () => setVisible(true);
    const up = () => setVisible(false);
    window.addEventListener("mbh:api-channel-down", down);
    window.addEventListener("mbh:api-channel-up", up);
    return () => {
      window.removeEventListener("mbh:api-channel-down", down);
      window.removeEventListener("mbh:api-channel-up", up);
    };
  }, []);

  if (!visible || !MIRROR_URL) return null;

  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-[var(--status-warn-bg)] px-4 py-2 text-center text-xs font-semibold text-[var(--status-warn-fg)]">
      <TriangleAlert className="h-4 w-4 shrink-0" />
      <span>
        Основной канал недоступен. Резервное зеркало:{" "}
        <a href={MIRROR_URL} target="_blank" rel="noreferrer noopener" className="underline">
          {MIRROR_URL.replace(/^https?:\/\//, "")}
        </a>
      </span>
    </div>
  );
}
