const DEFAULT_APP_ORIGIN = "https://medbiohim.vercel.app";
const API_PREFIX = "/api/v1";

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const configured = (env.MEDBIOHIM_ALLOWED_ORIGINS || env.MEDBIOHIM_APP_ORIGIN || DEFAULT_APP_ORIGIN)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return configured.includes(origin) ? origin : null;
}

function withCors(response, origin) {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("access-control-allow-headers", "Authorization, Content-Type, X-Request-Id");
  headers.set("access-control-max-age", "600");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      if (request.headers.has("origin") && !origin) {
        return json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED" } }, 403);
      }
      return withCors(new Response(null, { status: 204, headers: { "cache-control": "no-store" } }), origin);
    }

    if (url.pathname === "/health" || url.pathname === `${API_PREFIX}/health`) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, { allow: "GET, HEAD" }), origin);
      }
      return withCors(json({
        ok: true,
        service: "medbiohim-cloudflare-api",
        mode: env.APP_ENV || "shadow",
        role: "migration-scaffold",
        productionTrafficEnabled: false,
      }), origin);
    }

    if (url.pathname.startsWith(API_PREFIX)) {
      // Intentionally do not forward to SpaceWeb: its current HTTPS origin is not trusted.
      // New routes must be implemented and tested here before any traffic is switched.
      return withCors(json({
        ok: false,
        error: {
          code: "ROUTE_NOT_MIGRATED",
          message: "This endpoint has not been migrated to Cloudflare Workers yet.",
        },
      }, 501), origin);
    }

    return withCors(json({ ok: false, error: { code: "NOT_FOUND" } }, 404), origin);
  },
};
