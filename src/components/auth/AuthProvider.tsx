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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SESSION_EXPIRED_EVENT } from "@/lib/auth/session";
import { isTemporaryAuthFailure } from "@/lib/retry";
import { clearTokens, hasRefreshToken, hasToken, logoutSession, me, refreshSession, setTokens, telegramWebAppLogin } from "@/lib/api";
import { getTelegramInitData } from "@/lib/telegram-webapp";

/**
 * A Telegram Mini App is opened many times a day; the silent login must be
 * attempted at most once per page load, never in a retry loop.
 */
let telegramLoginAttempted = false;

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
  const [telegramNotice, setTelegramNotice] = useState(false);
  const router = useRouter();

  /**
   * The session module clears the tokens only when the refresh token was explicitly
   * rejected. Temporary API outages never reach here, so this is a real sign-out, and
   * the user returns to the page they were on after signing in again.
   */
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      if (typeof window === "undefined") return;
      if (window.location.pathname.startsWith("/login")) return;
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [router]);

  const refresh = useCallback(async () => {
    if (!hasToken()) {
      let refreshed = await refreshSession();
      if (!refreshed.ok && isTemporaryAuthFailure(refreshed.error.code)) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        refreshed = await refreshSession();
      }
      if (!refreshed.ok) {
        setUser(null);
        setLoading(false);
        return;
      }
    }
    try {
      let res = await me();
      if (!res.ok && isTemporaryAuthFailure(res.error.code)) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        res = await me();
      }
      if (!res.ok) {
        // A service/database outage must not turn into an accidental logout.
        // Invalid refresh tokens are cleared by the API client; an access-only
        // invalid session cannot be recovered and should be removed here.
        if (res.error.code === "UNAUTHORIZED" && !hasRefreshToken()) clearTokens();
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
      // Keep the stored credentials when profile loading fails unexpectedly.
      // A later navigation/reload can recover after the API comes back.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Silent Telegram Mini App login, then the regular profile load.
   * Any failure is swallowed: a browser user must never be blocked or alarmed.
   */
  const bootstrap = useCallback(async () => {
    const initData = getTelegramInitData();
    if (initData && !hasToken() && !telegramLoginAttempted) {
      telegramLoginAttempted = true;
      try {
        const result = await telegramWebAppLogin(initData);
        if (result.ok) {
          const data = result.data as { access_token?: string; refresh_token?: string } | null;
          if (data?.access_token) setTokens(data.access_token, data.refresh_token);
        } else if (result.error.code === "TELEGRAM_NOT_LINKED" || result.error.code === "TELEGRAM_NO_EMAIL") {
          // Soft notice only: the user can still browse and log in normally.
          setTelegramNotice(true);
        }
      } catch {
        // Stay silent and continue as a normal browser session.
      }
    }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const logout = useCallback(() => {
    logoutSession();
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, logout }),
    [user, loading, refresh, logout]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {telegramNotice ? (
        <div
          role="status"
          className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <div className="font-bold">Telegram не привязан</div>
          <p className="mt-1 leading-relaxed opacity-95">
            Привяжите аккаунт в{" "}
            <Link className="font-semibold underline" href="/settings">
              Настройках → Telegram
            </Link>
            , чтобы вход из Telegram выполнялся автоматически.
          </p>
          <button type="button" className="mt-2 text-xs font-semibold underline" onClick={() => setTelegramNotice(false)}>
            Скрыть
          </button>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
