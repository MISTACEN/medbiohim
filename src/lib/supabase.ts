/**
 * Browser-side Supabase Auth helpers (OAuth / session from URL).
 * Uses anon key only — never service_role.
 */

const SUPABASE_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://gnobvyjywtqbdfeejxmf.supabase.co"
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
  const redirect = redirectTo || `${window.location.origin}/auth/callback`;
  const url =
    `${SUPABASE_URL}/auth/v1/authorize` +
    `?provider=google` +
    `&redirect_to=${encodeURIComponent(redirect)}`;
  window.location.href = url;
}

/** Parse access/refresh tokens from OAuth callback hash or query. */
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
