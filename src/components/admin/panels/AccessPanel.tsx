"use client";

/**
 * Управление доступом к разделам (Access Control, концепция §5): композиция.
 * Режимы разделов, выдача allow/deny со сроком, журнал действий.
 */
import { Lock } from "lucide-react";
import { hasToken } from "@/lib/api";
import { AccessAuditLog } from "@/components/admin/panels/AccessAuditLog";
import { AccessGrantForm } from "@/components/admin/panels/AccessGrantForm";
import { AccessModulesList } from "@/components/admin/panels/AccessModulesList";
import { useAccessPanel } from "@/components/admin/panels/useAccessPanel";

export function AccessPanel() {
  const panel = useAccessPanel();
  const {
    modules, audit, scope, setScope,
    userOptions, groupOptions, userQuery, setUserQuery,
    targetId, setTargetId, grants, targetName,
    moduleKey, setModuleKey, mode, setMode,
    expiresAt, setExpiresAt, note, setNote,
    loading, busy, error, noteMsg,
    loadCore, saveGrant, revoke, toggleMode,
  } = panel;

  if (!hasToken()) {
    return <div className="card p-6 text-sm">Войдите в аккаунт администратора.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Lock className="h-6 w-6 text-indigo-600" /> Доступы к разделам
        </h1>
        <p className="page-subtitle">
          Раздел открыт всем (open) или только выданным разрешениям (restricted). Запрет сильнее
          разрешения; все изменения видны в журнале ниже.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">
          {error}
        </div>
      )}
      {noteMsg && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">{noteMsg}</div>
      )}

      <AccessModulesList
        modules={modules}
        loading={loading}
        busy={busy}
        onToggle={(module) => void toggleMode(module)}
        onRefresh={() => void loadCore()}
      />

      <AccessGrantForm
        scope={scope}
        onScope={setScope}
        userQuery={userQuery}
        onUserQuery={setUserQuery}
        userOptions={userOptions}
        groupOptions={groupOptions}
        targetId={targetId}
        onTargetId={setTargetId}
        grants={grants}
        targetName={targetName}
        modules={modules}
        moduleKey={moduleKey}
        onModuleKey={setModuleKey}
        mode={mode}
        onMode={setMode}
        expiresAt={expiresAt}
        onExpiresAt={setExpiresAt}
        note={note}
        onNote={setNote}
        busy={busy}
        onSave={() => void saveGrant()}
        onRevoke={(id) => void revoke(id)}
      />

      <AccessAuditLog audit={audit} />
    </div>
  );
}
