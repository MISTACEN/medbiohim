import { NextRequest, NextResponse } from "next/server";
import {
  csrfRejected,
  isNonEmptyToken,
  jsonError,
  normalizeAccessTtl,
  setAuthCookies,
} from "../_auth-cookies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/auth/session  { access_token, refresh_token, expires_in? }
// Stores tokens in HttpOnly cookies (RFC docs/COOKIES-RFC-E1.md §3.2).
export async function POST(req: NextRequest) {
  if (csrfRejected(req)) {
    return jsonError(403, "CSRF_REJECTED", "Запрос отклонён CSRF-проверкой");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(422, "INVALID_BODY", "Ожидается JSON с access_token и refresh_token");
  }
  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const accessToken = payload.access_token;
  const refreshToken = payload.refresh_token;
  if (!isNonEmptyToken(accessToken) || !isNonEmptyToken(refreshToken)) {
    return jsonError(422, "INVALID_BODY", "access_token и refresh_token обязательны: непустые строки длиной до 4096 символов");
  }

  const accessTtl = normalizeAccessTtl(payload.expires_in);
  const res = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  return setAuthCookies(res, accessToken, refreshToken, accessTtl);
}
