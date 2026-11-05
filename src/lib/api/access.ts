/** Доступ к разделам (Access Control): навигация и админ-управление. */
import { api } from "./client";
import { endpoints } from "../endpoints";

export type AccessModule = {
  key: string;
  title: string;
  sort_order?: number;
  default_mode: "open" | "restricted";
  is_active: boolean;
};

export type MyModules = {
  items: Array<{ key: string; title: string }>;
  staff: boolean;
  resolved: boolean;
};

export type AccessGrant = {
  id: string;
  module_key: string;
  module_title?: string;
  mode: "allow" | "deny";
  expires_at: string | null;
  note?: string | null;
  created_at?: string;
};

export type AccessAuditItem = {
  id: number;
  action: string;
  scope: string;
  target: string | null;
  module_key: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  actor_name?: string | null;
};

/** Разделы, открытые текущему пользователю (для навигации). */
export function myModules() {
  return api<MyModules>(endpoints.access.myModules());
}

export function adminAccessModules() {
  return api<{ items: AccessModule[] }>(endpoints.access.adminModules());
}

export function updateAccessModule(
  key: string,
  patch: { default_mode?: "open" | "restricted"; is_active?: boolean },
) {
  return api<{ module: AccessModule }>(endpoints.access.adminModule(key), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function accessGrants(scope: "user" | "group", target: string) {
  return api<{
    scope: "user" | "group";
    target: string;
    target_name: string | null;
    items: AccessGrant[];
  }>(endpoints.access.adminGrants(`scope=${scope}&target=${encodeURIComponent(target)}`));
}

export function grantAccess(payload: {
  scope: "user" | "group";
  target_id: string;
  module_key: string;
  mode: "allow" | "deny";
  expires_at?: string | null;
  note?: string | null;
}) {
  return api<{ grant: AccessGrant }>(endpoints.access.adminGrants(), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function revokeAccess(id: string, scope: "user" | "group") {
  return api<{ removed: boolean; id: string }>(endpoints.access.adminGrant(id, scope), {
    method: "DELETE",
  });
}

export function accessAudit(query?: string) {
  return api<{ items: AccessAuditItem[] }>(endpoints.access.adminAudit(query));
}
