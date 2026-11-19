"use client";

/** Карточка «Удаление аккаунта»: статус запроса, grace-период и отмена. */
import { AlertTriangle, Clock, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatAccountDate } from "@/lib/features-api";
import type { DataAccountState } from "@/components/settings/useDataAccount";

export function DataDeletionCard({ page }: { page: DataAccountState }) {
  const {
    deletion, loading, loadError, busy, reason, setReason, reasonOpen, setReasonOpen,
    load, onRequestDeletion, onCancelDeletion, status, scheduled, executed,
  } = page;

  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]">
          <Trash2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Удаление аккаунта</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Удаление не выполняется сразу и не выполняется из интерфейса: сначала фиксируется запрос,
            затем действует grace-период, и только после его окончания аккаунт удаляет служебный процесс.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаем статус запроса…
        </div>
      ) : loadError ? (
        <ErrorState
          title="Не удалось загрузить статус удаления"
          message={loadError.message}
          requestId={loadError.requestId}
          retry={() => void load()}
          compact
        />
      ) : executed ? (
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">
          <div className="font-semibold">Аккаунт помечен как удалённый</div>
          <p className="mt-1">
            Запрос исполнен {formatAccountDate(deletion?.executed_at)}. Отменить его нельзя. Если это
            произошло по ошибке — напишите в поддержку.
          </p>
        </div>
      ) : scheduled ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-4 py-3 text-sm text-[var(--status-warn-fg)]">
            <div className="flex items-center gap-2 font-semibold">
              <Clock className="h-4 w-4" /> Удаление запланировано
            </div>
            <p className="mt-1">
              Дата исполнения: <b>{formatAccountDate(deletion?.scheduled_for)}</b>
              {typeof deletion?.days_left === "number"
                ? ` · осталось ${deletion.days_left} дн.`
                : ""}
            </p>
            <p className="mt-1">
              Запрос создан {formatAccountDate(deletion?.requested_at)}
              {deletion?.grace_days ? `, срок — ${deletion.grace_days} дн.` : ""}. До этой даты аккаунт
              работает как обычно.
            </p>
          </div>
          <p className="text-sm text-[var(--muted)]">{deletion?.message}</p>
          {deletion?.execution_configured === false && (
            <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical-fg)]">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" /> Автоматическое удаление не настроено
              </div>
              <p className="mt-1">
                Запрос сохранён, но на сервере нет служебного ключа, который удаляет аккаунты. Дата
                исполнения не наступит сама — напишите в поддержку, чтобы удаление выполнили вручную.
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => void onCancelDeletion()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-4 py-2 text-sm font-semibold text-[var(--status-ok-fg)] disabled:opacity-60"
          >
            {busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {busy === "cancel" ? "Отменяем…" : "Отменить удаление"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {status === "cancelled" && (
            <div className="rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-4 py-3 text-sm text-[var(--status-ok-fg)]">
              Предыдущий запрос отменён {formatAccountDate(deletion?.cancelled_at)}. Аккаунт активен.
            </div>
          )}
          <p className="text-sm text-[var(--muted)]">
            {deletion?.grace_days
              ? `После запроса аккаунт удаляется через ${deletion.grace_days} дн. Всё это время его можно отменить.`
              : "После запроса действует grace-период, в течение которого удаление можно отменить."}
          </p>

          {reasonOpen ? (
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Причина (необязательно)</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value.slice(0, 1000))}
                rows={3}
                maxLength={1000}
                placeholder="Поможет нам понять, что улучшить. Ни на что не влияет."
                className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none"
              />
              <span className="block text-xs text-[var(--muted)]">{reason.length} / 1000</span>
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setReasonOpen(true)}
              className="text-sm text-[var(--muted)] underline"
            >
              Добавить причину удаления
            </button>
          )}

          <button
            type="button"
            onClick={() => void onRequestDeletion()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--status-critical-fg)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--status-critical-fg)] disabled:opacity-60"
          >
            {busy === "request" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            {busy === "request" ? "Создаём запрос…" : "Запросить удаление аккаунта"}
          </button>
          <p className="text-xs text-[var(--muted)]">
            Перед удалением скачайте данные: после исполнения запроса восстановить их нельзя.
          </p>
        </div>
      )}
    </section>
  );
}
