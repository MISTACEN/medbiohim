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

/**
 * Revoke a Supabase Auth session using the caller's access token.
 * The service-role key is never used; the caller's token is sent only to
 * the configured HTTPS Supabase Auth endpoint.
 */
export async function logoutSupabaseSession(accessToken, env, fetcher = fetch) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return failure(401, "UNAUTHORIZED", "Missing or invalid Authorization Bearer token");
  }

  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured on the server");
  }

  let endpoint;
  try {
    endpoint = new URL("/auth/v1/logout", baseUrl);
    if (endpoint.protocol !== "https:") {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth must use HTTPS");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth URL is invalid");
  }

  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + token,
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

  return { ok: true };
}

export async function refreshSupabaseSession(refreshToken, env, fetcher = fetch) {
  const token = String(refreshToken || "").trim();
  if (!token || token.length > 8192) {
    return failure(422, "VALIDATION_ERROR", "refresh_token is required");
  }
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured on the server");
  }
  let endpoint;
  try {
    endpoint = new URL("/auth/v1/token?grant_type=refresh_token", baseUrl);
    if (endpoint.protocol !== "https:") {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth must use HTTPS");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth URL is invalid");
  }
  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + anonKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ refresh_token: token }),
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return failure(401, "AUTH_REFRESH_FAILED", "Could not refresh session");
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
  const user = payload && payload.user && typeof payload.user === "object" ? payload.user : null;
  if (!payload || typeof payload.access_token !== "string" ||
      typeof payload.refresh_token !== "string" || !user ||
      typeof user.id !== "string" || !user.id) {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an invalid session");
  }
  const meta = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const appMeta = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  return {
    ok: true,
    data: {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_in: payload.expires_in ?? null,
      token_type: payload.token_type || "bearer",
      user: {
        id: user.id,
        email: typeof user.email === "string" ? user.email : null,
        full_name: typeof meta.full_name === "string" ? meta.full_name :
          (typeof meta.name === "string" ? meta.name : null),
        role: typeof appMeta.role === "string" && appMeta.role.trim() ? appMeta.role.trim() : null,
      },
    },
  };
}

export async function recoverSupabasePassword(email, env, fetcher = fetch) {
  const address = String(email || "").trim();
  if (!address || address.length > 254) {
    return failure(422, "VALIDATION_ERROR", "email is required");
  }
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured on the server");
  }
  let endpoint;
  try {
    const supabase = new URL(baseUrl);
    if (supabase.protocol !== "https:") {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth must use HTTPS");
    }
    const appOrigin = new URL(String(env.MEDBIOHIM_APP_ORIGIN || "https://medbiohim.vercel.app"));
    if (appOrigin.protocol !== "https:") {
      return failure(503, "AUTH_NOT_CONFIGURED", "Recovery redirect must use HTTPS");
    }
    endpoint = new URL("/auth/v1/recover", supabase);
    endpoint.searchParams.set("redirect_to", new URL("/auth/callback", appOrigin.origin).toString());
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth or recovery redirect URL is invalid");
  }
  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + anonKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ email: address }),
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }
  if (response.status === 429) {
    return failure(429, "RATE_LIMITED", "Too many recovery requests. Try again later.");
  }
  if (response.status >= 500) {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth is temporarily unavailable");
  }
  // Do not expose whether an email address exists. Supabase 4xx responses are
  // intentionally normalized to the same public success shape as the PHP route.
  return { ok: true, data: { sent: true } };
}

export async function loginSupabaseUser(email, password, env, fetcher = fetch) {
  const address = String(email || "").trim();
  const secret = String(password || "");
  if (!address || !secret || address.length > 254 || secret.length > 1024) {
    return failure(422, "VALIDATION_ERROR", "email and password are required");
  }
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured on the server");
  }
  let endpoint;
  try {
    endpoint = new URL("/auth/v1/token?grant_type=password", baseUrl);
    if (endpoint.protocol !== "https:") {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth must use HTTPS");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth URL is invalid");
  }
  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + anonKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ email: address, password: secret }),
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return failure(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }
  if (response.status === 429) {
    return failure(429, "RATE_LIMITED", "Too many login attempts. Try again later.");
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
  const user = payload && payload.user && typeof payload.user === "object" ? payload.user : null;
  if (!payload || typeof payload.access_token !== "string" ||
      typeof payload.refresh_token !== "string" || !user ||
      typeof user.id !== "string" || !user.id) {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an invalid session");
  }
  const meta = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const appMeta = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  return {
    ok: true,
    data: {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_in: payload.expires_in ?? null,
      token_type: payload.token_type || "bearer",
      user: {
        id: user.id,
        email: typeof user.email === "string" ? user.email : address,
        full_name: typeof meta.full_name === "string" ? meta.full_name :
          (typeof meta.name === "string" ? meta.name : null),
        role: typeof appMeta.role === "string" && appMeta.role.trim() ? appMeta.role.trim() : null,
      },
    },
  };
}
