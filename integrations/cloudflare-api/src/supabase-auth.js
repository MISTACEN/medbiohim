const AUTH_TIMEOUT_MS = 5_000;

function failure(status, code, message) {
  return { ok: false, status, code, message };
}

/**
 * Validate a bearer token with Supabase Auth over HTTPS.
 * This helper intentionally accepts only the public anon key and returns only
 * canonical identity fields. App roles and user_metadata are not authorization.
 */
export async function authenticateSupabaseRequest(request, env, fetcher = fetch) {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match) {
    return failure(401, "UNAUTHORIZED", "Missing or invalid Authorization Bearer token");
  }

  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured on the server");
  }

  let endpoint;
  try {
    endpoint = new URL("/auth/v1/user", baseUrl);
    if (endpoint.protocol !== "https:") {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth must use HTTPS");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth URL is invalid");
  }

  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + match[1],
        accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }

  if (response.status === 401 || response.status === 403) {
    return failure(401, "UNAUTHORIZED", "Invalid or expired access token");
  }
  if (!response.ok) {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth is temporarily unavailable");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an invalid response");
  }

  if (!payload || typeof payload.id !== "string" || payload.id.trim() === "") {
    return failure(401, "UNAUTHORIZED", "Invalid or expired access token");
  }

  return {
    ok: true,
    user: {
      id: payload.id,
      email: typeof payload.email === "string" ? payload.email : "",
    },
  };
}
