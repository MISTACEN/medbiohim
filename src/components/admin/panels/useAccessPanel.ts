"use client";

/**
 * Управление доступом к разделам (Access Control, концепция §5): состояние и действия.
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
import type { AccessGroupOption, AccessScope, AccessUserOption } from "@/components/admin/panels/model";

export function useAccessPanel() {
  const [modules, setModules] = useState<AccessModule[]>([]);
  const [audit, setAudit] = useState<AccessAuditItem[]>([]);
  const [scope, setScope] = useState<AccessScope>("user");
  const [userOptions, setUserOptions] = useState<AccessUserOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<AccessGroupOption[]>([]);
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

  const loadGrants = useCallback(async (nextScope: AccessScope, nextTarget: string) => {
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

  return {
    modules, audit, scope, setScope,
    userOptions, groupOptions, userQuery, setUserQuery,
    targetId, setTargetId, grants, targetName,
    moduleKey, setModuleKey, mode, setMode,
    expiresAt, setExpiresAt, note, setNote,
    loading, busy, error, noteMsg,
    loadCore, saveGrant, revoke, toggleMode,
  };
}
