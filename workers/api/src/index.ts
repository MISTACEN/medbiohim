/**
 * MEDBIOHIM API — Cloudflare Workers + Hono
 * Clean rewrite for frontend /api/v1 contract.
 *
 * Secrets (Cloudflare Dashboard → Worker → Settings → Variables and Secrets):
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 *   OPENAI_API_KEY (optional)
 *   APP_ORIGIN, CORS_ORIGINS
 */
import { Hono } from "hono";
import type { Env } from "./env";
import { corsMiddleware } from "./middleware/cors";
import { securityHeaders } from "./middleware/security";
import { fail, requestId } from "./lib/response";

import health from "./routes/health";
import auth from "./routes/auth";
import me from "./routes/me";
import dashboard from "./routes/dashboard";
import subjects from "./routes/subjects";

const app = new Hono<{ Bindings: Env }>();

app.use("*", corsMiddleware);
app.use("*", securityHeaders);
app.use("*", async (c, next) => {
  c.set("requestId" as never, requestId() as never);
  await next();
  c.res.headers.set("x-request-id", (c.get("requestId" as never) as string) || "");
  c.res.headers.set("x-mbh-api-source", "cloudflare");
});

// Health (root + under /api/v1)
app.route("/", health);

// API v1
const v1 = new Hono<{ Bindings: Env }>();
v1.route("/auth", auth);
v1.route("/me", me);
v1.route("/dashboard", dashboard);
v1.route("/subjects", subjects);

// Placeholder for routes still to implement — explicit 501 so frontend can detect
v1.all("*", (c) => {
  const path = c.req.path;
  const { body, status } = fail(
    "ROUTE_NOT_IMPLEMENTED",
    `Route not implemented yet: ${c.req.method} ${path}`,
    501
  );
  return c.json(body, status as 501);
});

app.route("/api/v1", v1);

app.notFound((c) => {
  const { body, status } = fail("NOT_FOUND", "Not found", 404);
  return c.json(body, status as 404);
});

app.onError((err, c) => {
  console.error("[medbiohim-api]", err);
  const { body, status } = fail("INTERNAL", "Внутренняя ошибка", 500);
  return c.json(body, status as 500);
});

export default app;
