import { NextRequest, NextResponse } from "next/server";

// Shared helpers for the cookie-based auth endpoints (RFC: docs/COOKIES-RFC-E1.md §3.2, §4.3).
// This file is colocated with the route handlers and is NOT a route itself.

export const ACCESS_COOKIE = "mb_at";
export const REFRESH_COOKIE = "mb_rt";
export const ACCESS_COOKIE_PATH = "/";
export const REFRESH_COOKIE_PATH = "/api/auth";
export const DEFAULT_ACCESS_TTL_SECONDS = 3600;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // ~30 дней
const MAX_TOKEN_LENGTH = 4096;

// Same env pattern as the /api/v1 proxy route.
export const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export function isNonEmptyToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TOKEN_LENGTH;
}

export function normalizeAccessTtl(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.min(Math.floor(value), 7 * 24 * 60 * 60);
  }
  return DEFAULT_ACCESS_TTL_SECONDS;
}

export function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

const COOKIE_OPTIONS_BASE = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
};

export function setAuthCookies(res: NextResponse, accessToken: string, refreshToken: string, accessTtl: number): NextResponse {
  res.cookies.set(ACCESS_COOKIE, accessToken, {
    ...COOKIE_OPTIONS_BASE,
    path: ACCESS_COOKIE_PATH,
    maxAge: accessTtl,
  });
  res.cookies.set(REFRESH_COOKIE, refreshToken, {
    ...COOKIE_OPTIONS_BASE,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TTL_SECONDS,
  });
  return res;
}

export function clearAuthCookies(res: NextResponse): NextResponse {
  res.cookies.set(ACCESS_COOKIE, "", { ...COOKIE_OPTIONS_BASE, path: ACCESS_COOKIE_PATH, maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { ...COOKIE_OPTIONS_BASE, path: REFRESH_COOKIE_PATH, maxAge: 0 });
  return res;
}

// CSRF defense-in-depth (RFC §4.3): SameSite=Lax already blocks cross-site POST
// cookies, but we additionally verify Sec-Fetch-Site and Origin host.
export function csrfRejected(req: NextRequest): boolean {
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin") return true;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(req.url).host) return true;
    } catch {
      return true;
    }
  }
  return false;
}
