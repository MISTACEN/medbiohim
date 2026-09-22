import { NextRequest, NextResponse } from "next/server";

/** Backend origin is explicit and must use HTTPS. */
const configuredOrigin = process.env.SPACEWEB_API_ORIGIN;
const UPSTREAM = configuredOrigin?.replace(/\/$/, "");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function proxy(req: NextRequest, pathParts: string[]) {
  if (!UPSTREAM) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "BACKEND_NOT_CONFIGURED",
          message: "SPACEWEB_API_ORIGIN is not configured on this deployment.",
        },
      },
      { status: 503 }
    );
  }

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
