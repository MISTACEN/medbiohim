"use client";

/**
 * Центр быстрого реагирования: композиция. Запросы старост, быстрые фиксы
 * с предпросмотром и откатом 24 часа, слияние дубликатов тем и уведомления.
 */
import Link from "next/link";
import { ModerationFixForm } from "@/components/admin/panels/ModerationFixForm";
import { ModerationFixLog } from "@/components/admin/panels/ModerationFixLog";
import { ModerationMergeTopics } from "@/components/admin/panels/ModerationMergeTopics";
import { ModerationNotifications } from "@/components/admin/panels/ModerationNotifications";
import { ModerationRequests } from "@/components/admin/panels/ModerationRequests";
import { useModerationPanel } from "@/components/admin/panels/useModerationPanel";

export function ModerationPanel() {
  const panel = useModerationPanel();
  const {
    isAdmin, capabilities,
    requests, actions, notifications, notes, setNotes,
    loading, busy, note, error,
    target, setTarget, targetId, setTargetId,
    patch, setPatch, reason, setReason,
    preview, merge, setMerge,
    resetFix, runPreview, applyFix,
    revert, reviewRequest, mergeTopics, markRead,
  } = panel;

  if (!capabilities?.can?.moderate) {
    return <div className="card p-8 text-center text-sm text-slate-600">Раздел доступен модераторам и администраторам.</div>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Роли и быстрые фиксы</h1>
          <p className="page-subtitle">Запросы старост, предпросмотр изменений и откат в течение 24 часов</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/workshop" className="font-semibold text-indigo-600">Модерация мастерской →</Link>
          <Link href="/admin/audit" className="font-semibold text-indigo-600">Аудит →</Link>
        </div>
      </header>

      {note && <div className="rounded-xl bg-[var(--status-ok-bg)] p-3 text-sm text-[var(--status-ok-fg)]">{note}</div>}
      {error && <div className="rounded-xl bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">{error}</div>}

      <ModerationFixForm
        target={target}
        onTarget={(value) => { setTarget(value); resetFix(); }}
        targetId={targetId}
        onTargetId={setTargetId}
        patch={patch}
        onPatch={setPatch}
        reason={reason}
        onReason={setReason}
        preview={preview}
        busy={busy}
        onPreview={() => void runPreview()}
        onApply={() => void applyFix()}
      />

      <ModerationMergeTopics
        merge={merge}
        onMerge={setMerge}
        busy={busy}
        onCheck={() => void mergeTopics(true)}
        onApply={() => void mergeTopics(false)}
      />

      {isAdmin && (
        <ModerationRequests
          requests={requests}
          notes={notes}
          onNote={(requestId, value) => setNotes((current) => ({ ...current, [requestId]: value }))}
          busy={busy}
          onReview={(requestId, approve) => void reviewRequest(requestId, approve)}
        />
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <ModerationFixLog
          actions={actions}
          loading={loading}
          busy={busy}
          onRevert={(id) => void revert(id)}
        />

        <ModerationNotifications
          notifications={notifications}
          onMarkRead={() => void markRead()}
        />
      </div>
    </div>
  );
}
