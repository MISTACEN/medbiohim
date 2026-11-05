/**
 * Чистые правила доступа к разделам (Access Control) — без внешних импортов,
 * чтобы контракт проверялся node-тестами напрямую (test/module-access.test.js).
 *
 * Приоритет: deny > allow, индивидуальное > групповое; при отсутствии явных
 * разрешений действует default_mode раздела (open — всем, restricted — никому).
 */

export type ModuleMode = "open" | "restricted";
export type GrantMode = "allow" | "deny";

export type ModuleRow = {
  key: string;
  title: string;
  sort_order: number;
  default_mode: ModuleMode;
  is_active: boolean;
};

export type GrantRow = {
  id: string;
  module_key: string;
  mode: GrantMode;
  expires_at: string | null;
};

export type EffectiveAccess = {
  allowed: Set<string>;
  /** Ключи разделов, доступ к которым выдан явно (а не режимом по умолчанию). */
  granted: Set<string>;
  /** Разделы, закрытые явным запретом, — для отладки и журнала. */
  denied: Set<string>;
  resolved: boolean;
};

export const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

export function isExpired(row: { expires_at?: unknown }): boolean {
  const value = row.expires_at;
  if (!value) return false;
  const time = Date.parse(String(value));
  return Number.isFinite(time) && time <= Date.now();
}

/** Сливает список разрешений на один раздел: deny сильнее allow, просроченное не учитывается. */
export function pickGrantMode(rows: GrantRow[]): GrantMode | null {
  let deny = false;
  let allow = false;
  for (const row of rows) {
    if (isExpired(row)) continue;
    if (row.mode === "deny") deny = true;
    else if (row.mode === "allow") allow = true;
  }
  if (deny) return "deny";
  if (allow) return "allow";
  return null;
}

/** Чистая функция разрешения: используется тестами и gate-промежуточным слоем. */
export function resolveAccess(
  modules: ModuleRow[],
  userGrants: Record<string, GrantRow[]>,
  groupGrants: Record<string, GrantRow[]>,
): EffectiveAccess {
  const allowed = new Set<string>();
  const granted = new Set<string>();
  const denied = new Set<string>();
  for (const mod of modules) {
    if (!mod.is_active) continue;
    const userMode = pickGrantMode(userGrants[mod.key] || []);
    if (userMode === "deny") {
      denied.add(mod.key);
      continue;
    }
    if (userMode === "allow") {
      allowed.add(mod.key);
      granted.add(mod.key);
      continue;
    }
    const groupMode = pickGrantMode(groupGrants[mod.key] || []);
    if (groupMode === "deny") {
      denied.add(mod.key);
      continue;
    }
    if (groupMode === "allow") {
      allowed.add(mod.key);
      granted.add(mod.key);
      continue;
    }
    if (mod.default_mode === "open") allowed.add(mod.key);
  }
  return { allowed, granted, denied, resolved: true };
}

