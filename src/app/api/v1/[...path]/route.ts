import { NextRequest, NextResponse } from "next/server";

/** API proxy. Existing backend remains the primary source; trainer endpoints have a
 * Supabase compatibility fallback because older SpaceWeb deployments may not expose
 * /trainers/feed yet. */
const configuredOrigin = process.env.SPACEWEB_API_ORIGIN;
const UPSTREAM = configuredOrigin?.replace(/\/$/, "");
const cloudflareOrigin = process.env.CLOUDFLARE_API_ORIGIN;
const CLOUDFLARE_UPSTREAM = cloudflareOrigin?.replace(/\/$/, "");
const CLOUDFLARE_FIRST_ENABLED = process.env.MEDBIOHIM_CF_FIRST === "true";
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

function isHttpsOrigin(value: string | undefined): boolean {
  try {
    return Boolean(value) && new URL(value as string).protocol === "https:";
  } catch {
    return false;
  }
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

    // Resolve the canonical database role through the caller JWT and RLS.
    // Never trust user_metadata or a client-supplied role for diagnostics.
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
    // Diagnostics fail closed. A role-query failure hides the indicator but
    // does not change the API response or grant any additional permission.
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

async function responseErrorCode(response: Response): Promise<string> {
  try {
    const body = await response.clone().json();
    return String(body?.error?.code || body?.code || "");
  } catch {
    return "";
  }
}

async function shouldFallbackFromCloudflare(req: NextRequest, response: Response): Promise<boolean> {
  const code = await responseErrorCode(response);
  // An explicit, side-effect-free 501 is safe to send to the legacy backend
  // for any method: this Worker route did not execute.
  if (response.status === 501 && code === "ROUTE_NOT_MIGRATED") return true;

  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return response.status >= 500 && response.status !== 501;
  }

  // These codes are emitted by preflight guards before an Auth operation occurs.
  // Do not retry arbitrary failed writes: the upstream may have committed before
  // the connection failed, and repeating them can create duplicate state changes.
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const authPreflight = new Set([
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/recover",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
  ]);
  return response.status === 503 &&
    authPreflight.has(path) &&
    ["AUTH_NOT_CONFIGURED", "RATE_LIMIT_NOT_CONFIGURED", "RATE_LIMIT_UNAVAILABLE"].includes(code);
}

function jwtSubject(token: string) {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64url").toString("utf8");
    const payload = JSON.parse(json) as { sub?: string };
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

const TRAINER_ANSWER_KEYS = new Set([
  "explanation", "answer", "correct", "isCorrect", "is_correct",
  "correctAnswer", "correct_answer", "correctOption", "correct_option",
  "correctOptionId", "correct_option_id",
]);

function safeTrainerQuestion(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => safeTrainerQuestion(item));
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const safe: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(source)) {
    if (TRAINER_ANSWER_KEYS.has(key)) continue;

    if (key === "preparation" && child && typeof child === "object" && !Array.isArray(child)) {
      const preparation = { ...(child as Record<string, unknown>) };
      delete preparation.name;
      delete preparation.organ;
      delete preparation.captions;
      safe[key] = safeTrainerQuestion(preparation);
      continue;
    }

    safe[key] = safeTrainerQuestion(child);
  }

  return safe;
}

async function supabaseRequest(path: string, req: NextRequest, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const token = bearer(req);
  if (!token) return NextResponse.json(
    { ok: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization Bearer token" }, requestId: "trainer-fallback" },
    { status: 401 }
  );
  const headers = new Headers(init.headers);
  headers.set("apikey", SUPABASE_ANON_KEY);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers, cache: "no-store" });
}

async function trainerFallback(req: NextRequest, pathParts: string[]) {
  const sub = pathParts.join("/");
  if (!sub.startsWith("trainers/feed")) return null;

  const token = bearer(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization Bearer token" }, requestId: "trainer-fallback" },
      { status: 401 }
    );
  }

  // GET /trainers/feed
  if (req.method === "GET" && sub === "trainers/feed") {
    const url = new URL(req.url);
    const subject = (url.searchParams.get("subject") || "").trim();
    const specialty = (url.searchParams.get("specialty") || "").trim();
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 30)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));

    const params = new URLSearchParams({
      select: "id,subject_id,subject_slug,specialty_slug,mode_set,preparation,hotspots,question,tags,difficulty,source_key,source_file_id,is_published,created_at,updated_at,plan_module_id,plan_topic_id,plan_status,plan_module_title,plan_topic_title",
      is_published: "eq.true",
      order: "id.asc",
      limit: String(limit),
      offset: String(offset),
    });
    if (subject) params.set("subject_slug", `eq.${subject}`);
    if (specialty) params.set("specialty_slug", `eq.${specialty}`);

    const response = await supabaseRequest(`trainer_feed_cards_public?${params.toString()}`, req);
    if (!response) return null;
    const text = await response.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = []; }
    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: { code: "TRAINER_FALLBACK", message: "Supabase trainer feed request failed", details: data }, requestId: response.headers.get("x-request-id") || "trainer-fallback" },
        { status: response.status }
      );
    }
    const safeItems = Array.isArray(data) ? data.map((item: any) => ({ ...item, question: safeTrainerQuestion(item?.question) })) : [];
    return NextResponse.json(
      { ok: true, data: { items: safeItems, limit, offset, source: "supabase_rest_fallback" }, requestId: "trainer-fallback" },
      { status: 200 }
    );
  }

  // POST /trainers/feed/answer
  if (req.method === "POST" && sub === "trainers/feed/answer") {
    const body = await req.text();
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(body) as Record<string, unknown>; } catch {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid JSON" }, requestId: "trainer-fallback" }, { status: 422 });
    }
    const cardId = typeof payload.card_id === "string" ? payload.card_id.trim() : "";
    if (!cardId) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "card_id required" }, requestId: "trainer-fallback" }, { status: 422 });
    }
    const userId = jwtSubject(token);
    if (!userId) {
      return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid Authorization Bearer token" }, requestId: "trainer-fallback" }, { status: 401 });
    }

    const optionId = typeof payload.option_id === "string" ? payload.option_id.trim() : "";
    const answerText = typeof payload.answer_text === "string" ? payload.answer_text.trim() : "";
    const skipped = Boolean(payload.is_skipped);
    const rawTime = Number(payload.time_ms);
    const timeMs = Number.isFinite(rawTime) ? Math.max(0, Math.min(3600000, Math.trunc(rawTime))) : null;

    const answerResponse = await supabaseRequest("rpc/submit_trainer_feed_answer", req, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        p_card_id: cardId,
        p_option_id: optionId || null,
        p_answer_text: answerText || null,
        p_is_skipped: skipped,
        p_time_ms: timeMs,
      }),
    });
    if (!answerResponse) return null;
    const answerTextResponse = await answerResponse.text();
    let result: any = null;
    try { result = JSON.parse(answerTextResponse); } catch {}
    if (!answerResponse.ok || !result || typeof result !== "object") {
      return NextResponse.json({ ok: false, error: { code: "TRAINER_ERROR", message: "Could not save trainer answer" }, requestId: "trainer-fallback" }, { status: answerResponse.status || 503 });
    }
    return NextResponse.json({
      ok: true,
      data: { answer: result.answer ?? null, correct: result.correct ?? null, explanation: result.explanation ?? null },
      requestId: "trainer-fallback",
    }, { status: 201 });
  }

  // GET /trainers/feed/{id}/image: keep the existing backend as the media source.
  const imageMatch = sub.match(/^trainers\/feed\/([^/]+)\/image$/);
  if (req.method === "GET" && imageMatch) {
    const id = decodeURIComponent(imageMatch[1]);
    const params = new URLSearchParams({ select: "preparation", id: "eq." + id, is_published: "eq.true", limit: "1" });
    const response = await supabaseRequest("trainer_feed_cards_public?" + params.toString(), req);
    if (!response) return null;
    const text = await response.text();
    let rows: any[] = [];
    try { rows = JSON.parse(text); } catch {}
    const imageUrl = rows[0]?.preparation?.imageUrl;
    if (!response.ok || typeof imageUrl !== "string" || !imageUrl.startsWith("/")) {
      return NextResponse.json({ ok: false, error: { code: "MEDIA_NOT_FOUND", message: "Trainer image not found" }, requestId: "trainer-fallback" }, { status: 404 });
    }
    if (!UPSTREAM) return null;
    const origin = UPSTREAM.endsWith("/api/v1") ? UPSTREAM.slice(0, -"/api/v1".length) : UPSTREAM;
    try {
      // preparation.imageUrl is the canonical media path. Fetch it directly so the
      // Vercel compatibility layer also works while an older SpaceWeb trainer route
      // still resolves source_key incorrectly.
      const media = await fetch(origin + imageUrl, { headers: { Accept: "image/*", Authorization: "Bearer " + token }, cache: "no-store", redirect: "follow" });
      if (!media.ok) return NextResponse.json({ ok: false, error: { code: "MEDIA_NOT_FOUND", message: "Original trainer media is not available on the backend" }, requestId: "trainer-fallback" }, { status: 404 });
      const out = new NextResponse(await media.arrayBuffer(), { status: 200 });
      out.headers.set("content-type", media.headers.get("content-type") || "image/png");
      out.headers.set("cache-control", "private, no-store");
      out.headers.set("x-medbiohim-proxy", "trainer-media-fallback");
      return out;
    } catch {
      return NextResponse.json({ ok: false, error: { code: "MEDIA_ERROR", message: "Trainer media backend is unreachable" }, requestId: "trainer-fallback" }, { status: 502 });
    }
  }

  // GET /trainers/feed/{id}
  const cardMatch = sub.match(/^trainers\/feed\/([^/]+)$/);
  if (req.method === "GET" && cardMatch) {
    const id = decodeURIComponent(cardMatch[1]);
    const params = new URLSearchParams({
      select: "id,subject_id,subject_slug,specialty_slug,mode_set,preparation,hotspots,question,tags,difficulty,source_key,source_file_id,is_published,created_at,updated_at",
      id: `eq.${id}`,
      is_published: "eq.true",
      limit: "1",
    });
    const response = await supabaseRequest(`trainer_feed_cards_public?${params.toString()}`, req);
    if (!response) return null;
    const text = await response.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = []; }
    if (!response.ok || !Array.isArray(data) || !data[0]) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Trainer card not found" }, requestId: "trainer-fallback" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: { item: { ...data[0], question: safeTrainerQuestion(data[0]?.question) } }, requestId: "trainer-fallback" }, { status: 200 });
  }

  return null;
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
