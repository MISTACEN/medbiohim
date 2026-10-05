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
import { clearTokens, hasToken, me, refreshSession } from "@/lib/api";

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
  groups: Array<{ id: string; name: string; code?: string; course_number?: number }>;
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
        groups?: Array<{ id: string; name: string; code?: string; course_number?: number }>;
        course?: number | null;
        semester?: number | null;
        current_group?: { id: string; name: string; code?: string; course_number?: number } | null;
      };
      const u = data.user || {};
      const roles = data.roles || [];
      const groups = data.groups || [];
      const primary = data.current_group || groups[0];
      setUser({
        id: String(u.id || ""),
        name: String(u.full_name || u.name || u.email || "Пользователь"),
        email: String(u.email || ""),
        role: roles[0] || "student",
        roles,
        groupId: primary?.id,
        groupName: primary?.name || primary?.code,
        groupCode: primary?.code,
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
