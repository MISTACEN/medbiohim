/**
 * Аутентификация и сессия через same-origin API (TECH-AUDIT-PLAN-2026-10-27 §6, D5).
 * Псевдонимы токенов сохранены, чтобы поверхность `@/lib/api` не изменилась.
 */
import { api, API_URL } from "./client";
import {
  clearSessionTokens,
  getAccessToken,
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

export function logoutSession(): void {
  const t = getAccessToken();
  if (!t || typeof window === "undefined") return;
  try {
    void fetch(`${API_URL}${endpoints.auth.logout()}`, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "Authorization": `Bearer ${t}` },
      body: "{}",
      cache: "no-store",
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export async function login(email: string, password: string) { return api<any>(endpoints.auth.login(), { method: "POST", body: JSON.stringify({ email, password }) }); }
/** Silent Telegram Mini App login: the Worker verifies initData and issues a session. */
export async function telegramWebAppLogin(initData: string) { return api<any>(endpoints.auth.telegramWebApp(), { method: "POST", body: JSON.stringify({ init_data: initData }) }); }
export async function recoverPassword(email: string) { return api<any>(endpoints.auth.recover(), { method: "POST", body: JSON.stringify({ email }) }); }
export async function me() { return api<any>(endpoints.auth.me()); }
export async function register(email: string, password: string, fullName: string): Promise<any> { return api(endpoints.auth.register(), { method: "POST", body: JSON.stringify({ email, password, full_name: fullName }) }) as any; }
