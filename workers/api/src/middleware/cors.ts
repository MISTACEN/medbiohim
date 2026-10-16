import type { Context, Next } from "hono";
import type { Env } from "../env";

export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const origins = (c.env.CORS_ORIGINS || c.env.APP_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const requestOrigin = c.req.header("Origin") || "";
  const allowOrigin =
    origins.length === 0
      ? "*"
      : origins.includes(requestOrigin)
        ? requestOrigin
        : origins[0];

  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Request-Id, X-MBH-Transport-Diagnostics",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }

  await next();

  c.res.headers.set("Access-Control-Allow-Origin", allowOrigin);
  c.res.headers.set("Vary", "Origin");
}
