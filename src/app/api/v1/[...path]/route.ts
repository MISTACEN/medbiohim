import { NextRequest, NextResponse } from "next/server";

/** API proxy. Existing backend remains the primary source; trainer endpoints have a
 * Supabase compatibility fallback because older SpaceWeb deployments may not expose
 * /trainers/feed yet. */
const configuredOrigin = process.env.SPACEWEB_API_ORIGIN;
const UPSTREAM = configuredOrigin?.replace(/\/$/, "");
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://gnobvyjywtqbdfeejxmf.supabase.co").replace(/\/$/, "");
// The anon key is intentionally safe for browser use and is already used by src/lib/supabase.ts.
// Keep the server fallback aligned so trainer routes still work when Vercel env vars are missing.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdub2J2eWp5d3RxYmRmZWVqeG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MzgxMjIsImV4cCI6MjEwNDAxNDEyMn0.kVPf6gZ_7GGNt1nDvbev4RJM0iMQ9rBWBV_5xXWRUTg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearer(req: NextRequest) {
  const value = req.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
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
      select: "id,subject_id,subject_slug,specialty_slug,mode_set,preparation,hotspots,question,tags,difficulty,source_key,source_file_id,is_published,created_at,updated_at",
      is_published: "eq.true",
      order: "id.asc",
      limit: String(limit),
      offset: String(offset),
    });
    if (subject) params.set("subject_slug", `eq.${subject}`);
    if (specialty) params.set("specialty_slug", `eq.${specialty}`);

    const response = await supabaseRequest(`trainer_feed_cards?${params.toString()}`, req);
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
    return NextResponse.json(
      { ok: true, data: { items: Array.isArray(data) ? data : [], limit, offset, source: "supabase_rest_fallback" }, requestId: "trainer-fallback" },
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

    const cardParams = new URLSearchParams({
      select: "id,specialty_slug,question",
      id: `eq.${cardId}`,
      is_published: "eq.true",
      limit: "1",
    });
    const cardResponse = await supabaseRequest(`trainer_feed_cards?${cardParams.toString()}`, req);
    if (!cardResponse) return null;
    const cardText = await cardResponse.text();
    let cards: any[] = [];
    try { cards = JSON.parse(cardText); } catch {}
    if (!cardResponse.ok || !cards[0]) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Trainer card not found" }, requestId: "trainer-fallback" }, { status: 404 });
    }

    const question = cards[0].question && typeof cards[0].question === "object" ? cards[0].question : {};
    const optionId = typeof payload.option_id === "string" ? payload.option_id.trim() : "";
    const answerText = typeof payload.answer_text === "string" ? payload.answer_text.trim() : "";
    const skipped = Boolean(payload.is_skipped);
    let correct: boolean | null = null;
    const options = Array.isArray((question as any).options) ? (question as any).options : [];
    for (const option of options) {
      if (String(option?.id || "") === optionId) {
        correct = Boolean(option?.correct);
        break;
      }
    }

    const insert = {
      user_id: userId,
      card_id: cardId,
      option_id: optionId || null,
      answer_text: answerText || (optionId || null),
      is_skipped: skipped,
      is_correct: skipped ? null : correct,
      time_ms: Number.isFinite(Number(payload.time_ms)) ? Number(payload.time_ms) : null,
    };
    const answerResponse = await supabaseRequest("trainer_feed_answers", req, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(insert),
    });
    if (!answerResponse) return null;
    const answerTextResponse = await answerResponse.text();
    let answer: unknown = null;
    try { answer = JSON.parse(answerTextResponse); } catch {}
    if (!answerResponse.ok) {
      return NextResponse.json({ ok: false, error: { code: "TRAINER_ERROR", message: "Could not save trainer answer", details: answer }, requestId: "trainer-fallback" }, { status: answerResponse.status });
    }
    return NextResponse.json({ ok: true, data: { answer: Array.isArray(answer) ? answer[0] : answer, correct: skipped ? null : correct }, requestId: "trainer-fallback" }, { status: 201 });
  }

  // GET /trainers/feed/{id}/image: keep the existing backend as the media source.
  const imageMatch = sub.match(/^trainers\/feed\/([^/]+)\/image$/);
  if (req.method === "GET" && imageMatch) {
    const id = decodeURIComponent(imageMatch[1]);
    const params = new URLSearchParams({ select: "preparation", id: "eq." + id, is_published: "eq.true", limit: "1" });
    const response = await supabaseRequest("trainer_feed_cards?" + params.toString(), req);
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
      const media = await fetch(origin + imageUrl, { headers: { Accept: "image/*", Authorization: "Bearer " + token }, cache: "no-store", redirect: "follow" });
      if (!media.ok) return NextResponse.json({ ok: false, error: { code: "MEDIA_NOT_FOUND", message: "Original trainer media is not available on the backend" }, requestId: "trainer-fallback" }, { status: 404 });
      const out = new NextResponse(await media.arrayBuffer(), { status: 200 });
      out.headers.set("content-type", media.headers.get("content-type") || "image/png");
      out.headers.set("cache-control", "private, max-age=86400");
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
    const response = await supabaseRequest(`trainer_feed_cards?${params.toString()}`, req);
    if (!response) return null;
    const text = await response.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = []; }
    if (!response.ok || !Array.isArray(data) || !data[0]) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Trainer card not found" }, requestId: "trainer-fallback" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: { item: data[0] }, requestId: "trainer-fallback" }, { status: 200 });
  }

  return null;
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const sub = pathParts.join("/");

  if (sub.startsWith("trainers/feed")) {
    const fallback = await trainerFallback(req, pathParts);
    if (fallback) return fallback;
  }

  if (!UPSTREAM) {
    return NextResponse.json(
      { ok: false, error: { code: "BACKEND_NOT_CONFIGURED", message: "SPACEWEB_API_ORIGIN is not configured on this deployment." } },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const targets = [
    `${UPSTREAM}/${sub}${url.search}`,
    ...(UPSTREAM.endsWith("/api/v1")
      ? [`${UPSTREAM.slice(0, -"/api/v1".length)}/public/api/v1/${sub}${url.search}`]
      : []),
  ];

  const headers = new Headers();
  for (const h of ["content-type", "authorization", "accept", "x-request-id"]) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("accept")) headers.set("accept", "application/json");

  const init: RequestInit = { method: req.method, headers, redirect: "manual", cache: "no-store" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.arrayBuffer();
    if (body.byteLength) init.body = body;
  }

  let upstream: Response | null = null;
  let lastError: unknown = null;
  for (let i = 0; i < targets.length; i += 1) {
    try {
      const candidate = await fetch(targets[i], init);
      if (candidate.status !== 404 || i === targets.length - 1 || req.method !== "GET") {
        upstream = candidate;
        break;
      }
    } catch (e) {
      lastError = e;
    }
  }

  // The old backend may not have trainer routes yet. Feed data itself is already
  // in Supabase, so the frontend proxy can keep the module usable without touching
  // the working schedule/auth backend.
  if (upstream?.status === 404 && sub.startsWith("trainers/feed")) {
    const fallback = await trainerFallback(req, pathParts);
    if (fallback) return fallback;
  }

  if (!upstream) {
    const msg = lastError instanceof Error ? lastError.message : "upstream unreachable";
    return NextResponse.json({ ok: false, error: { code: "UPSTREAM", message: msg }, requestId: "proxy" }, { status: 502 });
  }

  const buf = await upstream.arrayBuffer();
  const out = new NextResponse(buf, { status: upstream.status });
  const ct = upstream.headers.get("content-type");
  if (ct) out.headers.set("content-type", ct);
  const rid = upstream.headers.get("x-request-id");
  if (rid) out.headers.set("x-request-id", rid);
  out.headers.set("x-medbiohim-proxy", "direct");
  return out;
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
