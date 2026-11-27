"use client";

/**
 * Сообщения диагностикума: ошибка и мягкое уведомление.
 *
 * Вынесено из `DiagnosticumRunner`, чтобы раннер укладывался в лимит строк.
 * Ошибка — красная, уведомление — предупреждающее: «часть выбранных карточек
 * не вошла в серию» это не сбой, а честная информация.
 */
export function DiagnosticumMessages({
  error,
  notice,
}: {
  error?: string | null;
  notice?: string | null;
}) {
  return (
    <>
      {error ? (
        <p className="rounded-xl bg-[var(--status-critical-bg)] px-3 py-2 text-sm text-[var(--status-critical-fg)]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl bg-[var(--status-warn-bg)] px-3 py-2 text-sm text-[var(--status-warn-fg)]">
          {notice}
        </p>
      ) : null}
    </>
  );
}
