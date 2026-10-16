import { NextRequest, NextResponse } from "next/server";
import { shouldFallbackFromCloudflare } from "@/lib/api-failover.mjs";
import { protectTrainingPayload } from "@/lib/training-payload-sanitizer.mjs";

const DEFAULT_CLOUDFLARE_API_ORIGIN = "https://medbiohim-api.ryazansevegor.workers.dev/api/v1";
const CLOUDFLARE_UPSTREAM = (process.env.CLOUDFLARE_API_ORIGIN || DEFAULT_CLOUDFLARE_API_ORIGIN).trim().replace(/\/$/, "");
const SPACEWEB_ORIGIN = (process.env.SPACEWEB_API_ORIGIN || "").trim().replace(/\/$/, "");
const SAFE_SPACEWEB_ORIGIN = (() => {
  try {
    const u = new URL(SPACEWEB_ORIGIN);
    return u.protocol === "https:" ? u.toString().replace(/\/$/, "") : "";
  } catch {
    return "";
  }
})();
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearer(req: NextRequest) {
  const value = req.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function isCanonicalAdminRequest(req: NextRequest): Promise<boolean> {
  const token = bearer(req);
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const base = new URL(SUPABASE_URL);
    if (base.protocol !== "https:") return false;
    const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Accept: "application/json" };
    const auth = await fetch(new URL("/auth/v1/user", base), {
      method: "GET", headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3500),
    });
    if (!auth.ok) return false;
    const user = (await auth.json()) as { id?: unknown };
    if (typeof user?.id !== "string" || !user.id) return false;
    const rolesUrl = new URL("/rest/v1/user_roles", base);
    rolesUrl.searchParams.set("select", "roles(code)");
    rolesUrl.searchParams.set("user_id", `eq.${user.id}`);
    rolesUrl.searchParams.set("limit", "25");
    const rolesResponse = await fetch(rolesUrl, { method: "GET", headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3500) });
    if (!rolesResponse.ok) return false;
    const rows = await rolesResponse.json();
    return Array.isArray(rows) && rows.some((row: any) => {
      const related = Array.isArray(row?.roles) ? row.roles : row?.roles ? [row.roles] : [];
      return related.some((role: any) => String(role?.code || "").toLowerCase() === "admin");
    });
  } catch {
    return false;
  }
}

async function withTransportDiagnostics(req: NextRequest, response: Response, source: string): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.set("x-mbh-api-source", source);
  if (req.headers.get("x-mbh-transport-diagnostics") === "1" && await isCanonicalAdminRequest(req)) {
    headers.set("x-mbh-transport-source", source);
    headers.set("x-mbh-transport-fallback", source.includes("fallback") ? "true" : "false");
  }
  return new NextResponse(response.body, { status: response.status, statusText: response.statusText, headers });
}

function requestInit(req: NextRequest, bodyBuffer: ArrayBuffer | null, timeoutMs: number): RequestInit {
  const headers = new Headers();
  for (const h of ["content-type", "authorization", "accept", "x-request-id"]) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("accept")) headers.set("accept", "application/json");
  return {
    method: req.method,
    headers,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    ...(bodyBuffer && bodyBuffer.byteLength ? { body: bodyBuffer.slice(0) } : {}),
  };
}

async function fetchSpaceweb(req: NextRequest, sub: string, search: string, init: RequestInit): Promise<Response | null> {
  if (!SAFE_SPACEWEB_ORIGIN || !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) return null;
  const targets = [
    `${SAFE_SPACEWEB_ORIGIN}/${sub}${search}`,
    ...(SAFE_SPACEWEB_ORIGIN.endsWith("/api/v1")
      ? [`${SAFE_SPACEWEB_ORIGIN.slice(0, -"/api/v1".length)}/public/api/v1/${sub}${search}`]
      : []),
  ];
  for (let i = 0; i < targets.length; i += 1) {
    try {
      const response = await fetch(targets[i], { ...init, signal: AbortSignal.timeout(10000) });
      if (response.status !== 404 || i === targets.length - 1) return response;
    } catch {
      // Read-only fallback may safely try the alternate legacy route.
    }
  }
  return null;
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const sub = pathParts.join("/");
  const url = new URL(req.url);
  const safeRead = ["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase());
  let bodyBuffer: ArrayBuffer | null = null;
  if (!["GET", "HEAD"].includes(req.method.toUpperCase())) bodyBuffer = await req.arrayBuffer();
  const init = requestInit(req, bodyBuffer, 8000);

  let upstream: Response | null = null;
  let source = "cloudflare";
  if (CLOUDFLARE_UPSTREAM) {
    try {
      const response = await fetch(`${CLOUDFLARE_UPSTREAM}/${sub}${url.search}`, init);
      const fallbackNeeded = safeRead ? await shouldFallbackFromCloudflare(req, response) : false;
      if (fallbackNeeded && SAFE_SPACEWEB_ORIGIN) {
        const fallback = await fetchSpaceweb(req, sub, url.search, init);
        if (fallback) {
          upstream = fallback;
          source = "spaceweb-fallback";
        } else {
          upstream = response;
        }
      } else {
        upstream = response;
      }
    } catch {
      if (safeRead) {
        upstream = await fetchSpaceweb(req, sub, url.search, init);
        source = upstream ? "spaceweb-fallback" : "cloudflare-unavailable";
      } else {
        source = "cloudflare-unavailable";
      }
    }
  } else if (safeRead) {
    upstream = await fetchSpaceweb(req, sub, url.search, init);
    source = upstream ? "spaceweb-fallback" : "cloudflare-unavailable";
  }

  if (!upstream) {
    const failed = NextResponse.json({
      ok: false,
      error: { code: "UPSTREAM", message: "Cloudflare API недоступен; безопасный резервный маршрут не дал ответа" },
      requestId: "proxy",
    }, { status: 502 });
    return withTransportDiagnostics(req, failed, source);
  }

  let buf = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("content-type") || "";
  if (sub.startsWith("trainings") && contentType.includes("json")) {
    try {
      const payload = JSON.parse(new TextDecoder().decode(buf));
      const safePayload = protectTrainingPayload(payload, req.method.toUpperCase(), sub);
      buf = new TextEncoder().encode(JSON.stringify(safePayload)).buffer as ArrayBuffer;
    } catch {
      // Preserve non-JSON responses unchanged.
    }
  }

  const out = new NextResponse(buf, { status: upstream.status, statusText: upstream.statusText });
  for (const h of ["content-type", "location", "content-disposition", "cache-control", "etag", "last-modified", "x-request-id"]) {
    const value = upstream.headers.get(h);
    if (value) out.headers.set(h, value);
  }
  out.headers.set("x-medbiohim-proxy", source === "cloudflare" ? "cloudflare-primary" : "safe-read-fallback");
  return withTransportDiagnostics(req, out, source);
}

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(req: NextRequest, ctx: Ctx) { const { path } = await ctx.params; return proxy(req, path || []); }
export async function POST(req: NextRequest, ctx: Ctx) { const { path } = await ctx.params; return proxy(req, path || []); }
export async function PUT(req: NextRequest, ctx: Ctx) { const { path } = await ctx.params; return proxy(req, path || []); }
export async function PATCH(req: NextRequest, ctx: Ctx) { const { path } = await ctx.params; return proxy(req, path || []); }
export async function DELETE(req: NextRequest, ctx: Ctx) { const { path } = await ctx.params; return proxy(req, path || []); }
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: {
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id",
  }});
}
