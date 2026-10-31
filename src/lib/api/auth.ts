/**
 * Аутентификация и сессия через same-origin API (TECH-AUDIT-PLAN-2026-10-27 §6, D5).
 * Псевдонимы токенов сохранены, чтобы поверхность `@/lib/api` не изменилась.
 */
import { api } from "./client";
import {
  clearSessionTokens,
  hasAccessToken,
  hasRefreshToken,
  refreshSessionResult,
  setSessionTokens,
} from "@/lib/auth/session";
import { endpoints } from "../endpoints";

export const setTokens = setSessionTokens;
export const clearTokens = clearSessionTokens;
export const hasToken = hasAccessToken;
export { hasRefreshToken };
export const refreshSession = refreshSessionResult;

/**
 * Выход (RFC docs/COOKIES-RFC-E1.md §3.3): серверный logout ревокает
 * refresh-токен у Supabase и очищает HttpOnly куки; клиент дополнительно
 * чистит in-memory токен и legacy-ключи localStorage (clearTokens).
 */
export function logoutSession(): void {
  if (typeof window === "undefined") return;
  try {
    void fetch(endpoints.auth.logoutCookie(), {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: "{}",
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export async function login(email: string, password: string) { return api<any>(endpoints.auth.login(), { method: "POST", body: JSON.stringify({ email, password }) }); }
/** Silent Telegram Mini App login: the Worker verifies initData and issues a session. */
export async function telegramWebAppLogin(initData: string) { return api<any>(endpoints.auth.telegramWebApp(), { method: "POST", body: JSON.stringify({ init_data: initData }) }); }
/** Public data the Login Widget needs (bot username) — GET /auth/telegram/config. */
export async function telegramWidgetConfig() { return api<any>(endpoints.auth.telegramWidgetConfig()); }
/** Website "Sign in with Telegram": POST the widget's signed callback payload. */
export async function telegramWidgetLogin(payload: Record<string, unknown>) { return api<any>(endpoints.auth.telegramWidgetLogin(), { method: "POST", body: JSON.stringify(payload) }); }
export async function recoverPassword(email: string) { return api<any>(endpoints.auth.recover(), { method: "POST", body: JSON.stringify({ email }) }); }
export async function me() { return api<any>(endpoints.auth.me()); }
export async function register(email: string, password: string, fullName: string): Promise<any> { return api(endpoints.auth.register(), { method: "POST", body: JSON.stringify({ email, password, full_name: fullName }) }) as any; }
