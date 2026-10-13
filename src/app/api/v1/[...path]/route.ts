import { NextRequest, NextResponse } from "next/server";
import { isHttpsOrigin, shouldFallbackFromCloudflare } from "@/lib/api-failover.mjs";

/** API proxy: Cloudflare is the default backend. Legacy PHP mode is an explicit
 * rollback option and is safe only with a valid HTTPS SpaceWeb origin. */
// Cloudflare mode deliberately ignores the retired HTTP SpaceWeb URL and fails closed
// for routes not migrated yet; bearer tokens are never sent over plaintext HTTP.
const API_MODE = process.env.MEDBIOHIM_API_MODE === "legacy" ? "legacy" : "cloudflare";
const configuredOrigin = API_MODE === "cloudflare" ? undefined : process.env.SPACEWEB_API_ORIGIN;
const UPSTREAM = configuredOrigin?.replace(/\/$/, "");
const cloudflareOrigin = process.env.CLOUDFLARE_API_ORIGIN || "https://medbiohim-api-shadow.ryazansevegor.workers.dev/api/v1";
const CLOUDFLARE_UPSTREAM = cloudflareOrigin.replace(/\/$/, "");
const CLOUDFLARE_FIRST_ENABLED = API_MODE === "cloudflare" || process.env.MEDBIOHIM_CF_FIRST === "true";
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://gnobvyjywtqbdfeejxmf.supabase.co").replace(/\/$/, "");
// The anon key is public by design, but its configured value must stay in environment variables.
// Do not commit test or production key material to the repository.
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
    const user = await auth.json() as { id?: unknown };
    if (typeof user?.id !== "string" || !user.id) return false;

    // Role is resolved through the caller's JWT and existing FK relation.
    // Never trust user_metadata, app-supplied role fields, or query parameters.
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
    // Hide diagnostics on any verification failure; never grant access by fallback.
    return false;
  }
}

async function withTransportDiagnostics(req: NextRequest, response: Response, source: string): Promise<Response> {
  if (req.headers.get("x-mbh-transport-diagnostics") !== "1") return response;
  if (!(await isCanonicalAdminRequest(req))) return response;

  const headers = new Headers(response.headers);
  headers.set("x-mbh-transport-source", source);
  headers.set("x-mbh-transport-fallback", source === "spaceweb-fallback" || source === "compatibility-fallback" ? "true" : "false");
  return new NextResponse(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const sub = pathParts.join("/");
  const url = new URL(req.url);

  if (!CLOUDFLARE_FIRST_ENABLED && !UPSTREAM) {
    return NextResponse.json(
      { ok: false, error: { code: "BACKEND_NOT_CONFIGURED", message: "SPACEWEB_API_ORIGIN is not configured on this deployment." } },
      { status: 503 }
    );
  }
  // Never forward bearer credentials to a plaintext upstream, even in legacy mode.
  if (UPSTREAM && !isHttpsOrigin(UPSTREAM)) {
    return NextResponse.json(
      { ok: false, error: { code: "INSECURE_BACKEND_ORIGIN", message: "SPACEWEB_API_ORIGIN must use HTTPS." } },
      { status: 503 }
    );
  }

  if (CLOUDFLARE_FIRST_ENABLED) {
    if (!CLOUDFLARE_UPSTREAM || !isHttpsOrigin(CLOUDFLARE_UPSTREAM) ||
        !new URL(CLOUDFLARE_UPSTREAM).pathname.replace(/\/$/, "").endsWith("/api/v1")) {
      const invalid = NextResponse.json(
        { ok: false, error: { code: "CLOUDFLARE_NOT_CONFIGURED", message: "CLOUDFLARE_API_ORIGIN must be a valid HTTPS API base ending in /api/v1." } },
        { status: 503 }
      );
      return withTransportDiagnostics(req, invalid, "cloudflare-unavailable");
    }
  }

  const spacewebTargets = UPSTREAM ? [
    `${UPSTREAM}/${sub}${url.search}`,
    ...(UPSTREAM.endsWith("/api/v1")
      ? [`${UPSTREAM.slice(0, -"/api/v1".length)}/public/api/v1/${sub}${url.search}`]
      : []),
  ] : [];

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
  const makeInit = (signal?: AbortSignal): RequestInit => ({
    method: req.method,
    headers,
    redirect: "manual",
    cache: "no-store",
    ...(bodyBuffer && bodyBuffer.byteLength ? { body: bodyBuffer.slice(0) } : {}),
    ...(signal ? { signal } : {}),
  });

  async function fetchSpacewebTargets() {
    let response: Response | null = null;
    let error: unknown = null;
    for (let i = 0; i < spacewebTargets.length; i += 1) {
      try {
        const candidate = await fetch(spacewebTargets[i], makeInit());
        if (candidate.status !== 404 || i === spacewebTargets.length - 1 || req.method !== "GET") {
          response = candidate;
          break;
        }
      } catch (e) {
        error = e;
        // A write may have reached SpaceWeb before the connection dropped.
        // Do not retry it against a second legacy path.
        if (req.method !== "GET") break;
      }
    }
    return { response, error };
  }

  let upstream: Response | null = null;
  let lastError: unknown = null;
  let source = "spaceweb";

  if (CLOUDFLARE_FIRST_ENABLED) {
    source = "cloudflare";
    try {
      const cloudflareResponse = await fetch(
        `${CLOUDFLARE_UPSTREAM}/${sub}${url.search}`,
        makeInit(AbortSignal.timeout(8000))
      );
      const useFallback = await shouldFallbackFromCloudflare(req, cloudflareResponse);
      // Never send bearer tokens or private request bodies to a plaintext origin.
      if (useFallback && UPSTREAM && isHttpsOrigin(UPSTREAM)) {
        source = "spaceweb-fallback";
        const fallback = await fetchSpacewebTargets();
        upstream = fallback.response;
        lastError = fallback.error;
      } else {
        upstream = cloudflareResponse;
      }
    } catch (error) {
      lastError = error;
      const safeRead = ["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase());
      if (safeRead && UPSTREAM && isHttpsOrigin(UPSTREAM)) {
        source = "spaceweb-fallback";
        const fallback = await fetchSpacewebTargets();
        upstream = fallback.response;
        lastError = fallback.error || lastError;
      } else {
        source = "cloudflare-unavailable";
      }
    }
  } else {
    if (!UPSTREAM) {
      return NextResponse.json(
        { ok: false, error: { code: "BACKEND_NOT_CONFIGURED", message: "SPACEWEB_API_ORIGIN is not configured on this deployment." } },
        { status: 503 }
      );
    }
    source = "spaceweb";
    const primary = await fetchSpacewebTargets();
    upstream = primary.response;
    lastError = primary.error;
  }

  // The old backend may not have trainer routes yet. Feed data itself is already
  // in Supabase, so the frontend proxy can keep the module usable without touching
  // the working schedule/auth backend.
  if (upstream?.status === 404 && sub.startsWith("trainers/feed")) {
    const fallback = await trainerFallback(req, pathParts);
    if (fallback) return withTransportDiagnostics(req, fallback, "compatibility-fallback");
  }

  if (!upstream) {
    const failed = NextResponse.json(
      { ok: false, error: { code: "UPSTREAM", message: "Backend is temporarily unavailable" }, requestId: "proxy" },
      { status: 502 }
    );
    return withTransportDiagnostics(req, failed, source);
  }

  let buf = await upstream.arrayBuffer();
  const upstreamContentType = upstream.headers.get("content-type") || "";
  if (sub.startsWith("trainings") && upstreamContentType.includes("json")) {
    try {
      const payload = JSON.parse(new TextDecoder().decode(buf));
      const data = payload && typeof payload === "object" ? (payload as any).data : null;
      if (data && typeof data === "object") {
        if (req.method === "POST" && sub === "trainings" && Array.isArray(data.questions)) {
          data.questions = data.questions.map((question: unknown) => safeTrainerQuestion(question));
        } else if (req.method === "GET" && sub.startsWith("trainings/") && sub.split("/").length === 2 && Array.isArray(data.answers)) {
          data.answers = data.answers.map((answer: any) => {
            if (!answer || typeof answer !== "object") return answer;
            if (answer.user_answer != null || Boolean(answer.is_skipped)) return answer;
            const safe = { ...answer };
            for (const key of ["options", "question_snapshot", "review_snapshot"]) {
              if (safe[key] !== undefined) safe[key] = safeTrainerQuestion(safe[key]);
            }
            return safe;
          });
        }
      }
      buf = new TextEncoder().encode(JSON.stringify(payload));
    } catch {
      // Keep the original upstream response if it is not valid JSON.
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
  out.headers.set("x-medbiohim-proxy", "direct");
  return withTransportDiagnostics(req, out, source);
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
