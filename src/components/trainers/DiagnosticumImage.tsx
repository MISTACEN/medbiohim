"use client";

/**
 * Изображение микропрепарата в задании: снимок или честная заглушка.
 * Вынесено из `DiagnosticumRunner` ради бюджета строк.
 */
export function DiagnosticumImage({ url, busy }: { url: string | null; busy: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-slate-50">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Микропрепарат для диагностики"
          className="max-h-[420px] w-full object-contain"
        />
      ) : (
        <div className="flex h-64 items-center justify-center text-sm text-slate-400">
          {busy ? "Загрузка изображения…" : "Изображение недоступно"}
        </div>
      )}
    </div>
  );
}
