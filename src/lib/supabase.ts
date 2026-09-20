/**
 * Browser-side Supabase Auth helpers (OAuth + magic link).
 * Uses anon key only - never service_role.
 */

const SUPABASE_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://gnobvyjywtqbdfeejxmf.supabase.co"
).replace(/\/$/, "");

const SUPABASE_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdub2J2eWp5d3RxYmRmZWVqeG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MzgxMjIsImV4cCI6MjEwNDAxNDEyMn0.kVPf6gZ_7GGNt1nDvbev4RJM0iMQ9rBWBV_5xXWRUTg";

export function getSupabaseUrl() {
  return SUPABASE_URL;
}

/** Redirect browser to Google OAuth via Supabase. */
export function startGoogleOAuth(redirectTo?: string) {
  if (typeof window === "undefined") return;
  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || window.location.origin;
  const redirect = redirectTo || `${appOrigin}/auth/callback`;
  const url =
    `${SUPABASE_URL}/auth/v1/authorize` +
    `?provider=google` +
    `&redirect_to=${encodeURIComponent(redirect)}`;
  window.location.href = url;
}

export function parseOAuthTokensFromUrl(href: string): {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
} {
  try {
    const u = new URL(href);
    const hash = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
    const params = new URLSearchParams(hash || u.search);
    return {
      access_token: params.get("access_token") || undefined,
      refresh_token: params.get("refresh_token") || undefined,
      error: params.get("error") || undefined,
      error_description: params.get("error_description") || undefined,
    };
  } catch {
    return { error: "parse_failed" };
  }
}

export { SUPABASE_URL, SUPABASE_ANON };

/** Optional Telegram bot deep-link for one-tap login. */
export function getTelegramBotUrl(): string | null {
  const u = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL?.trim();
  return u || null;
}

/** Start VK OAuth via Supabase (requires VK provider enabled in dashboard). */
export function startVkOAuth(redirectTo?: string) {
  if (typeof window === "undefined") return;
  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || window.location.origin;
  const redirect = redirectTo || `${appOrigin}/auth/callback`;
  const url =
    `${SUPABASE_URL}/auth/v1/authorize` +
    `?provider=vk` +
    `&redirect_to=${encodeURIComponent(redirect)}`;
  window.location.href = url;
}

/** Send passwordless magic link to email via Supabase OTP. */
export async function startMagicLink(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const redirectTo = `${appOrigin}/auth/callback`;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({
        email,
        create_user: true,
        data: {},
        gotrue_meta_security: {},
        options: { emailRedirectTo: redirectTo },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.msg || body?.error_description || body?.error || `HTTP ${res.status}`;
      return { ok: false, error: String(msg) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}
