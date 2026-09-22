import { NextRequest, NextResponse } from "next/server";

/** Backend origin is explicit and must use HTTPS. */
const configuredOrigin = process.env.SPACEWEB_API_ORIGIN;
if (!configuredOrigin) throw new Error("SPACEWEB_API_ORIGIN is required");
const UPSTREAM = configuredOrigin.replace(/\/$/, "");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function proxy(req: NextRequest, pathParts: string[]) {
  const sub = pathParts.join("/");
  const url = new URL(req.url);
  const target = `${UPSTREAM}/${sub}${url.search}`;

  const headers = new Headers();
  const pass = ["content-type", "authorization", "accept", "x-request-id"];
  for (const h of pass) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("accept")) headers.set("accept", "application/json");

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
    cache: "no-store",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.arrayBuffer();
    if (body.byteLength) init.body = body;
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream unreachable";
    return NextResponse.json(
      { ok: false, error: { code: "UPSTREAM", message: msg }, requestId: "proxy" },
      { status: 502 }
    );
  }

  // If SpaceWeb returns 302 to http:// same path, re-fetch over HTTP once
  if (upstream.status >= 300 && upstream.status < 400) {
    const loc = upstream.headers.get("location");
    if (loc) {
      try {
        const retry = await fetch(loc.replace(/^https:/, "http:"), {
          ...init,
          redirect: "follow",
        });
        const buf = await retry.arrayBuffer();
        const out = new NextResponse(buf, { status: retry.status });
        const ct = retry.headers.get("content-type");
        if (ct) out.headers.set("content-type", ct);
        out.headers.set("x-medbiohim-proxy", "retry-http");
        return out;
      } catch {
        /* fall through */
      }
    }
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
