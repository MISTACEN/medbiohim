import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  clearAuthCookies,
  csrfRejected,
  isNonEmptyToken,
  jsonError,
} from "../_auth-cookies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/auth/logout — best-effort Supabase revoke via /auth/v1/logout with
// the Bearer access token from mb_at (when present), then clears both cookies
// unconditionally (RFC docs/COOKIES-RFC-E1.md §3.2).
export async function POST(req: NextRequest) {
  if (csrfRejected(req)) {
    return jsonError(403, "CSRF_REJECTED", "Запрос отклонён CSRF-проверкой");
  }

  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value || "";
  if (!isNonEmptyToken(refreshToken)) {
    return jsonError(422, "MISSING_COOKIE", "Кука mb_rt обязательна");
  }

  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value || "";
  if (accessToken && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const base = new URL(SUPABASE_URL);
      if (base.protocol === "https:") {
        await fetch(new URL("/auth/v1/logout", base), {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        });
      }
    } catch {
      // Revoke is best-effort; cookies are cleared regardless.
    }
  }

  return clearAuthCookies(new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } }));
}
