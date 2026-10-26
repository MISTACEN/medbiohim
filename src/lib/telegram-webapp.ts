/**
 * Minimal Telegram Web App bridge for the MEDBIOHIM frontend.
 *
 * The Telegram script (telegram-web-app.js) is only present when the page runs
 * inside a Mini App, so every accessor is defensive: outside Telegram the app
 * behaves exactly like a normal browser.
 */

export type TelegramWebAppUser = {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
  photo_url?: string;
};

export type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
    auth_date?: number;
    hash?: string;
    query_id?: string;
  };
  version?: string;
  platform?: string;
  ready?: () => void;
  expand?: () => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

/** The Web App object, or null when the page is not inside Telegram. */
export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const webApp = window.Telegram?.WebApp;
  return webApp && typeof webApp === "object" ? webApp : null;
}

/** True only when the Telegram Web App bridge is actually available. */
export function isTelegramWebApp(): boolean {
  return getTelegramWebApp() !== null;
}

/**
 * The raw `initData` string to verify server-side. Empty string means "not in
 * Telegram" or "no signed payload", and callers must then do nothing.
 */
export function getTelegramInitData(): string {
  const initData = getTelegramWebApp()?.initData;
  return typeof initData === "string" && initData.trim() ? initData.trim() : "";
}

/** Untrusted user payload, for UI hints only — never for auth decisions. */
export function getTelegramWebAppUser(): TelegramWebAppUser | null {
  const user = getTelegramWebApp()?.initDataUnsafe?.user;
  return user && typeof user === "object" ? user : null;
}
