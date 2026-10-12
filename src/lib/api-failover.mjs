/**
 * Conservative fallback policy shared by the Vercel API proxy and unit tests.
 * Never retry an arbitrary mutation after an upstream failure: the write may
 * have committed even if its response was lost.
 */
export function isHttpsOrigin(value) {
  try {
    return Boolean(value) && new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function responseErrorCode(response) {
  try {
    const body = await response.clone().json();
    return String(body?.error?.code || body?.code || "");
  } catch {
    return "";
  }
}

export async function shouldFallbackFromCloudflare(request, response) {
  const code = await responseErrorCode(response);

  // This contract means the handler was not executed, so it is safe for
  // either reads or writes to be handled by the legacy backend.
  if (response.status === 501 && code === "ROUTE_NOT_MIGRATED") return true;

  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return response.status >= 500 && response.status !== 501;
  }

  // These explicit configuration guards return before any Auth operation.
  if (response.status !== 503) return false;
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  const authPreflight = new Set([
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/recover",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
  ]);
  if (authPreflight.has(path) &&
      ["AUTH_NOT_CONFIGURED", "RATE_LIMIT_NOT_CONFIGURED", "RATE_LIMIT_UNAVAILABLE"].includes(code)) {
    return true;
  }
  // These exact guards return before the handler mutates state, so the
  // legacy PHP backend can safely handle the request.
  if (path === "/api/v1/files/upload" && code === "STORAGE_NOT_CONFIGURED") return true;
  if (path === "/api/v1/homeworks" && code === "HOMEWORK_ATTACHMENTS_NOT_CONFIGURED") return true;
  return false;
}
