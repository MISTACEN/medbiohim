import { NextRequest, NextResponse } from "next/server";
import { protectTrainingPayload } from "@/lib/training-payload-sanitizer.mjs";

/**
 * Same-origin /api/v1/* → Cloudflare Workers only.
 * SpaceWeb / legacy PHP is no longer used.
 */
const DEFAULT_CLOUDFLARE_API_ORIGIN = "https://medbiohim-api.ryazansevegor.workers.dev/api/v1";

function isHttpsOrigin(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function resolveCloudflareOrigin(): string {
  const raw = (process.env.CLOUDFLARE_API_ORIGIN || DEFAULT_CLOUDFLARE_API_ORIGIN).trim();
  if (!raw) return "";
  try {
    const origin = new URL(raw);
    if (origin.protocol !== "https:") return "";
    // Never use the old migration shadow worker as production target
    if (origin.hostname.startsWith("medbiohim-api-shadow.")) return "";
    const path = origin.pathname.replace(/\/$/, "");
    if (!path.endsWith("/api/v1")) return "";
    return raw.replace(/\/$/, "");
  } catch {
    return "";
  }
}

const CLOUDFLARE_UPSTREAM = resolveCloudflareOrigin();

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
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    const auth = await fetch(new URL("/auth/v1/user", base), {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(3500),
    });
    if (!auth.ok) return false;
    const user = (await auth.json()) as { id?: unknown };
    if (typeof user?.id !== "string" || !user.id) return false;

    const rolesUrl = new URL("/rest/v1/user_roles", base);
    rolesUrl.searchParams.set("select", "roles(code)");
    rolesUrl.searchParams.set("user_id", `eq.${user.id}`);
    rolesUrl.searchParams.set("limit", "25");
    const rolesResponse = await fetch(rolesUrl, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(3500),
    });
    if (!rolesResponse.ok) return false;
    const rows = await rolesResponse.json();
    if (!Array.isArray(rows)) return false;
    return rows.some((row: any) => {
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
  if (req.headers.get("x-mbh-transport-diagnostics") === "1" && (await isCanonicalAdminRequest(req))) {
    headers.set("x-mbh-transport-source", source);
    headers.set("x-mbh-transport-fallback", "false");
  }
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const sub = pathParts.join("/");
  const url = new URL(req.url);

  if (!CLOUDFLARE_UPSTREAM || !isHttpsOrigin(CLOUDFLARE_UPSTREAM)) {
    const unavailable = NextResponse.json(
      {
        ok: false,
        error: {
          code: "CLOUDFLARE_NOT_CONFIGURED",
          message: "CLOUDFLARE_API_ORIGIN must be a valid HTTPS base ending in /api/v1",
        },
      },
      { status: 503 }
    );
    return withTransportDiagnostics(req, unavailable, "cloudflare-unavailable");
  }

  const headers = new Headers();
  for (const h of ["content-type", "authorization", "accept", "x-request-id"]) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("accept")) headers.set("accept", "application/json");

  let bodyBuffer: ArrayBuffer | null = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    bodyBuffer = await req.arrayBuffer();
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    ...(bodyBuffer && bodyBuffer.byteLength ? { body: bodyBuffer } : {}),
  };

  let upstream: Response | null = null;
  try {
    upstream = await fetch(`${CLOUDFLARE_UPSTREAM}/${sub}${url.search}`, init);
  } catch {
    const failed = NextResponse.json(
      {
        ok: false,
        error: { code: "UPSTREAM", message: "Cloudflare API временно недоступен" },
        requestId: "proxy",
      },
      { status: 502 }
    );
    return withTransportDiagnostics(req, failed, "cloudflare-unavailable");
  }

  let buf = await upstream.arrayBuffer();
  const upstreamContentType = upstream.headers.get("content-type") || "";
  if (sub.startsWith("trainings") && upstreamContentType.includes("json")) {
    try {
      const payload = JSON.parse(new TextDecoder().decode(buf));
      const protectedPayload = protectTrainingPayload(payload, req.method.toUpperCase(), sub);
      buf = new TextEncoder().encode(JSON.stringify(protectedPayload)).buffer as ArrayBuffer;
    } catch {
      // keep original
    }
  }

  const out = new NextResponse(buf, { status: upstream.status });
  const ct = upstream.headers.get("content-type");
  if (ct) out.headers.set("content-type", ct);
  for (const h of ["location", "content-disposition", "cache-control", "etag", "last-modified"]) {
    const value = upstream.headers.get(h);
    if (value) out.headers.set(h, value);
  }
  const rid = upstream.headers.get("x-request-id");
  if (rid) out.headers.set("x-request-id", rid);
  out.headers.set("x-medbiohim-proxy", "cloudflare-only");
  return withTransportDiagnostics(req, out, "cloudflare");
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path || []);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path || []);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path || []);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path || []);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path || []);
}
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id",
    },
  });
}
