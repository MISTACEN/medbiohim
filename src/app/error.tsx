"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Ошибка рендера внутри приложения. Показывает понятный текст и действие,
 * технические детали (digest) уходят только в консоль, без стека в UI.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] ошибка рендера", error.digest || "", error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="card text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold" style={{ color: "var(--text)" }}>
          Не удалось показать страницу
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          Данные не потеряны — попробуйте обновить раздел. Если ошибка повторяется, напишите
          в поддержку и укажите код ниже.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs tabular-nums" style={{ color: "var(--muted)" }}>
            Код обращения: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={reset} className="btn-primary inline-flex items-center gap-2">
            <RotateCcw className="h-4 w-4" /> Повторить
          </button>
          <Link href="/" className="btn-secondary inline-flex items-center">
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
