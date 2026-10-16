import type { Context, Next } from "hono";
import type { Env } from "../env";

export async function securityHeaders(c: Context<{ Bindings: Env }>, next: Next) {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  // Cloudflare already provides edge security; these help browsers.
}
