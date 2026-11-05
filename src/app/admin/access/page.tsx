"use client";

/**
 * Управление доступом к разделам (Access Control, концепция §5).
 *
 * Администратор управляет:
 *  - режимом раздела по умолчанию: open (виден всем) / restricted (по выдаче);
 *  - индивидуальными и групповыми разрешениями allow/deny со сроком действия;
 *  - журналом выдачи и отзыва прав.
 *
 * Запрет сильнее разрешения; скрытие пункта меню — не защита: Worker отсекает
 * закрытые маршруты, RLS не отдаёт клиенту чужие правила.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, Plus, RefreshCw, Trash2, Unlock } from "lucide-react";
import { hasToken, api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { describeApiError } from "@/lib/errors";
import {
  accessAudit,
  accessGrants,
  adminAccessModules,
  grantAccess,
  revokeAccess,
  updateAccessModule,
  type AccessAuditItem,
  type AccessGrant,
  type AccessModule,
} from "@/lib/api/access";

type Scope = "user" | "group";
type UserOption = { id: string; name: string };
type GroupOption = { id: string; name: string | null; code: string | null };

export default function AdminAccessPage() {
  const [modules, setModules] = useState<AccessModule[]>([]);
  const [audit, setAudit] = useState<AccessAuditItem[]>([]);
  const [scope, setScope] = useState<Scope>("user");
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [targetId, setTargetId] = useState("");
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [targetName, setTargetName] = useState<string | null>(null);
  const [moduleKey, setModuleKey] = useState("");
  const [mode, setMode] = useState<"allow" | "deny">("allow");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [noteMsg, setNoteMsg] = useState("");

  const loadCore = useCallback(async () => {
    if (!hasToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const [modulesResult, auditResult] = await Promise.all([
      adminAccessModules(),
      accessAudit("limit=50"),
    ]);
    if (modulesResult.ok) {
      setModules(modulesResult.data.items);
      if (!moduleKey && modulesResult.data.items.length) {
        setModuleKey(modulesResult.data.items[0].key);
      }
    } else {
      setError(describeApiError(modulesResult.error));
    }
    if (auditResult.ok) setAudit(auditResult.data.items);
    setLoading(false);
    // moduleKey умышленно не в зависимостях: значение фиксируется один раз.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  // Варианты адресатов: группы сразу, пользователи — по мере поиска.
  useEffect(() => {
    if (!hasToken()) return;
    if (scope === "group") {
      void (async () => {
        const result: any = await api(endpoints.subjects.groups());
        if (result?.ok) {
          setGroupOptions(
            (result.data?.items || result.data?.groups || []).map((g: any) => ({
              id: String(g.id),
              name: g.name ?? null,
              code: g.code ?? null,
            })),
          );
        }
      })();
    }
  }, [scope]);

  useEffect(() => {
    if (scope !== "user") return;
    const handle = window.setTimeout(() => {
      void (async () => {
        const result: any = await api(endpoints.admin.users(userQuery ? `q=${encodeURIComponent(userQuery)}&limit=20` : "limit=20"));
        if (result?.ok) {
          setUserOptions(
            (result.data?.items || []).map((u: any) => ({
              id: String(u.id),
              name: String(u.display_name || u.full_name || u.email || u.id),
            })),
          );
        }
      })();
    }, 300);
    return () => window.clearTimeout(handle);
  }, [scope, userQuery]);

  const loadGrants = useCallback(async (nextScope: Scope, nextTarget: string) => {
    if (!nextTarget) {
      setGrants([]);
      setTargetName(null);
      return;
    }
    const result = await accessGrants(nextScope, nextTarget);
    if (result.ok) {
      setGrants(result.data.items);
      setTargetName(result.data.target_name);
    } else {
      setError(describeApiError(result.error));
    }
  }, []);

  useEffect(() => {
    setGrants([]);
    setTargetName(null);
    setTargetId("");
    if (scope === "user") setUserQuery("");
  }, [scope]);

  useEffect(() => {
    if (targetId) void loadGrants(scope, targetId);
  }, [targetId, scope, loadGrants]);

  async function saveGrant() {
    if (!targetId || !moduleKey) {
      setNoteMsg("Выберите адресата и раздел");
      return;
    }
    setBusy("grant");
    setNoteMsg("");
    const result = await grantAccess({
      scope,
      target_id: targetId,
      module_key: moduleKey,
      mode,
      expires_at: expiresAt || null,
      note: note || null,
    });
    setBusy("");
    if (result.ok) {
      setNoteMsg(mode === "allow" ? "Доступ выдан" : "Запрет установлен");
      setNote("");
      await loadGrants(scope, targetId);
      await loadCore();
    } else {
      setNoteMsg(describeApiError(result.error));
    }
  }

  async function revoke(id: string) {
    setBusy("revoke-" + id);
    const result = await revokeAccess(id, scope);
    setBusy("");
    if (result.ok) {
      setNoteMsg("Разрешение отозвано");
      await loadGrants(scope, targetId);
    } else {
      setNoteMsg(describeApiError(result.error));
    }
  }

  async function toggleMode(module: AccessModule) {
    setBusy("module-" + module.key);
    const next = module.default_mode === "open" ? "restricted" : "open";
    const result = await updateAccessModule(module.key, { default_mode: next });
    setBusy("");
    if (result.ok) setNoteMsg(`«${module.title}»: ${next === "open" ? "открыт всем" : "только по выдаче"}`);
    else setNoteMsg(describeApiError(result.error));
    await loadCore();
  }

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

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Разделы платформы</h2>
          <button type="button" onClick={() => void loadCore()} className="btn-secondary inline-flex items-center gap-1 text-sm">
            <RefreshCw className="h-4 w-4" /> Обновить
          </button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
          </div>
        ) : (
          <div className="card divide-y p-0">
            {modules.map((module) => (
              <div key={module.key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <span className="font-semibold">{module.title}</span>
                  <span className="ml-2 text-xs text-[var(--muted)]">{module.key}</span>
                  {!module.is_active && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">отключён</span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy === "module-" + module.key}
                  onClick={() => void toggleMode(module)}
                  className={
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 " +
                    (module.default_mode === "open"
                      ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]"
                      : "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]")
                  }
                  title={module.default_mode === "open" ? "Перевести в режим «по выдаче»" : "Открыть всем"}
                >
                  {module.default_mode === "open" ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  {module.default_mode === "open" ? "открыт всем" : "по выдаче"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Выдача доступа</h2>
        <div className="card space-y-3 p-4">
          <div className="flex gap-2">
            {(["user", "group"] as Scope[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setScope(value)}
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
                onChange={(e) => setUserQuery(e.target.value)}
                className="rounded-xl border p-2 text-sm"
                placeholder="Поиск: ФИО или email…"
              />
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
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
              onChange={(e) => setTargetId(e.target.value)}
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
                        onClick={() => void revoke(grant.id)}
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
            <select value={moduleKey} onChange={(e) => setModuleKey(e.target.value)} className="rounded-xl border p-2 text-sm">
              {modules.filter((m) => m.is_active).map((module) => (
                <option key={module.key} value={module.key}>{module.title}</option>
              ))}
            </select>
            <select value={mode} onChange={(e) => setMode(e.target.value as "allow" | "deny")} className="rounded-xl border p-2 text-sm">
              <option value="allow">Разрешить</option>
              <option value="deny">Запретить</option>
            </select>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="rounded-xl border p-2 text-sm"
              title="Срок действия (необязательно)"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-xl border p-2 text-sm"
              placeholder="Комментарий (необязательно)"
            />
          </div>
          <button type="button" disabled={busy === "grant"} onClick={() => void saveGrant()} className="btn-primary inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> {busy === "grant" ? "Сохраняю…" : "Выдать разрешение"}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Журнал доступа</h2>
        {audit.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--muted)]">Действий пока не было.</div>
        ) : (
          <div className="card divide-y p-0 text-sm">
            {audit.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  <b>{item.actor_name || "Админ"}</b>{" "}
                  {item.action === "grant" ? "выдал" : item.action === "revoke" ? "отозвал" : "изменил"}{" "}
                  {item.module_key ? <b>{item.module_key}</b> : null}
                  <span className="ml-1 text-[var(--muted)]">
                    ({item.scope}
                    {item.target ? ` · ${item.target.slice(0, 8)}…` : ""})
                  </span>
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {new Date(item.created_at).toLocaleString("ru-RU")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
