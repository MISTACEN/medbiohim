"use client";

/** Доступы к разделам: выдача доступа и действующие разрешения адресата. */
import { Plus, Trash2 } from "lucide-react";
import type { AccessGrant, AccessModule } from "@/lib/api/access";
import type { AccessGroupOption, AccessScope, AccessUserOption } from "@/components/admin/panels/model";

export function AccessGrantForm({
  scope,
  onScope,
  userQuery,
  onUserQuery,
  userOptions,
  groupOptions,
  targetId,
  onTargetId,
  grants,
  targetName,
  modules,
  moduleKey,
  onModuleKey,
  mode,
  onMode,
  expiresAt,
  onExpiresAt,
  note,
  onNote,
  busy,
  onSave,
  onRevoke,
}: {
  scope: AccessScope;
  onScope: (value: AccessScope) => void;
  userQuery: string;
  onUserQuery: (value: string) => void;
  userOptions: AccessUserOption[];
  groupOptions: AccessGroupOption[];
  targetId: string;
  onTargetId: (value: string) => void;
  grants: AccessGrant[];
  targetName: string | null;
  modules: AccessModule[];
  moduleKey: string;
  onModuleKey: (value: string) => void;
  mode: "allow" | "deny";
  onMode: (value: "allow" | "deny") => void;
  expiresAt: string;
  onExpiresAt: (value: string) => void;
  note: string;
  onNote: (value: string) => void;
  busy: string;
  onSave: () => void;
  onRevoke: (id: string) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Выдача доступа</h2>
      <div className="card space-y-3 p-4">
        <div className="flex gap-2">
          {(["user", "group"] as AccessScope[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onScope(value)}
              className={
                "rounded-xl px-4 py-2 text-sm font-semibold " +
                (scope === value ? "btn-primary" : "rounded-xl border")
              }
            >
              {value === "user" ? "Пользователю" : "Группе"}
            </button>
          ))}
        </div>

        {scope === "user" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={userQuery}
              onChange={(e) => onUserQuery(e.target.value)}
              className="rounded-xl border p-2 text-sm"
              placeholder="Поиск: ФИО или email…"
            />
            <select
              value={targetId}
              onChange={(e) => onTargetId(e.target.value)}
              className="rounded-xl border p-2 text-sm"
            >
              <option value="">— выберите пользователя —</option>
              {userOptions.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <select
            value={targetId}
            onChange={(e) => onTargetId(e.target.value)}
            className="w-full rounded-xl border p-2 text-sm"
          >
            <option value="">— выберите группу —</option>
            {groupOptions.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name || group.code || group.id}
              </option>
            ))}
          </select>
        )}

        {targetId && (
          <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
            <div className="text-sm font-semibold">
              {targetName || "Адресат"} — действующие разрешения
            </div>
            {grants.length === 0 ? (
              <div className="text-sm text-[var(--muted)]">Разрешений нет.</div>
            ) : (
              <ul className="space-y-1">
                {grants.map((grant) => (
                  <li key={grant.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      <b>{grant.module_title || grant.module_key}</b>
                      <span
                        className={
                          "ml-2 rounded-full px-2 py-0.5 text-xs font-bold " +
                          (grant.mode === "allow"
                            ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]"
                            : "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]")
                        }
                      >
                        {grant.mode === "allow" ? "доступ" : "запрет"}
                      </span>
                      {grant.expires_at && (
                        <span className="ml-2 text-xs text-[var(--muted)]">
                          до {new Date(grant.expires_at).toLocaleDateString("ru-RU")}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      disabled={busy === "revoke-" + grant.id}
                      onClick={() => onRevoke(grant.id)}
                      className="rounded-lg border border-[var(--status-critical-border)] px-2 py-1 text-xs font-semibold text-[var(--status-critical-fg)] disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-4">
          <select value={moduleKey} onChange={(e) => onModuleKey(e.target.value)} className="rounded-xl border p-2 text-sm">
            {modules.filter((m) => m.is_active).map((module) => (
              <option key={module.key} value={module.key}>{module.title}</option>
            ))}
          </select>
          <select value={mode} onChange={(e) => onMode(e.target.value as "allow" | "deny")} className="rounded-xl border p-2 text-sm">
            <option value="allow">Разрешить</option>
            <option value="deny">Запретить</option>
          </select>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => onExpiresAt(e.target.value)}
            className="rounded-xl border p-2 text-sm"
            title="Срок действия (необязательно)"
          />
          <input
            value={note}
            onChange={(e) => onNote(e.target.value)}
            className="rounded-xl border p-2 text-sm"
            placeholder="Комментарий (необязательно)"
          />
        </div>
        <button type="button" disabled={busy === "grant"} onClick={onSave} className="btn-primary inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> {busy === "grant" ? "Сохраняю…" : "Выдать разрешение"}
        </button>
      </div>
    </section>
  );
}
