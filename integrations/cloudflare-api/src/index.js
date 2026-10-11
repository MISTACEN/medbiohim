import { logoutSupabaseSession, recoverSupabasePassword, refreshSupabaseSession } from "./supabase-auth.js";

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

async function readJsonLimited(request, maxBytes) {
  if (!request.body) return { ok: true, value: null };
  const reader = request.clone().body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { ok: false, tooLarge: true };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    return { ok: false, invalid: true };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, invalid: true };
  }
}

function success(data, status = 200) {
  return json({ ok: true, data, requestId: crypto.randomUUID() }, status);
}

function notFound() {
  return json({
    ok: false,
    error: { code: "NOT_FOUND", message: "Endpoint not found" },
    requestId: crypto.randomUUID(),
  }, 404);
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
    const pathname = url.pathname !== "/" ? url.pathname.replace(/\/+$/, "") : "/";
    const origin = allowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      if (request.headers.has("origin") && !origin) {
        return json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED" } }, 403);
      }
      return withCors(new Response(null, { status: 204, headers: { "cache-control": "no-store" } }), origin);
    }

    if (pathname === "/health" || pathname === `${API_PREFIX}/health`) {
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

    // Explicitly migrated routes only; all other API paths fail closed below.
    if (pathname === `${API_PREFIX}/auth/recover`) {
      if (request.method !== "POST") {
        return withCors(json({
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          requestId: crypto.randomUUID(),
        }, 405, { allow: "POST, OPTIONS" }), origin);
      }
      const parsed = await readJsonLimited(request, 16_384);
      if (parsed.tooLarge) {
        return withCors(json({
          ok: false,
          error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
          requestId: crypto.randomUUID(),
        }, 413), origin);
      }
      if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
        return withCors(json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" },
          requestId: crypto.randomUUID(),
        }, 422), origin);
      }
      const result = await recoverSupabasePassword(parsed.value.email, env);
      if (!result.ok) {
        return withCors(json({
          ok: false,
          error: { code: result.code, message: result.message },
          requestId: crypto.randomUUID(),
        }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/auth/refresh`) {
      if (request.method !== "POST") {
        return withCors(json({
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          requestId: crypto.randomUUID(),
        }, 405, { allow: "POST, OPTIONS" }), origin);
      }
      const parsed = await readJsonLimited(request, 16_384);
      if (parsed.tooLarge) {
        return withCors(json({
          ok: false,
          error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
          requestId: crypto.randomUUID(),
        }, 413), origin);
      }
      if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
        return withCors(json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" },
          requestId: crypto.randomUUID(),
        }, 422), origin);
      }
      const result = await refreshSupabaseSession(parsed.value.refresh_token, env);
      if (!result.ok) {
        return withCors(json({
          ok: false,
          error: { code: result.code, message: result.message },
          requestId: crypto.randomUUID(),
        }, result.status), origin);
      }
      return withCors(success(result.data), origin);
    }

    if (pathname === `${API_PREFIX}/auth/logout`) {
      if (request.method !== "POST") {
        return withCors(json({
          ok: false,
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
          requestId: crypto.randomUUID(),
        }, 405, { allow: "POST, OPTIONS" }), origin);
      }

      const authorization = request.headers.get("authorization") || "";
      const match = /^Bearer\s+(\S+)$/i.exec(authorization);
      let accessToken = match?.[1] || "";

      // Preserve the PHP handler's JSON access_token fallback, with a strict size
      // cap. Authorization headers remain the preferred transport.
      if (!accessToken && request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
        const parsed = await readJsonLimited(request, 16_384);
        if (parsed.tooLarge) {
          return withCors(json({
            ok: false,
            error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
            requestId: crypto.randomUUID(),
          }, 413), origin);
        }
        if (!parsed.ok) {
          return withCors(json({
            ok: false,
            error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" },
            requestId: crypto.randomUUID(),
          }, 422), origin);
        }
        if (parsed.value && typeof parsed.value.access_token === "string") {
          accessToken = parsed.value.access_token.trim();
        }
      }

      if (!accessToken) {
        return withCors(json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Bearer token or access_token required" },
          requestId: crypto.randomUUID(),
        }, 422), origin);
      }

      const result = await logoutSupabaseSession(accessToken, env);
      if (!result.ok) {
        return withCors(json({
          ok: false,
          error: { code: result.code, message: result.message },
          requestId: crypto.randomUUID(),
        }, result.status), origin);
      }

      return withCors(success({ logged_out: true }), origin);
    }

    if (pathname === API_PREFIX || pathname === `${API_PREFIX}/ping`) {
      if (request.method !== "GET") {
        return withCors(notFound(), origin);
      }

      const build = env.MEDBIOHIM_BUILD || "unknown";
      if (pathname === API_PREFIX) {
        return withCors(success({
          name: "MEDBIOHIM API",
          version: "v1",
          build,
          phase: "D",
          endpoints: ["auth, me, groups, subjects, tests, homeworks, files"],
        }), origin);
      }

      return withCors(success({
        pong: true,
        build,
        env: env.APP_ENV || "local",
        time: new Date().toISOString().replace(/Z$/, "+00:00"),
      }), origin);
    }

    if (pathname.startsWith(API_PREFIX)) {
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
