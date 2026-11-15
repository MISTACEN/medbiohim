"use client";

/**
 * Баннер резервного канала (C3 Layero-контура): основной API (/api/v1)
 * недоступен N запросов подряд — показываем ссылку на резервное зеркало.
 * Зеркало определяется динамически: другой домен из пары
 * vercel.app ↔ layero.app, ссылка ведёт на ТЕКУЩИЙ путь (пользователь
 * продолжает с того же места). NEXT_PUBLIC_FALLBACK_MIRROR_URL перекрывает.
 * События канала — mbh:api-channel-down/up из src/lib/api/client.ts.
 */
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

const KNOWN_MIRRORS = ["https://medbiohim.vercel.app", "https://medbiohim.layero.app"];

function dynamicMirror(): string {
  const env = process.env.NEXT_PUBLIC_FALLBACK_MIRROR_URL || "";
  if (env) return env;
  if (typeof window === "undefined") return "";
  const current = window.location.origin;
  if (!KNOWN_MIRRORS.includes(current)) return "";
  const other = KNOWN_MIRRORS.find((m) => m !== current) || "";
  return other ? other + window.location.pathname + window.location.search : "";
}

export function FallbackBanner() {
  const [visible, setVisible] = useState(false);
  const [mirror, setMirror] = useState("");

  useEffect(() => {
    const down = () => setMirror(dynamicMirror());
    const up = () => setVisible(false);
    window.addEventListener("mbh:api-channel-down", down);
    window.addEventListener("mbh:api-channel-up", up);
    return () => {
      window.removeEventListener("mbh:api-channel-down", down);
      window.removeEventListener("mbh:api-channel-up", up);
    };
  }, []);

  if (!visible || !mirror) return null;

  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-[var(--status-warn-bg)] px-4 py-2 text-center text-xs font-semibold text-[var(--status-warn-fg)]">
      <TriangleAlert className="h-4 w-4 shrink-0" />
      <span>
        Связь с этим доменом потеряна. Открыть эту же страницу на зеркале:{" "}
        <a href={mirror} className="underline">
          {mirror.replace(/^https?:\/\//, "")}
        </a>
      </span>
    </div>
  );
}
