"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { clearTokens, hasToken, logoutSession, me, refreshSession } from "@/lib/api";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  roles: string[];
  groupName?: string;
  course?: number;
  semester?: number;
  groupId?: string;
  groupCode?: string;
  groupRole?: "student" | "starosta";
  groups: Array<{ id: string; name: string; code?: string; course_number?: number; role_in_group?: "student" | "starosta" }>;
};

type AuthCtx = {
  user: AppUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!hasToken()) {
      const refreshed = await refreshSession();
      if (!refreshed.ok) {
        setUser(null);
        setLoading(false);
        return;
      }
    }
    try {
      const res = await me();
      if (!res.ok) {
        clearTokens();
        setUser(null);
        return;
      }
      const data = res.data as {
        user?: { id?: string; full_name?: string; email?: string; name?: string };
        roles?: string[];
        groups?: Array<{ id: string; name: string; code?: string; course_number?: number; role_in_group?: "student" | "starosta" }>;
        course?: number | null;
        semester?: number | null;
        current_group?: { id: string; name: string; code?: string; course_number?: number; role_in_group?: "student" | "starosta" } | null;
      };
      const u = data.user || {};
      const roles = Array.isArray(data.roles)
        ? [...new Set(data.roles.map((role) => String(role || "").trim().toLowerCase()).filter(Boolean))]
        : [];
      const groups = Array.isArray(data.groups) ? data.groups : [];
      const primary = data.current_group || groups[0];
      const primaryRole = roles.includes("admin")
        ? "admin"
        : roles.includes("moderator")
          ? "moderator"
          : roles[0] || "student";
      setUser({
        id: String(u.id || ""),
        name: String(u.full_name || u.name || u.email || "Пользователь"),
        email: String(u.email || ""),
        // A canonical privileged role must take precedence over student, regardless of array order.
        role: primaryRole,
        roles,
        groupId: primary?.id,
        groupName: primary?.name || primary?.code,
        groupCode: primary?.code,
        groupRole: primary?.role_in_group,
        course: data.course ?? primary?.course_number ?? undefined,
        semester: data.semester ?? undefined,
        groups,
      });
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    logoutSession();
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, logout }),
    [user, loading, refresh, logout]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
