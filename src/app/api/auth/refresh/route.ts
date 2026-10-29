import { NextRequest, NextResponse } from "next/server";
import {
  REFRESH_COOKIE,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  clearAuthCookies,
  csrfRejected,
  isNonEmptyToken,
  jsonError,
  normalizeAccessTtl,
  setAuthCookies,
} from "../_auth-cookies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RefreshOutcome =
  | { ok: true; accessToken: string; refreshToken: string; accessTtl: number }
  | { ok: false };

// Single-flight per instance (RFC §6): Supabase rotates the refresh token on
// every use, so concurrent refreshes with the same token would invalidate each
// other. Parallel requests sharing one refresh token await the same promise.
const inFlightRefreshes = new Map<string, Promise<RefreshOutcome>>();

function refreshWithSingleFlight(refreshToken: string): Promise<RefreshOutcome> {
  const existing = inFlightRefreshes.get(refreshToken);
  if (existing) return existing;
  const promise = performSupabaseRefresh(refreshToken).finally(() => {
    inFlightRefreshes.delete(refreshToken);
  });
  inFlightRefreshes.set(refreshToken, promise);
  return promise;
}

async function performSupabaseRefresh(refreshToken: string): Promise<RefreshOutcome> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { ok: false };
  try {
    const base = new URL(SUPABASE_URL);
    if (base.protocol !== "https:") return { ok: false };
    const url = new URL("/auth/v1/token", base);
    url.searchParams.set("grant_type", "refresh_token");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
    if (!isNonEmptyToken(data.access_token) || !isNonEmptyToken(data.refresh_token)) return { ok: false };
    return {
      ok: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTtl: normalizeAccessTtl(data.expires_in),
    };
  } catch {
    return { ok: false };
  }
}

// POST /api/auth/refresh — reads mb_rt, rotates both cookies atomically in one response.
export async function POST(req: NextRequest) {
  if (csrfRejected(req)) {
    return jsonError(403, "CSRF_REJECTED", "Запрос отклонён CSRF-проверкой");
  }

  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value || "";
  if (!isNonEmptyToken(refreshToken)) {
    return jsonError(422, "MISSING_COOKIE", "Кука mb_rt обязательна");
  }

  const outcome = await refreshWithSingleFlight(refreshToken);
  if (!outcome.ok) {
    return clearAuthCookies(new NextResponse(null, { status: 401, headers: { "Cache-Control": "no-store" } }));
  }

  const res = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  return setAuthCookies(res, outcome.accessToken, outcome.refreshToken, outcome.accessTtl);
}
