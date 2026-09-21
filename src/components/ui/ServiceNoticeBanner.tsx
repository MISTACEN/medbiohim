"use client";

/**
 * Баннер аварийного режима: когда API отдал degraded / service_notice.
 * Пользователь должен видеть, что это сбой, а не «нормальные» данные.
 */
export function ServiceNoticeBanner({
  title,
  message,
  className = "",
}: {
  title?: string | null;
  message?: string | null;
  className?: string;
}) {
  if (!message) return null;
  return (
    <div
      role="status"
      className={`rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100 ${className}`}
    >
      <div className="font-bold">{title || "Что-то пошло не так"}</div>
      <p className="mt-1 leading-relaxed opacity-95">{message}</p>
    </div>
  );
}

/** true, если source — резервный/пустой, не основная БД */
export function isDegradedSource(source?: string | null): boolean {
  if (!source) return false;
  return source === "local_fallback" || source === "local" || source === "none" || source === "local_cache";
}
