"use client";

import { Link2, Unlink } from "lucide-react";

import type { TelegramLinkStatus } from "@/lib/settings-api";

/** Остаток ожидания привязки в формате мм:сс. */
function formatWait(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export type TelegramCardProps = {
  loading: boolean;
  busy: string | null;
  telegramStatus: TelegramLinkStatus | null;
  telegramStatusError: string | null;
  telegramWait: { url: string; expiresAt: number } | null;
  clock: number;
  onStart: () => void;
  onUnlink: () => void;
  onCancelWait: () => void;
  onCheckStatus: () => void;
};

/** Привязка Telegram к аккаунту: ссылка на бота, ожидание и отвязка. */
export function TelegramCard({
  loading,
  busy,
  telegramStatus,
  telegramStatusError,
  telegramWait,
  clock,
  onStart,
  onUnlink,
  onCancelWait,
  onCheckStatus,
}: TelegramCardProps) {
  return (
    <section className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Link2 className="h-5 w-5" /> Telegram</h2>
      <p className="text-sm text-[var(--muted)]">Свяжите Telegram с текущим аккаунтом MEDBIOHIM. Ссылка одноразовая и действует 10 минут; пароль и токены бот не запрашивает.</p>
      {telegramStatus?.linked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-4 py-3 text-[var(--status-ok-fg)]">
          <div>
            <div className="font-semibold">✓ Telegram привязан</div>
            <div className="text-xs">{telegramStatus.account?.username ? "@" + telegramStatus.account.username : telegramStatus.account?.first_name || "Аккаунт Telegram"}</div>
          </div>
          <button type="button" disabled={!!busy} onClick={onUnlink} className="inline-flex items-center gap-1 rounded-lg border border-[var(--status-critical-border)] px-3 py-1.5 text-xs font-semibold text-[var(--status-critical-fg)] disabled:opacity-50">
            <Unlink className="h-3.5 w-3.5" /> Отвязать
          </button>
        </div>
      ) : telegramWait ? (
        <div className="space-y-2 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-indigo-950">
          <div className="font-semibold">Ждём подтверждение в Telegram</div>
          <p className="text-xs leading-5">
            Откройте <strong>@MEDBIOCHIM_bot</strong> кнопкой ниже и нажмите «Start». Ссылка одноразовая,
            осталось <strong className="tabular-nums">{clock ? formatWait(telegramWait.expiresAt - clock) : "10:00"}</strong>.
            После подтверждения статус обновится сам — перезагружать страницу не нужно.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={telegramWait.url} target="_blank" rel="noreferrer" className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold">
              Открыть бота
            </a>
            <button
              type="button"
              onClick={onCancelWait}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold"
            >
              Отменить ожидание
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!!busy} onClick={onStart} className="btn-primary disabled:opacity-60">
          {busy === "telegram-link" ? "Создаём ссылку…" : "Привязать через @MEDBIOCHIM_bot"}
        </button>
      )}
      {telegramStatusError && !telegramStatus?.linked && (
        <p role="alert" className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-3 py-2 text-xs text-[var(--status-warn-fg)]">
          Статус привязки временно недоступен: {telegramStatusError}. Это не значит, что Telegram отвязан.
        </p>
      )}
      <button
        type="button"
        disabled={loading}
        onClick={onCheckStatus}
        className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs"
      >
        Проверить статус привязки
      </button>
    </section>
  );
}
