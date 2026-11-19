"use client";

import { LogOut, MonitorSmartphone, RefreshCw } from "lucide-react";
import { describeLastSeen, describeUserAgent } from "@/lib/device";
import type { ActiveSession } from "@/lib/settings-api";

type ActiveDevicesProps = {
  sessions: ActiveSession[] | null;
  error: string | null;
  busy: string | null;
  onRetry: () => void;
  onRevoke: (sessionId: string) => void;
  onRevokeOthers: () => void;
};

/**
 * Активные устройства аккаунта (SA4).
 *
 * Компонент только отображает состояние и вызывает переданные обработчики:
 * загрузка, ошибки и завершение сессий остаются в page, чтобы не менять
 * поведение при переносе.
 */
export function ActiveDevices({
  sessions,
  error,
  busy,
  onRetry,
  onRevoke,
  onRevokeOthers,
}: ActiveDevicesProps) {
  return (
    <section className="card space-y-4 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <MonitorSmartphone className="h-5 w-5" /> Активные устройства
      </h2>
      <p className="text-sm text-[var(--muted)]">
        Где сейчас выполнен вход в аккаунт. Завершение устройства сбрасывает его сессию: на нём потребуется войти заново.
      </p>
      {error ? (
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">
          {error}{" "}
          <button type="button" onClick={onRetry} className="font-semibold underline">
            Повторить
          </button>
        </div>
      ) : sessions === null ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <RefreshCw className="h-4 w-4 animate-spin" /> Загрузка устройств…
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Список устройств пуст.</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => {
            const device = describeUserAgent(session.user_agent);
            return (
              <li
                key={session.session_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    {device.label}
                    {session.is_current ? (
                      <span className="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--primary)]">
                        это устройство
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    Вход: {describeLastSeen(session.created_at)} · Активность: {describeLastSeen(session.last_used_at)}
                    {session.ip_hint ? ` · ${session.ip_hint}` : ""}
                  </div>
                </div>
                {session.is_current ? (
                  <span className="text-xs text-[var(--muted)]">Выход — кнопкой «Выйти» в меню</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRevoke(session.session_id)}
                    disabled={busy === session.session_id}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                  >
                    {busy === session.session_id ? "Завершаем…" : "Завершить"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={onRevokeOthers}
        disabled={busy === "others" || (sessions?.length ?? 0) < 2}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" /> {busy === "others" ? "Завершаем…" : "Выйти на всех других устройствах"}
      </button>
    </section>
  );
}
