const AUTH_TIMEOUT_MS = 5_000;

function failure(status, code, message) {
  return { ok: false, status, code, message };
}

function logAuthRedirect(operation, response, endpoint) {
  const location = response.headers.get("location");
  let target = null;
  try {
    if (location) target = new URL(location, endpoint);
  } catch {
    // Do not include raw Location values in logs.
  }
  console.error("supabase_auth_unexpected_redirect", {
    operation,
    status: response.status,
    hasLocation: Boolean(location),
    sourceIsHttps: endpoint.protocol === "https:",
    sourceIsSupabaseDomain: endpoint.hostname.endsWith(".supabase.co"),
    sourceMatchesExpectedProject: endpoint.hostname === "gnobvyjywtqbdfeejxmf.supabase.co",
    targetIsHttps: target ? target.protocol === "https:" : false,
    targetSameOrigin: target ? target.origin === endpoint.origin : false,
    targetIsSupabaseDomain: target ? target.hostname.endsWith(".supabase.co") : false,
    targetMatchesExpectedProject: target ? target.hostname === "gnobvyjywtqbdfeejxmf.supabase.co" : false,
    targetPathCategory: !target ? "unknown" :
      target.pathname.startsWith("/auth/v1/") ? "auth" :
      target.pathname.startsWith("/rest/v1/") ? "rest" :
      target.pathname === "/" ? "root" : "other",
  });
}

function logAuthFetchFailure(operation, error, env) {
  const cause = error && typeof error === "object" ? error.cause : undefined;
  const outerMessage = error instanceof Error ? error.message : "";
  const causeMessage = cause instanceof Error ? cause.message : "";
  const combined = (outerMessage + " " + causeMessage).toLowerCase();

  let reasonCategory = "unknown";
  if (/enotfound|eai_again|getaddrinfo|dns/.test(combined)) {
    reasonCategory = "dns";
  } else if (/certificate|tls|ssl|cert_/.test(combined)) {
    reasonCategory = "tls";
  } else if (/timed?\s*out|timeout|aborted/.test(combined)) {
    reasonCategory = "timeout";
  } else if (/redirect/.test(combined)) {
    reasonCategory = "redirect";
  } else if (/econnreset|econnrefused|ehostunreach|socket|network|connect/.test(combined)) {
    reasonCategory = "connection";
  } else if (/fetch failed/.test(combined)) {
    reasonCategory = "fetch_failed";
  } else if (combined.trim()) {
    reasonCategory = "other";
  }

  const configuredUrl = String(env?.SUPABASE_URL || "").trim();
  let configuredUrlIsHttps = false;
  let configuredHostMatchesExpectedProject = false;
  let configuredHostIsSupabaseDomain = false;
  try {
    const parsedConfiguredUrl = new URL(configuredUrl);
    configuredUrlIsHttps = parsedConfiguredUrl.protocol === "https:";
    configuredHostMatchesExpectedProject =
      parsedConfiguredUrl.hostname === "gnobvyjywtqbdfeejxmf.supabase.co";
    configuredHostIsSupabaseDomain = parsedConfiguredUrl.hostname.endsWith(".supabase.co");
  } catch {
    // Leave booleans false; do not log the malformed configured value.
  }

  // Never log the URL, raw error message, credentials, token, or response body.
  console.warn("supabase_auth_upstream_fetch_failed", {
    operation,
    errorName: error instanceof Error ? error.name : "UnknownError",
    causeType: cause == null ? "none" : typeof cause,
    causeName: cause instanceof Error ? cause.name : undefined,
    causeCode: typeof cause?.code === "string" ? cause.code : undefined,
    reasonCategory,
    configuredUrlIsHttps,
    configuredHostIsSupabaseDomain,
    configuredHostMatchesExpectedProject,
  });
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
      redirect: "manual",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch (error) {
    logAuthFetchFailure("authenticate", error, env);
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }

  if (response.status >= 300 && response.status < 400) {
    logAuthRedirect("authenticateSupabaseRequest", response, endpoint);
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an unexpected redirect");
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
      redirect: "manual",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch (error) {
    logAuthFetchFailure("logout", error, env);
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }

  if (response.status >= 300 && response.status < 400) {
    logAuthRedirect("logoutSupabaseSession", response, endpoint);
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an unexpected redirect");
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
      redirect: "manual",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch (error) {
    logAuthFetchFailure("refresh", error, env);
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }
  if (response.status >= 300 && response.status < 400) {
    logAuthRedirect("refreshSupabaseSession", response, endpoint);
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an unexpected redirect");
  }
  if (response.status === 400 || response.status === 401) {
    // Supabase uses 400/401 for a refresh token it has explicitly rejected.
    // Keep this distinct from 5xx/network failures so clients can retain a
    // still-valid session during an Auth outage.
    return failure(401, "INVALID_REFRESH", "Could not refresh session");
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
      redirect: "manual",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch (error) {
    logAuthFetchFailure("recover", error, env);
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }
  if (response.status >= 300 && response.status < 400) {
    logAuthRedirect("recoverSupabasePassword", response, endpoint);
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an unexpected redirect");
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
      redirect: "manual",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch (error) {
    logAuthFetchFailure("login", error, env);
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }
  if (response.status >= 300 && response.status < 400) {
    logAuthRedirect("loginSupabaseUser", response, endpoint);
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an unexpected redirect");
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

export async function registerSupabaseUser(email, password, fullName, env, fetcher = fetch) {
  const address = String(email || "").trim();
  const secret = String(password || "");
  const name = String(fullName || "").trim();
  if (name.length < 2 || name.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ||
      address.length > 254 || secret.length < 8 || secret.length > 1024) {
    return failure(422, "VALIDATION_ERROR", "A valid email, password of at least 8 characters, and name are required");
  }
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured on the server");
  }
  let endpoint;
  try {
    endpoint = new URL("/auth/v1/signup", baseUrl);
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
      body: JSON.stringify({ email: address, password: secret, data: { full_name: name, name } }),
      redirect: "manual",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch (error) {
    logAuthFetchFailure("register", error, env);
    return failure(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }
  if (response.status >= 300 && response.status < 400) {
    logAuthRedirect("registerSupabaseUser", response, endpoint);
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an unexpected redirect");
  }
  if (response.status === 429) {
    return failure(429, "RATE_LIMITED", "Too many registration attempts. Try again later.");
  }
  if (response.status >= 400 && response.status < 500) {
    return failure(422, "AUTH_REGISTER_FAILED", "Registration could not be completed");
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
  if (!user || typeof user.id !== "string" || !user.id) {
    return failure(502, "AUTH_UPSTREAM_ERROR", "Supabase Auth returned an invalid registration response");
  }
  const meta = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const appMeta = user.app_metadata && typeof user.app_metadata === "object" ? user.app_metadata : {};
  return {
    ok: true,
    data: {
      access_token: typeof payload.access_token === "string" ? payload.access_token : null,
      refresh_token: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
      expires_in: payload.expires_in ?? null,
      token_type: payload.token_type || "bearer",
      needs_email_confirm: !payload.access_token,
      user: {
        id: user.id,
        email: typeof user.email === "string" ? user.email : address,
        full_name: typeof meta.full_name === "string" ? meta.full_name :
          (typeof meta.name === "string" ? meta.name : name),
        role: typeof appMeta.role === "string" && appMeta.role.trim() ? appMeta.role.trim() : null,
      },
    },
  };
}

/**
 * Read the caller's profile bundle using their own JWT + the public anon key.
 * No service-role credential is accepted or used. Each table query remains
 * subject to Supabase grants and RLS; unavailable optional profile data falls
 * back to the PHP handler's minimal identity bundle.
 */
export async function getSupabaseProfileBundle(request, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  const token = match?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase URL is invalid");
  }

  async function rows(table, query) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(query)) endpoint.searchParams.set(key, value);
    let response;
    try {
      response = await fetcher(endpoint.toString(), {
        method: "GET",
        headers: {
          apikey: anonKey,
          authorization: "Bearer " + token,
          accept: "application/json",
        },
        // Inspect and block redirects; never forward a caller JWT to a redirect target.
        redirect: "manual",
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      });
    } catch (error) {
      const message = [error?.name, error?.message, error?.cause?.code]
        .filter(Boolean).join(" ").toLowerCase();
      const category = /redirect/.test(message) ? "redirect"
        : /timeout|timed out|aborted/.test(message) ? "timeout"
        : /enotfound|eai_again|dns|getaddrinfo/.test(message) ? "dns"
        : /certificate|tls|ssl/.test(message) ? "tls"
        : /fetch failed|network|socket|connect/.test(message) ? "connection"
        : "upstream";
      console.error("MEDBIOHIM_PROFILE_REST_FETCH_ERROR", JSON.stringify({
        table,
        category,
        sourceMatchesExpectedProject: base.hostname === "gnobvyjywtqbdfeejxmf.supabase.co",
      }));
      return null;
    }
    if (response.status >= 300 && response.status < 400) {
      logAuthRedirect("profile:" + table, response, endpoint);
      return null;
    }
    if (!response.ok) {
      let errorPayload = null;
      try { errorPayload = await response.json(); } catch {}
      console.error("MEDBIOHIM_PROFILE_REST_QUERY_FAILED", JSON.stringify({
        table,
        status: response.status,
        code: typeof errorPayload?.code === "string" ? errorPayload.code.slice(0, 40) : "REST_ERROR",
        sourceMatchesExpectedProject: base.hostname === "gnobvyjywtqbdfeejxmf.supabase.co",
      }));
      return null;
    }
    try {
      const payload = await response.json();
      return Array.isArray(payload) ? payload : null;
    } catch {
      console.error("MEDBIOHIM_PROFILE_REST_INVALID_JSON", JSON.stringify({ table }));
      return null;
    }
  }

  const profileRows = await rows("users", {
    select: "id,full_name,email,avatar_url,course_number,semester",
    id: "eq." + identity.user.id,
    limit: "1",
  });
  const profile = profileRows?.[0] || null;
  const roleRows = await rows("user_roles", {
    select: "roles(code)",
    user_id: "eq." + identity.user.id,
  });
  const rolePriority = { admin: 0, moderator: 1, teacher: 2, student: 3 };
  const roles = (roleRows || [])
    .map((item) => Array.isArray(item.roles) ? item.roles[0]?.code : item.roles?.code)
    .filter((code) => typeof code === "string" && code.trim() !== "")
    .map((code) => code.trim().toLowerCase())
    // Keep the PHP-compatible primary role predictable for clients using roles[0].
    .sort((a, b) => (rolePriority[a] ?? 4) - (rolePriority[b] ?? 4));

  const membershipRows = await rows("group_memberships", {
    select: "group_id,role_in_group,is_active,groups(id,code,name,course_number,admission_year,is_active)",
    user_id: "eq." + identity.user.id,
    is_active: "eq.true",
  });
  const groups = (membershipRows || []).flatMap((membership) => {
    const groupValue = membership && membership.groups;
    const group = Array.isArray(groupValue) ? groupValue[0] : groupValue;
    if (!group || group.is_active === false) return [];
    return [{
      id: group.id ?? membership.group_id ?? null,
      code: group.code ?? null,
      name: group.name ?? null,
      course_number: group.course_number ?? null,
      admission_year: group.admission_year ?? null,
      role_in_group: membership.role_in_group ?? null,
      is_active: membership.is_active === true,
    }];
  });

  const course = profile?.course_number == null ? null : Number(profile.course_number);
  const semester = profile?.semester == null ? null : Number(profile.semester);
  const currentGroup = groups.find((group) =>
    course !== null && group.course_number != null && Number(group.course_number) === course
  ) || groups[0] || null;

  const user = {
    id: identity.user.id,
    full_name: typeof profile?.full_name === "string" ? profile.full_name : null,
    email: typeof profile?.email === "string" ? profile.email : identity.user.email,
    avatar_url: typeof profile?.avatar_url === "string" ? profile.avatar_url : null,
    group_id: currentGroup?.id ?? null,
    group_name: currentGroup?.name ?? null,
    group_code: currentGroup?.code ?? null,
    course_number: Number.isFinite(course) ? course : null,
    semester: Number.isFinite(semester) ? semester : null,
  };
  return {
    ok: true,
    data: {
      user,
      roles,
      groups,
      current_group: currentGroup,
      course: user.course_number,
      semester: user.semester,
    },
  };
}

export async function searchSupabaseContent(request, env, options = {}, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  const query = String(options.q ?? "").trim();
  const requestedLimit = Number.parseInt(String(options.limit ?? "30"), 10);
  const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 30));
  const subjectSlug = String(options.subject_slug ?? "").trim() || null;
  const subjectId = String(options.subject_id ?? "").trim() || null;
  const type = String(options.type ?? "").trim() || null;
  const needle = query.toLocaleLowerCase();
  if (!query) {
    return { ok: true, data: { query: "", total: 0, items: [], facets: { subjects: [], types: {} } } };
  }
  if (query.length > 200 || (type && !["question", "ticket", "trainer", "subject", "plan"].includes(type))) {
    return failure(422, "VALIDATION_ERROR", "Invalid search query or type");
  }

  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  const token = match?.[1] || "";
  let base;
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  try {
    base = new URL(String(env.SUPABASE_URL || "").trim());
    if (base.protocol !== "https:" || !anonKey) {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase URL is invalid");
  }

  async function rows(table, params) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, String(value));
    let response;
    try {
      response = await fetcher(endpoint.toString(), {
        method: "GET",
        headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      });
    } catch {
      throw new Error("SEARCH_UPSTREAM_ERROR");
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("SEARCH_ACCESS_DENIED");
      throw new Error("SEARCH_UPSTREAM_ERROR");
    }
    const payload = await response.json().catch(() => null);
    if (!Array.isArray(payload)) throw new Error("SEARCH_UPSTREAM_ERROR");
    return payload;
  }

  const matchesSubject = (slug, rowId) => subjectId !== null
    ? String(rowId ?? "") === subjectId
    : subjectSlug === null || String(slug ?? "") === subjectSlug;
  const score = (title, topic) => {
    const t = String(title || "").toLocaleLowerCase();
    const p = String(topic || "").toLocaleLowerCase();
    let value = 1;
    if (t === needle) value += 5;
    if (t.startsWith(needle)) value += 2.5;
    if (t.includes(needle)) value += 1.5;
    if (p && p.includes(needle)) value += 0.8;
    return Math.round(value * 10000) / 10000;
  };
  const hit = (id, title, snippet, subject, slug, topic, itemType, hasAnswer, itemScore, href, answer = null) => ({
    id, title: String(title || "").slice(0, 140),
    snippet: String(snippet || "").replace(/\s+/gu, " ").slice(0, 280),
    subject, subject_slug: slug, topic, type: itemType, score: itemScore, has_answer: hasAnswer,
    answer: answer && String(answer).trim() ? String(answer).trim().slice(0, 5000) : null, href,
  });

  try {
    const subjects = await rows("subjects", { is_active: "eq.true", select: "id,name,slug,description", order: "name.asc", limit: 500 });
    const subjectById = new Map(subjects.map((s) => [String(s.id ?? ""), s]));
    const hits = [];

    if (!type || type === "question") {
      // questions has topic_id, not a denormalized topic column. Resolve topic
      // labels separately so this read matches the live Supabase schema.
      const data = await rows("questions", { is_published: "eq.true", archived_at: "is.null", select: "id,subject_id,topic_id,text,answer", order: "created_at.desc", limit: 1000 });
      const topicIds = [...new Set(data.map((row) => String(row.topic_id || "")).filter((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      ))];
      const topicById = new Map();
      if (topicIds.length) {
        try {
          const topicRows = await rows("topics", {
            select: "id,title",
            id: "in.(" + topicIds.join(",") + ")",
            limit: String(Math.min(1000, topicIds.length)),
          });
          for (const topicRow of topicRows) topicById.set(String(topicRow.id), String(topicRow.title || ""));
        } catch {
          // Question text remains searchable even if optional topic labels are not visible.
        }
      }
      for (const row of data) {
        const subject = subjectById.get(String(row.subject_id ?? "")) || {};
        const slug = String(subject.slug ?? "");
        if (!matchesSubject(slug, row.subject_id)) continue;
        const title = String(row.text ?? "").trim();
        const topic = String(topicById.get(String(row.topic_id ?? "")) || "").trim();
        if (!(title + " " + topic).toLocaleLowerCase().includes(needle)) continue;
        hits.push(hit("q-" + row.id, title, title, subject.name || "Без предмета", slug, topic, "question", Boolean(row.answer), score(title, topic), slug ? "/subjects/" + encodeURIComponent(slug) + "?tab=practice" : "/practice", String(row.answer ?? "").trim()));
      }
    }
    if (!type || type === "ticket") {
      const data = await rows("exam_questions", { is_published: "eq.true", select: "id,subject_id,subject_name,subject_slug,topic,text,answer", order: "created_at.desc", limit: 1000 });
      for (const row of data) {
        const slug = String(row.subject_slug ?? "").trim();
        if (!matchesSubject(slug, row.subject_id)) continue;
        const title = String(row.text ?? "").trim();
        const topic = String(row.topic ?? "").trim();
        if (!(title + " " + topic + " " + String(row.subject_name ?? "")).toLocaleLowerCase().includes(needle)) continue;
        hits.push(hit("t-" + row.id, title, title, row.subject_name || "Без предмета", slug, topic, "ticket", Boolean(row.answer), score(title, topic), slug ? "/subjects/" + encodeURIComponent(slug) + "?tab=tickets" : "/tickets", String(row.answer ?? "").trim()));
      }
    }
    if (!type || type === "trainer") {
      const data = await rows("trainer_feed_cards_public", { is_published: "eq.true", select: "id,subject_id,subject_slug,specialty_slug,preparation,question,tags", order: "created_at.desc", limit: 1000 });
      for (const row of data) {
        const slug = String(row.subject_slug ?? "").trim();
        if (!matchesSubject(slug, row.subject_id) || (slug === "histology" && String(row.specialty_slug || "mbh") !== "mbh")) continue;
        const prep = row.preparation && typeof row.preparation === "object" ? row.preparation : {};
        const q = row.question && typeof row.question === "object" ? row.question : {};
        const tags = Array.isArray(row.tags) ? row.tags.map(String) : [];
        const title = String(prep.name || q.prompt || "Тренажёр").trim();
        const topic = tags.join(", ");
        if (!(title + " " + String(q.prompt || "") + " " + topic).toLocaleLowerCase().includes(needle)) continue;
        hits.push(hit("r-" + row.id, title, String(q.prompt || title).trim(), slug === "histology" ? "Гистология, цитология" : (slug || "Тренажёр"), slug, topic, "trainer", false, score(title, topic), slug ? "/trainers/feed/" + encodeURIComponent(slug) : "/trainers"));
      }
    }
    if (!type || type === "subject") {
      for (const subject of subjects) {
        const name = String(subject.name ?? "").trim();
        const slug = String(subject.slug ?? "").trim();
        if (!matchesSubject(slug, subject.id) || !(name + " " + String(subject.description ?? "")).toLocaleLowerCase().includes(needle)) continue;
        hits.push(hit("s-" + subject.id, name, subject.description || name, name, slug, "", "subject", false, Math.round((score(name, "") + 0.2) * 10000) / 10000, "/subjects/" + encodeURIComponent(String(subject.id))));
      }
    }
    if (!type || type === "plan") {
      try {
        const plans = await rows("site_content", { key: "like.subject_plan:*", select: "key,payload", limit: 500 });
        for (const row of plans) {
          const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
          const slug = String(payload.subject_slug || String(row.key || "").replace(/^subject_plan:/, "")).trim();
          if (!matchesSubject(slug, payload.subject_id)) continue;
          const subjectName = String(payload.subject || slug).trim();
          if (!(subjectName + " " + JSON.stringify(payload)).toLocaleLowerCase().includes(needle)) continue;
          hits.push(hit("p-" + slug, subjectName + " · Учебный план", "Учебный план предмета " + subjectName, subjectName, slug, "", "plan", false, score(subjectName, ""), slug ? "/subjects/" + encodeURIComponent(slug) + "?tab=plan" : "/subjects"));
        }
      } catch {
        // Like the PHP implementation, plan content is optional for search availability.
      }
    }
    hits.sort((a, b) => b.score - a.score);
    const items = hits.slice(0, limit);
    const subjectFacet = new Map();
    const typeFacet = {};
    for (const item of items) {
      if (item.subject_slug) {
        const old = subjectFacet.get(item.subject_slug) || { subject: item.subject, subject_slug: item.subject_slug, count: 0 };
        old.count += 1;
        subjectFacet.set(item.subject_slug, old);
      }
      typeFacet[item.type] = (typeFacet[item.type] || 0) + 1;
    }
    return { ok: true, data: { query, total: items.length, items, facets: { subjects: [...subjectFacet.values()], types: typeFacet } } };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return code === "SEARCH_ACCESS_DENIED"
      ? failure(503, "SEARCH_ERROR", "Поиск временно недоступен")
      : failure(503, "SEARCH_ERROR", "Поиск временно недоступен");
  }
}

export async function getSupabaseSubjectDetail(request, subjectId, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const id = String(subjectId || "").trim();
  if (!id || id.length > 128 || /[\\/?#]/.test(id)) {
    return failure(422, "VALIDATION_ERROR", "A valid subject id is required");
  }
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  const token = match?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase URL is invalid");
  }

  async function rows(table, query) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(query)) endpoint.searchParams.set(key, value);
    let response;
    try {
      response = await fetcher(endpoint.toString(), {
        method: "GET",
        headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      });
    } catch (error) {
      const message = [error?.name, error?.message, error?.cause?.code].filter(Boolean).join(" ").toLowerCase();
      const category = /redirect/.test(message) ? "redirect"
        : /timeout|timed out|aborted/.test(message) ? "timeout"
        : /enotfound|eai_again|dns|getaddrinfo/.test(message) ? "dns"
        : /certificate|tls|ssl/.test(message) ? "tls" : "connection";
      console.error("MEDBIOHIM_SUBJECT_DETAIL_FETCH_ERROR", JSON.stringify({
        table, category, sourceMatchesExpectedProject: base.hostname === "gnobvyjywtqbdfeejxmf.supabase.co",
      }));
      throw error;
    }
    if (response.status >= 300 && response.status < 400) {
      logAuthRedirect("subject-detail:" + table, response, endpoint);
      const error = new Error("Supabase REST redirect blocked");
      error.status = response.status;
      error.code = "UPSTREAM_REDIRECT";
      error.table = table;
      throw error;
    }
    if (!response.ok) {
      let payload = null;
      try { payload = await response.json(); } catch {}
      const error = new Error("Supabase REST read failed");
      error.status = response.status;
      error.code = typeof payload?.code === "string" ? payload.code.slice(0, 40) : "REST_ERROR";
      error.table = table;
      console.error("MEDBIOHIM_SUBJECT_DETAIL_QUERY_FAILED", JSON.stringify({
        table, status: error.status, code: error.code,
        sourceMatchesExpectedProject: base.hostname === "gnobvyjywtqbdfeejxmf.supabase.co",
      }));
      throw error;
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Supabase REST returned an invalid collection");
    return payload;
  }

  let subjects;
  let modules;
  try {
    subjects = await rows("subjects", {
      select: "id,slug,name,specialty_slug,course_number,semester,control_type,lecture_hours,practice_hours,self_study_hours,total_hours,credits,is_active",
      id: "eq." + id,
      limit: "1",
    });
    if (!subjects.length) return failure(404, "NOT_FOUND", "Subject not found");
    try {
      // Live Supabase schema uses order_index (not sort_order). Query the
      // canonical column first to avoid turning a harmless ordering mismatch
      // into a 503 for the entire subject page.
      modules = await rows("modules", {
        select: "id,title,order_index",
        subject_id: "eq." + id,
        order: "order_index.asc.nullslast,title.asc",
      });
    } catch {
      // Keep subject details available on older schemas with no ordering
      // column. RLS still applies to the same caller-JWT read.
      modules = await rows("modules", {
        select: "id,title",
        subject_id: "eq." + id,
        order: "title.asc",
      });
    }
    modules = modules.map((module) => ({
      id: module.id ?? null,
      title: module.title ?? "",
      sort_order: module.order_index ?? module.sort_order ?? null,
    }));

    // Attach the actual curriculum topics to each module so the subject page can
    // render a useful thematic plan when no curated JSON plan exists. Topics are
    // read with the same caller JWT and remain subject to Supabase RLS.
    const moduleIds = modules.map((module) => String(module?.id || "")).filter((id) => id && !/[(),]/.test(id));
    let topics = [];
    if (moduleIds.length) {
      try {
        topics = await rows("topics", {
          select: "id,module_id,title,order_index",
          module_id: "in.(" + moduleIds.join(",") + ")",
          order: "module_id.asc,order_index.asc,title.asc",
        });
      } catch {
        try {
          topics = await rows("topics", {
            select: "id,module_id,title,sort_order",
            module_id: "in.(" + moduleIds.join(",") + ")",
            order: "module_id.asc,sort_order.asc,title.asc",
          });
          topics = topics.map((topic) => ({ ...topic, order_index: topic.order_index ?? topic.sort_order ?? null }));
        } catch {
          // Older deployments may not expose topics to the caller; keep subject
          // details usable and do not invent a curriculum.
          topics = [];
        }
      }
    }
    modules = modules.map((module) => ({
      ...module,
      topics: topics.filter((topic) => String(topic.module_id || "") === String(module.id || ""))
        .map((topic) => ({ id: topic.id ?? null, title: topic.title ?? "", order_index: topic.order_index ?? null })),
    }));
  } catch (error) {
    console.error("MEDBIOHIM_SUBJECT_DETAIL_FAILED", JSON.stringify({
      table: String(error?.table || "unknown").slice(0, 50),
      status: Number(error?.status) || 0,
      code: String(error?.code || "UNEXPECTED_ERROR").slice(0, 40),
    }));
    return failure(503, "DB_UNAVAILABLE", "Subject data is temporarily unavailable");
  }
  return { ok: true, data: { subject: subjects[0], modules } };
}


/**
 * List active groups visible to the authenticated caller through Supabase grants/RLS.
 * Mirrors the PHP list contract without a service-role credential. Any denied or
 * malformed REST response is fail-closed; never fall back to an unrestricted list.
 */
export async function listSupabaseGroups(request, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  const token = match?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase URL is invalid");
  }

  const endpoint = new URL("/rest/v1/groups", base);
  endpoint.searchParams.set("select", "id,code,name,course_number,admission_year,is_active");
  // Preserve the PHP repository's COALESCE(is_active, true) behavior.
  endpoint.searchParams.set("or", "(is_active.eq.true,is_active.is.null)");
  endpoint.searchParams.set("order", "course_number.asc.nullslast,code.asc");

  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Groups are temporarily unavailable");
  }
  if (response.status >= 300 && response.status < 400) {
    return failure(503, "DB_UNAVAILABLE", "Groups are temporarily unavailable");
  }
  if (!response.ok) {
    return failure(503, "DB_UNAVAILABLE", "Groups are temporarily unavailable");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Groups are temporarily unavailable");
  }
  if (!Array.isArray(payload)) {
    return failure(503, "DB_UNAVAILABLE", "Groups are temporarily unavailable");
  }
  return { ok: true, data: { items: payload } };
}

/**
 * Read one subject's gradebook/reference curriculum rows after enforcing the same
 * specialty access rules as PHP SpecialtyAccess::canAccessSubject().
 * Every query uses the caller JWT and anon key so database grants/RLS remain active.
 */
export async function getSupabaseSubjectGradebook(request, subjectId, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  const id = String(subjectId || "").trim();
  if (!id || id.length > 128 || /[\\/?#]/.test(id)) {
    return failure(422, "VALIDATION_ERROR", "A valid subject id is required");
  }
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  const token = match?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase URL is invalid");
  }

  async function rows(table, query) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(query)) endpoint.searchParams.set(key, value);
    let response;
    try {
      response = await fetcher(endpoint.toString(), {
        method: "GET",
        headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      });
    } catch {
      throw new Error("Supabase REST read failed");
    }
    if (response.status >= 300 && response.status < 400) throw new Error("Supabase REST redirect refused");
    if (!response.ok) throw new Error("Supabase REST read failed");
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Supabase REST returned an invalid collection");
    return payload;
  }

  let subject;
  try {
    const subjects = await rows("subjects", {
      select: "id,slug,specialty_slug,is_active",
      id: "eq." + id,
      is_active: "eq.true",
      limit: "1",
    });
    subject = subjects[0] || null;
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Subject access could not be verified");
  }
  if (!subject) {
    // PHP canAccessSubject() returns false for missing/inactive subjects and the
    // existing route maps that to FORBIDDEN rather than revealing existence.
    return failure(403, "FORBIDDEN", "Этот предмет недоступен для вашей специальности");
  }

  const subjectSlug = String(subject.slug || "").trim();
  const specialtySlug = String(subject.specialty_slug || "").trim();
  const requiredSpecialty = subjectSlug === "histology" || specialtySlug === "mbh" ? "mbh" : specialtySlug;
  if (requiredSpecialty) {
    let memberships;
    try {
      memberships = await rows("group_memberships", {
        select: "group_id,groups(specialty_slug,is_active)",
        user_id: "eq." + identity.user.id,
        is_active: "eq.true",
      });
    } catch {
      return failure(503, "DB_UNAVAILABLE", "Subject access could not be verified");
    }
    const canAccess = memberships.some((membership) => {
      const raw = membership?.groups;
      const group = Array.isArray(raw) ? raw[0] : raw;
      return Boolean(group) && group.is_active !== false &&
        String(group.specialty_slug || "").trim() === requiredSpecialty;
    });
    if (!canAccess) {
      return failure(403, "FORBIDDEN", "Этот предмет недоступен для вашей специальности");
    }
  }

  try {
    const items = await rows("subject_gradebook_entries", {
      subject_id: "eq." + id,
      select: "id,subject_id,display_name,hours,credits,control_form,hours_scope,source_note,source_file",
    });
    return { ok: true, data: { items } };
  } catch {
    return failure(503, "DB_UNAVAILABLE", "Не удалось загрузить данные для зачётки");
  }
}

/**
 * List active subjects for the authenticated student.
 * Uses only the caller JWT and public anon key; group-derived specialty access
 * is checked before specialty-scoped subjects are returned. Any access-check
 * failure is fail-closed rather than returning the full catalog.
 */
export async function listSupabaseSubjects(request, env, filters = {}, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  const token = match?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) {
      return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
    }
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase URL is invalid");
  }

  async function rows(table, query) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(query)) endpoint.searchParams.set(key, value);
    const response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      // Inspect redirects without following them or forwarding the caller token.
      redirect: "manual",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      logAuthRedirect("subjects:" + table, response, base);
      const error = new Error("Supabase REST redirect blocked");
      error.status = response.status;
      error.code = "UPSTREAM_REDIRECT";
      error.table = table;
      throw error;
    }
    if (response.status >= 300 && response.status < 400) {
      logAuthRedirect("subjects:" + table, response, endpoint);
      const error = new Error("Supabase REST redirect blocked");
      error.status = response.status;
      error.code = "UPSTREAM_REDIRECT";
      error.table = table;
      throw error;
    }
    if (!response.ok) {
      let errorPayload = null;
      try { errorPayload = await response.json(); } catch {}
      const error = new Error("Supabase REST read failed");
      error.status = response.status;
      error.code = typeof errorPayload?.code === "string"
        ? errorPayload.code
        : typeof errorPayload?.error === "string" ? errorPayload.error : "REST_ERROR";
      error.table = table;
      throw error;
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      const error = new Error("Supabase REST returned an invalid collection");
      error.table = table;
      error.code = "INVALID_COLLECTION";
      throw error;
    }
    return payload;
  }

  const course = String(filters.course ?? "").trim();
  const semester = String(filters.semester ?? "").trim();
  const requestedGroup = String(filters.group_id ?? "").trim();
  if ((course && !/^[1-6]$/.test(course)) || (semester && !/^(?:[1-9]|1[0-2])$/.test(semester))) {
    return failure(422, "VALIDATION_ERROR", "course or semester filter is invalid");
  }
  if (requestedGroup && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedGroup)) {
    return failure(422, "VALIDATION_ERROR", "group_id must be a UUID");
  }

  try {
    const membershipQuery = {
      select: "group_id,groups(specialty_slug,is_active,course_number)",
      user_id: "eq." + identity.user.id,
      is_active: "eq.true",
    };
    if (requestedGroup) membershipQuery.group_id = "eq." + requestedGroup;
    const memberships = await rows("group_memberships", membershipQuery);
    const activeMemberships = memberships.filter((membership) => {
      const raw = membership?.groups;
      const group = Array.isArray(raw) ? raw[0] : raw;
      return Boolean(group) && group.is_active !== false && Boolean(membership.group_id);
    });
    if (requestedGroup && !activeMemberships.some((row) => String(row.group_id || "") === requestedGroup)) {
      return failure(403, "GROUP_ACCESS_DENIED", "You do not belong to the requested group");
    }
    const allowedSpecialties = new Set();
    const allowedCourses = new Set();
    for (const membership of activeMemberships) {
      const raw = membership?.groups;
      const group = Array.isArray(raw) ? raw[0] : raw;
      const slug = String(group?.specialty_slug || "").trim().toLowerCase();
      if (slug) allowedSpecialties.add(slug);
      const groupCourse = Number(group?.course_number);
      if (group?.course_number != null && Number.isInteger(groupCourse)) allowedCourses.add(groupCourse);
    }
    // Histology is part of the MBH specialty in the PHP SpecialtyAccess policy.
    if (allowedSpecialties.has("mbh")) allowedSpecialties.add("histology");

    const query = {
      select: "id,code,name,short_name,description,course_number,semester,control_type,lecture_hours,practice_hours,self_study_hours,total_hours,credits,slug,specialty_slug,color_hex,is_active",
      is_active: "eq.true",
      order: "name.asc",
      limit: "500",
    };
    if (course) query.course_number = "eq." + course;
    if (semester) query.semester = "eq." + semester;
    const subjects = await rows("subjects", query);
    const items = subjects.filter((subject) => {
      const specialty = String(subject?.specialty_slug || "").trim().toLowerCase();
      if (specialty && !allowedSpecialties.has(specialty)) return false;
      if (requestedGroup && allowedCourses.size === 1 && subject.course_number != null &&
          !allowedCourses.has(Number(subject.course_number))) return false;
      return true;
    });
    return { ok: true, data: { items } };
  } catch (error) {
    const cause = error && typeof error === "object" ? error.cause : undefined;
    const failureText = [error?.name, error?.message, cause?.name, cause?.code].filter(Boolean).join(" ").toLowerCase();
    const category = /redirect/.test(failureText) ? "redirect"
      : /timeout|timed out|aborted/.test(failureText) ? "timeout"
      : /enotfound|eai_again|dns|getaddrinfo/.test(failureText) ? "dns"
      : /certificate|tls|ssl/.test(failureText) ? "tls"
      : /fetch failed|network|socket|connect/.test(failureText) ? "connection"
      : "upstream";
    console.error("MEDBIOHIM_SUBJECTS_DB_ERROR", JSON.stringify({
      table: error?.table || "unknown",
      status: Number(error?.status) || 0,
      code: String(error?.code || "UNEXPECTED_ERROR").slice(0, 40),
      category,
    }));
    return failure(503, "DB_UNAVAILABLE", "Subject list is temporarily unavailable");
  }
}


function apiDate(value, fallback) {
  const candidate = String(value ?? "").trim();
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback;
}

function apiToday(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Read the student's schedule from the existing Supabase schedules /
 * schedule_entries tables. Membership is resolved with the caller JWT first;
 * all subsequent reads continue to use that JWT so RLS remains authoritative.
 */
export async function listSupabaseSchedule(request, env, filters = {}, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "");
  const token = match?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
  }

  async function rows(table, params) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, String(value));
    let response;
    try {
      response = await fetcher(endpoint.toString(), {
        method: "GET",
        headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      });
    } catch (error) {
      const message = [error?.name, error?.message, error?.cause?.code].filter(Boolean).join(" ").toLowerCase();
      const category = /redirect/.test(message) ? "redirect"
        : /timeout|timed out|aborted/.test(message) ? "timeout"
        : /enotfound|eai_again|dns|getaddrinfo/.test(message) ? "dns"
        : /certificate|tls|ssl/.test(message) ? "tls" : "connection";
      console.error("MEDBIOHIM_SCHEDULE_FETCH_ERROR", JSON.stringify({
        table, category, sourceMatchesExpectedProject: base.hostname === "gnobvyjywtqbdfeejxmf.supabase.co",
      }));
      throw error;
    }
    if (response.status >= 300 && response.status < 400) {
      logAuthRedirect("schedule:" + table, response, endpoint);
      const error = new Error("Supabase REST redirect blocked");
      error.status = response.status;
      error.code = "UPSTREAM_REDIRECT";
      error.table = table;
      throw error;
    }
    if (!response.ok) {
      let payload = null;
      try { payload = await response.json(); } catch {}
      const error = new Error("Schedule query failed");
      error.status = response.status;
      error.code = typeof payload?.code === "string" ? payload.code.slice(0, 40) : "REST_ERROR";
      error.table = table;
      console.error("MEDBIOHIM_SCHEDULE_QUERY_FAILED", JSON.stringify({
        table, status: error.status, code: error.code,
        sourceMatchesExpectedProject: base.hostname === "gnobvyjywtqbdfeejxmf.supabase.co",
      }));
      throw error;
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid schedule response");
    return payload;
  }

  const from = apiDate(filters.from, apiToday());
  const to = apiDate(filters.to, apiToday(42));
  if (from > to || from < "2000-01-01" || to > "2100-12-31") {
    return failure(422, "VALIDATION_ERROR", "Schedule date range is invalid");
  }
  const requestedGroup = String(filters.group_id || "").trim();
  try {
    const memberships = await rows("group_memberships", {
      select: "group_id,groups(id,name,code,course_number,admission_year,academic_program_name,specialty_slug,is_active)",
      user_id: "eq." + identity.user.id,
      is_active: "eq.true",
      limit: "100",
    });
    const groups = memberships.map((row) => {
      const group = Array.isArray(row.groups) ? row.groups[0] : row.groups;
      const groupId = String(row.group_id || group?.id || "");
      return { group_id: groupId, group: group ? { ...group, group_id: groupId, group_name: group.name || "" } : null };
    }).filter((row) => row.group_id && row.group && row.group.is_active !== false);
    if (!groups.length) return failure(422, "NO_GROUP", "Для расписания нужна активная учебная группа");
    const selectedGroups = requestedGroup ? groups.filter((row) => row.group_id === requestedGroup) : groups;
    if (requestedGroup && !selectedGroups.length) {
      return failure(403, "GROUP_ACCESS_DENIED", "You do not have access to this group's schedule");
    }
    if (!requestedGroup && groups.length > 1 && filters.all_groups !== true) {
      return failure(409, "GROUP_REQUIRED", "Выберите учебную группу для просмотра расписания");
    }

    const groupIds = selectedGroups.map((row) => row.group_id);
    const allSchedules = await rows("schedules", {
      select: "id,group_id,semester,academic_year,academic_year_id,is_active,version,created_at",
      group_id: "in.(" + groupIds.join(",") + ")",
      is_active: "eq.true",
      limit: "500",
    });
    const latestByGroupSemester = new Map();
    for (const schedule of allSchedules.sort((a, b) =>
      Number(b.version || 0) - Number(a.version || 0)
      || String(b.created_at || "").localeCompare(String(a.created_at || "")))) {
      const key = String(schedule.group_id || "") + ":" + String(schedule.semester ?? "");
      if (!latestByGroupSemester.has(key)) latestByGroupSemester.set(key, schedule);
    }
    const schedules = [...latestByGroupSemester.values()];
    if (!schedules.length) return { ok: true, data: { items: [], groups: selectedGroups.map((row) => row.group), from, to } };
    const scheduleIds = schedules.map((row) => String(row.id)).filter(Boolean);
    const entries = await rows("schedule_entries", {
      select: "id,schedule_id,subject_id,date,start_time,end_time,type,room,building,notes,is_cancelled,subject_name,sort_order,session_id,event_kind,is_makeup,source,teacher,academic_hours,week_parity,recurrence_group,parent_entry_id,source_detail,breaks",
      schedule_id: "in.(" + scheduleIds.join(",") + ")",
      date: "gte." + from,
      and: "(date.lte." + to + ")",
      order: "date.asc,start_time.asc,sort_order.asc",
      limit: "1000",
    });
    const subjectIds = [...new Set(entries.map((row) => String(row.subject_id || "")).filter(Boolean))];
    let subjectMap = new Map();
    if (subjectIds.length) {
      const subjects = await rows("subjects", {
        select: "id,name,slug,color_hex",
        id: "in.(" + subjectIds.join(",") + ")",
        limit: "500",
      });
      subjectMap = new Map(subjects.map((row) => [String(row.id), row]));
    }
    const scheduleMap = new Map(schedules.map((row) => [String(row.id), row]));
    const groupMap = new Map(selectedGroups.map((row) => [row.group_id, row.group]));
    const items = entries.map((entry) => {
      const schedule = scheduleMap.get(String(entry.schedule_id)) || {};
      const subject = subjectMap.get(String(entry.subject_id || "")) || {};
      const group = groupMap.get(String(schedule.group_id || "")) || null;
      const dateValue = String(entry.date || "");
      let weekdayShort = "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        weekdayShort = new Date(dateValue + "T12:00:00Z").toLocaleDateString("ru-RU", { weekday: "short", timeZone: "UTC" });
      }
      return {
        ...entry,
        subject: subject.name || entry.subject_name || "",
        subject_name: subject.name || entry.subject_name || "",
        subject_slug: subject.slug || "",
        color_hex: subject.color_hex || null,
        group_id: schedule.group_id || null,
        group_name: group?.group_name || group?.name || "",
        group_code: group?.code || "",
        course_number: group?.course_number ?? null,
        group,
        semester: schedule.semester ?? null,
        academic_year: schedule.academic_year ?? null,
        academic_year_id: schedule.academic_year_id ?? null,
        version: schedule.version ?? null,
        weekday_short: weekdayShort,
      };
    });
    return { ok: true, data: { items, groups: selectedGroups.map((row) => row.group), from, to } };
  } catch (error) {
    console.error("MEDBIOHIM_SCHEDULE_FAILED", JSON.stringify({
      table: String(error?.table || "unknown").slice(0, 50),
      status: Number(error?.status) || 0,
      code: String(error?.code || "UNEXPECTED_ERROR").slice(0, 40),
    }));
    return failure(503, "SCHEDULE_UNAVAILABLE", "Расписание временно недоступно");
  }
}

/** Read group-scoped homework plus only the current user's progress/submissions. */
export async function listSupabaseHomeworks(request, env, filters = {}, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "");
  const token = match?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
  }

  async function rows(table, params) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, String(value));
    const response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("Homework query failed");
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid homework response");
    return payload;
  }

  try {
    const memberships = await rows("group_memberships", {
      select: "group_id,groups(id,name,code,course_number,admission_year,academic_program_name,specialty_slug,is_active)",
      user_id: "eq." + identity.user.id,
      is_active: "eq.true",
      limit: "100",
    });
    const activeMemberships = memberships.filter((row) => {
      const group = Array.isArray(row.groups) ? row.groups[0] : row.groups;
      return Boolean(group) && group.is_active !== false && Boolean(row.group_id);
    });
    const groupIds = [...new Set(activeMemberships.map((row) => String(row.group_id || "")).filter(Boolean))];
    const requestedGroup = String(filters.group_id || "").trim();
    if (requestedGroup && !groupIds.includes(requestedGroup)) {
      return failure(403, "GROUP_ACCESS_DENIED", "You do not have access to this group's homework");
    }
    if (!requestedGroup && groupIds.length > 1 && filters.all_groups !== true) {
      return failure(409, "GROUP_REQUIRED", "Выберите учебную группу для просмотра заданий");
    }
    const scopedGroups = requestedGroup ? [requestedGroup] : groupIds;
    const selectHomework = "id,group_id,subject_id,title,description,due_at,due_date,status,created_by,created_by_role,created_at,schedule_entry_id,subjects(name,slug,color_hex)";
    let homeworks = [];
    if (scopedGroups.length) {
      const shared = await rows("homeworks", {
        select: selectHomework,
        group_id: "in.(" + scopedGroups.join(",") + ")",
        order: "due_date.asc.nullslast,due_at.asc.nullslast,created_at.desc",
        limit: "500",
      });
      homeworks.push(...shared);
    }
    // Personal tasks have no group_id and are visible only through the caller's
    // own-row RLS policy. Keep them in the selected group's list as well.
    const personal = await rows("homeworks", {
      select: selectHomework,
      group_id: "is.null",
      created_by: "eq." + identity.user.id,
      order: "due_date.asc.nullslast,due_at.asc.nullslast,created_at.desc",
      limit: "500",
    });
    homeworks.push(...personal);
    // A homework item can be visible through both group and personal queries; return it once.
    const seenHomeworkIds = new Set();
    homeworks = homeworks.filter((row) => {
      const id = String(row?.id || "");
      if (!id || seenHomeworkIds.has(id)) return false;
      seenHomeworkIds.add(id);
      return true;
    });
    homeworks.sort((a, b) => {
      const dateA = String(a.due_date || a.due_at || a.created_at || "");
      const dateB = String(b.due_date || b.due_at || b.created_at || "");
      return dateA.localeCompare(dateB);
    });
    if (!homeworks.length) {
      const groups = activeMemberships.map((row) => { const group = Array.isArray(row.groups) ? row.groups[0] : row.groups; return group ? { ...group, group_id: String(row.group_id || group.id || ""), group_name: group.name || "" } : null; }).filter(Boolean);
      return { ok: true, data: { items: [], groups } };
    }
    const ids = homeworks.map((row) => String(row.id)).filter(Boolean);
    const [progress, submissions] = await Promise.all([
      rows("homework_progress", {
        select: "homework_id,completed,answer_text,file_id,submitted_at",
        user_id: "eq." + identity.user.id,
        homework_id: "in.(" + ids.join(",") + ")",
        limit: "500",
      }),
      rows("homework_submissions", {
        select: "id,homework_id,status,grade,teacher_comment,submitted_at,file_id,text_answer",
        user_id: "eq." + identity.user.id,
        homework_id: "in.(" + ids.join(",") + ")",
        limit: "500",
      }),
    ]);
    const progressMap = new Map(progress.map((row) => [String(row.homework_id), row]));
    const submissionMap = new Map(submissions.map((row) => [String(row.homework_id), row]));
    const items = homeworks.map((row) => {
      const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
      const mine = progressMap.get(String(row.id)) || {};
      const submission = submissionMap.get(String(row.id)) || null;
      return {
        ...row,
        subject: subject?.name || "",
        subject_slug: subject?.slug || "",
        color_hex: subject?.color_hex || null,
        my_completed: mine.completed === true,
        completed_at: mine.submitted_at || null,
        submission_status: submission?.status || null,
        submission_id: submission?.id || null,
        grade: submission?.grade ?? null,
        my_status: ["submitted", "graded", "returned"].includes(String(submission?.status || ""))
          ? submission.status
          : (mine.completed === true ? "done" : "pending"),
        my_status_source: submission ? "submission" : (mine.completed === true ? "progress" : "none"),
        my_submission: submission,
      };
    });
    const groups = activeMemberships.map((row) => { const group = Array.isArray(row.groups) ? row.groups[0] : row.groups; return group ? { ...group, group_id: String(row.group_id || group.id || ""), group_name: group.name || "" } : null; }).filter(Boolean);
    return { ok: true, data: { items, groups } };
  } catch {
    return failure(503, "HOMEWORK_UNAVAILABLE", "Задания временно недоступны");
  }
}

/** Update only the authenticated user's progress for homework in an active group. */
export async function setSupabaseHomeworkProgress(request, homeworkId, done, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const id = String(homeworkId || "").trim();
  if (!id || id.length > 128 || /[\\/?#]/.test(id)) return failure(422, "VALIDATION_ERROR", "Invalid homework id");
  if (typeof done !== "boolean") return failure(422, "VALIDATION_ERROR", "done must be a boolean");
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try { base = new URL(baseUrl); if (base.protocol !== "https:" || !anonKey) throw new Error("config"); }
  catch { return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key"); }
  async function call(table, params, init = {}) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, String(value));
    return fetcher(endpoint.toString(), { ...init, headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json", ...(init.body ? { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=representation" } : {}), ...(init.headers || {}) }, redirect: "error", signal: AbortSignal.timeout(AUTH_TIMEOUT_MS) });
  }
  try {
    const hr = await call("homeworks", { select: "id,group_id,created_by", id: "eq." + id, limit: "1" });
    if (!hr.ok) throw new Error("Homework read failed");
    const homeworks = await hr.json();
    if (!Array.isArray(homeworks)) throw new Error("Invalid homework response");
    const homework = homeworks[0];
    if (!homework) return failure(404, "NOT_FOUND", "Задание не найдено или недоступно");
    if (homework.group_id) {
      const mr = await call("group_memberships", { select: "group_id,groups(id,is_active)", user_id: "eq." + identity.user.id, group_id: "eq." + homework.group_id, is_active: "eq.true", limit: "1" });
      if (!mr.ok) throw new Error("Membership read failed");
      const memberships = await mr.json();
      const membership = Array.isArray(memberships) ? memberships[0] : null;
      const group = Array.isArray(membership?.groups) ? membership.groups[0] : membership?.groups;
      if (!membership || !group || group.is_active === false) return failure(403, "HOMEWORK_ACCESS_DENIED", "Задание недоступно в вашей учебной группе");
    } else if (String(homework.created_by || "") !== String(identity.user.id)) {
      return failure(403, "HOMEWORK_ACCESS_DENIED", "Личное задание доступно только создавшему его пользователю");
    }
    const wr = await call("homework_progress", { on_conflict: "homework_id,user_id" }, { method: "POST", body: JSON.stringify([{ homework_id: id, user_id: identity.user.id, completed: done, submitted_at: done ? new Date().toISOString() : null }]) });
    if (!wr.ok) throw new Error("Progress write failed");
    const rows = await wr.json();
    if (!Array.isArray(rows) || !rows[0]) throw new Error("Invalid progress response");
    return { ok: true, data: { progress: rows[0] } };
  } catch { return failure(503, "PROGRESS_UNAVAILABLE", "Не удалось сохранить прогресс задания"); }
}


/** Published test catalog only; never returns question answer keys or attempts. */
export async function listSupabasePublishedTests(request, env, filters = {}, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
  }
  const visibleSubjectsResult = await listSupabaseSubjects(request, env, { group_id: String(filters.group_id || "").trim() }, fetcher);
  if (!visibleSubjectsResult.ok) return visibleSubjectsResult;
  const visibleSubjectIds = new Set(visibleSubjectsResult.data.items.map((subject) => String(subject.id || "")).filter(Boolean));

  try {
    const endpoint = new URL("/rest/v1/tests", base);
    endpoint.searchParams.set("select", "id,subject_id,module_id,topic_id,title,time_limit_sec,max_attempts,is_published,created_at,archived_at,source_key,order_index,subjects(name),modules(title,order_index),topics(title,order_index)");
    endpoint.searchParams.set("is_published", "eq.true");
    endpoint.searchParams.set("archived_at", "is.null");
    endpoint.searchParams.set("order", "order_index.asc.nullslast,title.asc");
    endpoint.searchParams.set("limit", String(Math.max(1, Math.min(200, Number(filters.limit) || 50))));
    const subjectId = String(filters.subject_id || "").trim();
    if (subjectId) {
      if (subjectId.length > 128 || /[\/?#]/.test(subjectId)) return failure(422, "VALIDATION_ERROR", "Invalid subject id");
      endpoint.searchParams.set("subject_id", "eq." + subjectId);
    }
    const response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("Test catalog query failed");
    const databaseItems = await response.json();
    if (!Array.isArray(databaseItems)) throw new Error("Invalid test catalog response");
    // Match the PHP SpecialtyAccess policy: global tests are visible, subject-bound
    // tests require that the caller can see that subject through active memberships.
    const items = databaseItems.filter((item) => {
      const subjectId = String(item.subject_id || "").trim();
      return !subjectId || visibleSubjectIds.has(subjectId);
    });
    if (!items.length) return { ok: true, data: { items: [], count: 0 } };
    const linksEndpoint = new URL("/rest/v1/test_questions", base);
    linksEndpoint.searchParams.set("select", "test_id,order_index");
    linksEndpoint.searchParams.set("test_id", "in.(" + items.map((item) => String(item.id)).filter(Boolean).join(",") + ")");
    linksEndpoint.searchParams.set("order", "test_id.asc,order_index.asc");
    linksEndpoint.searchParams.set("limit", "10000");
    const linksResponse = await fetcher(linksEndpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!linksResponse.ok) throw new Error("Test-question links query failed");
    const links = await linksResponse.json();
    if (!Array.isArray(links)) throw new Error("Invalid test-question links response");
    const counts = new Map();
    for (const link of links) counts.set(String(link.test_id), (counts.get(String(link.test_id)) || 0) + 1);
    const sourceKeys = [...new Set(items.map((item) => String(item.source_key || "")).filter(Boolean))];
    const sourceMap = new Map();
    if (sourceKeys.length) {
      try {
        const sourceEndpoint = new URL("/rest/v1/content_sources", base);
        sourceEndpoint.searchParams.set("select", "id,title,file_id");
        sourceEndpoint.searchParams.set("id", "in.(" + sourceKeys.join(",") + ")");
        sourceEndpoint.searchParams.set("limit", "500");
        const sourceResponse = await fetcher(sourceEndpoint.toString(), {
          method: "GET",
          headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
        });
        if (sourceResponse.ok) {
          const sourceRows = await sourceResponse.json();
          if (Array.isArray(sourceRows)) for (const row of sourceRows) sourceMap.set(String(row.id), row);
        }
      } catch {}
    }
    const fileIds = [...new Set([...sourceMap.values()].map((row) => String(row.file_id || "")).filter(Boolean))];
    const fileNames = new Map();
    if (fileIds.length) {
      try {
        const fileEndpoint = new URL("/rest/v1/files", base);
        fileEndpoint.searchParams.set("select", "id,original_name");
        fileEndpoint.searchParams.set("id", "in.(" + fileIds.join(",") + ")");
        fileEndpoint.searchParams.set("status", "eq.active");
        fileEndpoint.searchParams.set("limit", "500");
        const fileResponse = await fetcher(fileEndpoint.toString(), {
          method: "GET",
          headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
        });
        if (fileResponse.ok) {
          const fileRows = await fileResponse.json();
          if (Array.isArray(fileRows)) for (const row of fileRows) fileNames.set(String(row.id), String(row.original_name || ""));
        }
      } catch {}
    }
    const enriched = items.map((item) => {
      const rel = (value) => Array.isArray(value) ? value[0] : value;
      const subject = rel(item.subjects), module = rel(item.modules), topic = rel(item.topics);
      const source = sourceMap.get(String(item.source_key || "")) || {};
      const fileId = source.file_id ? String(source.file_id) : null;
      return {
        ...item,
        subject_name: subject?.name || "",
        module_title: module?.title || "",
        module_order: module?.order_index ?? null,
        topic_title: topic?.title || "",
        topic_order: topic?.order_index ?? null,
        source_title: source.title || null,
        source_file_id: fileId,
        source_file_name: fileId ? (fileNames.get(fileId) || null) : null,
        questions_count: counts.get(String(item.id)) || 0,
      };
    });
    return { ok: true, data: { items: enriched, count: enriched.length } };
  } catch {
    return failure(503, "TESTS_UNAVAILABLE", "Каталог тестов временно недоступен");
  }
}


/** Real progress aggregates from the authenticated user's homework and test attempts. */
export async function getSupabaseProgress(request, env, filters = {}, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const subjectId = String(filters.subject_id || "").trim();
  const groupId = String(filters.group_id || "").trim();
  if (subjectId.length > 128 || /[\\/?#]/.test(subjectId) || groupId.length > 128 || /[\\/?#]/.test(groupId)) {
    return failure(422, "VALIDATION_ERROR", "Invalid subject or group filter");
  }
  const homeworkResult = await listSupabaseHomeworks(request, env, groupId ? { group_id: groupId } : {}, fetcher);
  if (!homeworkResult.ok) return homeworkResult;
  const homeworks = homeworkResult.data.items.filter((row) => !subjectId || String(row.subject_id || "") === subjectId);
  const effectiveGroupId = groupId || String(homeworkResult.data.groups?.[0]?.group_id || "").trim();
  if (!effectiveGroupId) return failure(409, "GROUP_REQUIRED", "Выберите учебную группу для просмотра прогресса");
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try { base = new URL(baseUrl); if (base.protocol !== "https:" || !anonKey) throw new Error("config"); }
  catch { return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key"); }
  try {
    const endpoint = new URL("/rest/v1/test_attempts", base);
    endpoint.searchParams.set("select", "id,test_id,status,score,max_score,percent,started_at,finished_at,group_id,tests(title,subject_id)");
    endpoint.searchParams.set("user_id", "eq." + identity.user.id);
    endpoint.searchParams.set("order", "started_at.desc");
    endpoint.searchParams.set("limit", "50");
    endpoint.searchParams.set("group_id", "eq." + effectiveGroupId);
    const response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("Attempt history query failed");
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid attempt history");
    const attempts = rows.filter((row) => !subjectId || String((Array.isArray(row.tests) ? row.tests[0] : row.tests)?.subject_id || "") === subjectId)
      .map((row) => {
        const test = Array.isArray(row.tests) ? row.tests[0] : row.tests;
        return { id: row.id, test_id: row.test_id, status: row.status, score: row.score ?? null, max_score: row.max_score ?? null, percent: row.percent ?? null, started_at: row.started_at ?? null, finished_at: row.finished_at ?? null, group_id: row.group_id ?? null, test_title: test?.title || "", subject_id: test?.subject_id || null };
      });
    const doneStatuses = new Set(["submitted", "graded", "done", "сдано", "оценено"]);
    const hwDone = homeworks.filter((row) => doneStatuses.has(String(row.my_status || row.status || "").toLowerCase())).length;
    const finishedStatuses = new Set(["submitted", "finished", "completed", "graded"]);
    const finished = attempts.filter((row) => finishedStatuses.has(String(row.status || "").toLowerCase())).length;
    const scores = attempts.map((row) => row.score).filter((value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))).map(Number);
    // Only include dimensions that have observations. An empty homework list is
    // missing data, not a real 0% score; the same applies to test attempts.
    const parts = [];
    if (homeworks.length) parts.push(Math.round(hwDone / homeworks.length * 100));
    if (attempts.length) parts.push(Math.round(finished / attempts.length * 100));
    const overall = parts.length
      ? Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length)
      : null;
    const hwPercent = homeworks.length ? Math.round(hwDone / homeworks.length * 100) : null;
    return { ok: true, data: {
      overall_pct: overall,
      homework: { total: homeworks.length, done: hwDone, percent: hwPercent, items: homeworks },
      tests: { attempts: attempts.length, finished, avg_score: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length * 10) / 10 : null, items: attempts },
      source: "supabase",
    } };
  } catch {
    return failure(503, "PROGRESS_UNAVAILABLE", "Прогресс временно недоступен");
  }
}

/** Read public-for-students CMS documents used by the dashboard. */
export async function getSupabaseSiteContent(request, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let endpoint;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
    endpoint = new URL("/rest/v1/site_content", base);
  } catch {
    return failure(503, "CMS_NOT_CONFIGURED", "Site content is temporarily unavailable");
  }
  endpoint.searchParams.set("select", "key,payload");
  endpoint.searchParams.set("key", "in.(site,announcements)");
  try {
    const response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("CMS read failed");
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid CMS response");
    const docs = new Map(rows.map((row) => [String(row.key || ""), row.payload && typeof row.payload === "object" ? row.payload : {}]));
    const site = { title: "Медбиохим", subtitle: "Учебная платформа", description: "", announcement_banner: "", contacts: [], ...(docs.get("site") || {}) };
    const rawAnnouncements = docs.get("announcements") || {};
    const announcements = Array.isArray(rawAnnouncements.items) ? rawAnnouncements.items.slice(0, 10) : [];
    return { ok: true, data: { site, announcements } };
  } catch {
    return failure(503, "CMS_UNAVAILABLE", "Содержимое главной страницы временно недоступно");
  }
}


/** Calendar metadata used by week/month/semester schedule views. */
export async function getSupabaseScheduleMeta(request, env, filters = {}, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
  }
  const course = String(filters.course ?? "").trim();
  const semester = String(filters.semester ?? "").trim();
  if ((course && !/^[1-6]$/.test(course)) || (semester && !/^(?:[1-9]|1[0-2])$/.test(semester))) {
    return failure(422, "VALIDATION_ERROR", "course or semester filter is invalid");
  }
  async function rows(table, params) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, String(value));
    let response;
    try {
      response = await fetcher(endpoint.toString(), {
        method: "GET",
        headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      });
    } catch (error) {
      const message = [error?.name, error?.message, error?.cause?.code].filter(Boolean).join(" ").toLowerCase();
      const category = /redirect/.test(message) ? "redirect"
        : /timeout|timed out|aborted/.test(message) ? "timeout"
        : /enotfound|eai_again|dns|getaddrinfo/.test(message) ? "dns"
        : /certificate|tls|ssl/.test(message) ? "tls" : "connection";
      console.error("MEDBIOHIM_SCHEDULE_META_FETCH_ERROR", JSON.stringify({
        table, category, sourceMatchesExpectedProject: base.hostname === "gnobvyjywtqbdfeejxmf.supabase.co",
      }));
      throw error;
    }
    if (response.status >= 300 && response.status < 400) {
      logAuthRedirect("schedule-meta:" + table, response, endpoint);
      const error = new Error("Supabase REST redirect blocked");
      error.status = response.status;
      error.code = "UPSTREAM_REDIRECT";
      error.table = table;
      throw error;
    }
    if (!response.ok) {
      let payload = null;
      try { payload = await response.json(); } catch {}
      const error = new Error("Calendar metadata read failed");
      error.status = response.status;
      error.code = typeof payload?.code === "string" ? payload.code.slice(0, 40) : "REST_ERROR";
      error.table = table;
      console.error("MEDBIOHIM_SCHEDULE_META_QUERY_FAILED", JSON.stringify({
        table, status: error.status, code: error.code,
        sourceMatchesExpectedProject: base.hostname === "gnobvyjywtqbdfeejxmf.supabase.co",
      }));
      throw error;
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid calendar metadata response");
    return payload;
  }
  try {
    const periodQuery = { select: "id,title,type,start_date,end_date,notes,is_current,course_number,semester", order: "start_date.asc,end_date.asc.nullslast,title.asc", limit: "500" };
    const rulesQuery = { select: "id,subject_id,subject_name,academic_hours,notes,course_number,semester", order: "subject_name.asc", limit: "500" };
    if (course) { periodQuery.course_number = "eq." + course; rulesQuery.course_number = "eq." + course; }
    if (semester) { periodQuery.semester = "eq." + semester; rulesQuery.semester = "eq." + semester; }
    const [periods, durationRules] = await Promise.all([
      rows("academic_calendar_periods", periodQuery),
      rows("subject_schedule_rules", rulesQuery),
    ]);
    return { ok: true, data: { periods, duration_rules: durationRules } };
  } catch (error) {
    console.error("MEDBIOHIM_SCHEDULE_META_FAILED", JSON.stringify({
      table: String(error?.table || "unknown").slice(0, 50),
      status: Number(error?.status) || 0,
      code: String(error?.code || "UNEXPECTED_ERROR").slice(0, 40),
    }));
    return failure(503, "SCHEDULE_META_UNAVAILABLE", "Метаданные учебного календаря временно недоступны");
  }
}


/** Published exam-question bank with the same opt-in full-answer behavior as PHP. */
export async function listSupabaseExamQuestions(request, env, filters = {}, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let endpoint;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
    endpoint = new URL("/rest/v1/exam_questions", base);
  } catch {
    return failure(503, "QUESTIONS_NOT_CONFIGURED", "Банк вопросов временно недоступен");
  }
  const limit = Math.max(1, Math.min(200, Number.parseInt(String(filters.limit ?? "50"), 10) || 50));
  const offset = Math.max(0, Math.min(100000, Number.parseInt(String(filters.offset ?? "0"), 10) || 0));
  const kind = String(filters.kind ?? "ticket").trim().toLowerCase();
  const subjectId = String(filters.subject_id || "").trim();
  const subjectSlug = String(filters.subject_slug || "").trim();
  const subject = String(filters.subject || "").trim().toLocaleLowerCase();
  const query = String(filters.q || "").trim().toLocaleLowerCase();
  const topic = String(filters.topic || "").trim().toLocaleLowerCase();
  const type = String(filters.type || "").trim().toLocaleLowerCase();
  const includeAnswer = ["1", "true", "yes"].includes(String(filters.include_answer || "").trim().toLowerCase());
  if (subjectId.length > 128 || /[\/?#]/.test(subjectId) || subjectSlug.length > 128 || /[\/?#]/.test(subjectSlug)) {
    return failure(422, "VALIDATION_ERROR", "Invalid subject filter");
  }
  endpoint.searchParams.set("select", "id,subject_id,subject_name,subject_slug,topic,text,answer,kind,type,for_exam,for_ticket,source,is_published,created_at,updated_at,plan_module_id,plan_topic_id,plan_status,sort_order");
  endpoint.searchParams.set("is_published", "eq.true");
  endpoint.searchParams.set("order", "subject_name.asc,sort_order.asc.nullslast,id.asc");
  endpoint.searchParams.set("limit", "5000");
  try {
    const response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) {
      const upstream = await response.json().catch(() => null);
      const error = new Error("Question bank read failed");
      error.status = response.status;
      error.code = typeof upstream?.code === "string" ? upstream.code.slice(0, 40) : "REST_ERROR";
      throw error;
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid question bank response");
    const filtered = rows.filter((row) => {
      if (subjectId && String(row.subject_id || "") !== subjectId) return false;
      if (subjectSlug && String(row.subject_slug || "") !== subjectSlug) return false;
      if (subject && !String(row.subject_name || "").toLocaleLowerCase().includes(subject)) return false;
      if (kind && String(row.kind || "").toLocaleLowerCase() !== kind) return false;
      if (type && String(row.type || "").toLocaleLowerCase() !== type) return false;
      if (topic && !String(row.topic || "").toLocaleLowerCase().includes(topic)) return false;
      if (query && !(String(row.text || "") + " " + String(row.topic || "")).toLocaleLowerCase().includes(query)) return false;
      return true;
    });
    const items = filtered.slice(offset, offset + limit).map((row) => {
      const item = { ...row, has_answer: String(row.answer || "") !== "" };
      if (!includeAnswer && String(item.answer || "").length > 120) {
        item.answer_preview = String(item.answer).slice(0, 120) + "…";
        delete item.answer;
      }
      return item;
    });
    return { ok: true, data: { items, total: filtered.length, limit, offset, source: "supabase", answers_included: includeAnswer } };
  } catch (error) {
    console.error("MEDBIOHIM_QUESTION_BANK_READ_FAILED", JSON.stringify({
      status: Number(error?.status) || 0,
      code: /^[A-Z0-9_]{1,40}$/i.test(String(error?.code || "")) ? error.code : "UPSTREAM_ERROR",
      category: error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "upstream",
    }));
    return failure(503, "DB_UNAVAILABLE", "Банк вопросов временно недоступен");
  }
}

/** Summarize the published exam-question bank by subject and kind. */
export async function listSupabaseQuestionSubjects(request, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let endpoint;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
    endpoint = new URL("/rest/v1/exam_questions", base);
  } catch {
    return failure(503, "QUESTIONS_NOT_CONFIGURED", "Каталог вопросов временно недоступен");
  }
  endpoint.searchParams.set("select", "id,subject_id,subject_name,subject_slug,kind");
  endpoint.searchParams.set("is_published", "eq.true");
  endpoint.searchParams.set("order", "subject_name.asc,id.asc");
  endpoint.searchParams.set("limit", "5000");
  try {
    const response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) {
      const upstream = await response.json().catch(() => null);
      const error = new Error("Question bank summary read failed");
      error.status = response.status;
      error.code = typeof upstream?.code === "string" ? upstream.code.slice(0, 40) : "REST_ERROR";
      throw error;
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid question bank summary");
    const map = new Map();
    for (const row of rows) {
      const key = String(row.subject_id || ("slug:" + String(row.subject_slug || "other")));
      if (!map.has(key)) map.set(key, { subject_id: row.subject_id || null, subject: row.subject_name || row.subject_slug || "Без предмета", subject_slug: row.subject_slug || "other", count: 0, kinds: {} });
      const entry = map.get(key);
      entry.count += 1;
      const rowKind = String(row.kind || "other").trim() || "other";
      entry.kinds[rowKind] = (entry.kinds[rowKind] || 0) + 1;
    }
    return { ok: true, data: { items: [...map.values()], source: "supabase" } };
  } catch (error) {
    console.error("MEDBIOHIM_QUESTION_BANK_SUMMARY_FAILED", JSON.stringify({
      status: Number(error?.status) || 0,
      code: /^[A-Z0-9_]{1,40}$/i.test(String(error?.code || "")) ? error.code : "UPSTREAM_ERROR",
      category: error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "upstream",
    }));
    return failure(503, "DB_UNAVAILABLE", "Каталог вопросов временно недоступен");
  }
}


/** Published lectures from the site_content document plus legacy histology lectures. */
export async function listSupabaseLectures(request, env, subjectSlug = "", fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
  } catch {
    return failure(503, "LECTURES_NOT_CONFIGURED", "Лекции временно недоступны");
  }
  async function rows(path, params) {
    const endpoint = new URL("/rest/v1/" + path, base);
    for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, String(value));
    const response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) {
      const error = new Error("Lecture read failed");
      error.status = response.status;
      error.table = path;
      throw error;
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid lecture response");
    return payload;
  }
  try {
    let documents = [];
    try {
      documents = await rows("site_content", { key: "eq.lectures", select: "payload", limit: "1" });
    } catch (error) {
      // CMS lecture JSON is optional and student RLS may intentionally deny
      // site_content. Do not weaken RLS; continue with any caller-visible
      // published legacy histology lectures. Infrastructure errors still fail.
      if (![401, 403, 404].includes(Number(error?.status))) throw error;
    }
    const payload = documents[0]?.payload;
    let items = payload && Array.isArray(payload.items) ? payload.items.filter((row) => row && typeof row === "object" && row.status === "published") : [];
    if (subjectSlug) items = items.filter((row) => String(row.subject_slug || "") === subjectSlug);
    if (!subjectSlug || subjectSlug === "histology") {
      const legacy = await rows("histology_lectures", {
        select: "id,title,subject_slug,kind,prep_names,linked_prep_ids,body_markdown,description_algorithm_ref,is_published,created_at,updated_at",
        subject_slug: "eq.histology",
        is_published: "eq.true",
        order: "title.asc",
        limit: "1000",
      });
      for (const row of legacy) {
        items.push({
          id: "histology-" + String(row.id),
          title: String(row.title || ""),
          subject: "Гистология, цитология",
          subject_slug: "histology",
          topic: String(row.kind || "Гистология"),
          body_md: String(row.body_markdown || ""),
          summary: Array.isArray(row.prep_names) && row.prep_names.length ? "Связанные препараты: " + row.prep_names.join(", ") : "",
          media: [],
          sources: [],
          status: "published",
          published_at: row.created_at || null,
          created_at: row.created_at || null,
          updated_at: row.updated_at || null,
          linked_prep_ids: row.linked_prep_ids || [],
          description_algorithm_ref: row.description_algorithm_ref || null,
        });
      }
    }
    items.sort((a, b) => {
      const currentA = a.subject_slug === "histology" && a.curriculum?.scope === "current";
      const currentB = b.subject_slug === "histology" && b.curriculum?.scope === "current";
      if (currentA || currentB) {
        const orderA = Number.isFinite(Number(a.curriculum?.order_index)) ? Number(a.curriculum.order_index) : Number.MAX_SAFE_INTEGER;
        const orderB = Number.isFinite(Number(b.curriculum?.order_index)) ? Number(b.curriculum.order_index) : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
      }
      return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    });
    return { ok: true, data: { items } };
  } catch {
    return failure(503, "LECTURES_UNAVAILABLE", "Лекции временно недоступны");
  }
}

export async function getSupabaseLecture(request, lectureId, env, fetcher = fetch) {
  const id = String(lectureId || "").trim();
  if (!id || id.length > 128 || /[\/?#]/.test(id)) return failure(422, "VALIDATION_ERROR", "Invalid lecture id");
  const result = await listSupabaseLectures(request, env, "", fetcher);
  if (!result.ok) return result;
  const lecture = result.data.items.find((row) => String(row.id || "") === id);
  return lecture ? { ok: true, data: { lecture } } : failure(404, "NOT_FOUND", "Лекция не найдена или ещё не опубликована");
}


/** Subject catalog + curriculum document, using only the caller's RLS scope. */
export async function getSupabaseSubjectCatalog(request, env, fetcher = fetch) {
  const subjectResult = await listSupabaseSubjects(request, env, {}, fetcher);
  if (!subjectResult.ok) return subjectResult;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
    const endpoint = new URL("/rest/v1/site_content", base);
    endpoint.searchParams.set("select", "key,payload");
    endpoint.searchParams.set("key", "eq.curriculum");
    endpoint.searchParams.set("limit", "1");
    const response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) {
      const error = new Error("Curriculum read failed");
      error.status = response.status;
      throw error;
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid curriculum response");
    const curriculum = rows[0]?.payload && typeof rows[0].payload === "object"
      ? rows[0].payload
      : { items: subjectResult.data.items };
    return { ok: true, data: { items: subjectResult.data.items, tools: [], program: null, semester_label: null, curriculum } };
  } catch (error) {
    // The curriculum document is optional. Keep the authenticated subject list
    // usable when student RLS hides site_content; never mask upstream 5xx/timeouts.
    if ([401, 403, 404].includes(Number(error?.status))) {
      const items = subjectResult.data.items;
      return {
        ok: true,
        data: {
          items,
          tools: [],
          program: null,
          semester_label: null,
          curriculum: { items },
          curriculum_available: false,
          curriculum_source: "caller_subjects_fallback",
          degraded: true,
        },
      };
    }
    return failure(503, "CURRICULUM_UNAVAILABLE", "Учебный план временно недоступен");
  }
}

/** List subject-plan JSON documents without exposing other site_content keys. */
export async function listSupabaseSubjectPlans(request, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
    const endpoint = new URL("/rest/v1/site_content", base);
    endpoint.searchParams.set("select", "key,payload");
    endpoint.searchParams.set("key", "like.subject_plan:*");
    endpoint.searchParams.set("limit", "500");
    const response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (!response.ok) {
      const error = new Error("Subject plan list failed");
      error.status = response.status;
      throw error;
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid subject plan list");
    const plans = {};
    for (const row of rows) {
      if (typeof row.key === "string" && row.key.startsWith("subject_plan:") && row.payload && typeof row.payload === "object") {
        plans[row.key] = row.payload;
      }
    }
    return { ok: true, data: { plans } };
  } catch (error) {
    // A bulk list of curated CMS JSON is optional. Individual subject plans
    // can be derived from caller-visible curriculum instead; return a clear
    // degraded result for expected RLS denial without broadening permissions.
    if ([401, 403, 404].includes(Number(error?.status))) {
      return { ok: true, data: { plans: {}, available: false, source: "none" } };
    }
    return failure(503, "SUBJECT_PLANS_UNAVAILABLE", "Учебные планы предметов временно недоступны");
  }
}

export async function getSupabaseSubjectPlan(request, slug, env, fetcherOrFilters = fetch, maybeFetcher = fetch) {
  const filters = typeof fetcherOrFilters === "function" ? {} : (fetcherOrFilters || {});
  const fetcher = typeof fetcherOrFilters === "function" ? fetcherOrFilters : maybeFetcher;
  const normalized = String(slug || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,100}$/i.test(normalized)) return failure(422, "VALIDATION_ERROR", "Invalid subject slug");
  const parseOptionalNumber = (value, max) => {
    if (value == null || String(value).trim() === "") return null;
    const number = Number(value);
    return Number.isInteger(number) && number > 0 && number <= max ? number : NaN;
  };
  const requestedCourse = parseOptionalNumber(filters.course, 8);
  const requestedSemester = parseOptionalNumber(filters.semester, 16);
  if (Number.isNaN(requestedCourse) || Number.isNaN(requestedSemester)) {
    return failure(422, "VALIDATION_ERROR", "Invalid course or semester filter");
  }
  const databaseSlug = normalized === "organic_chemistry" ? "chemistry_organic_physical" : normalized;
  const curatedSlugs = new Set(["histology", "physiology", "organic_chemistry", "chemistry_organic_physical"]);
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(baseUrl);
    if (base.protocol !== "https:" || !anonKey) throw new Error("config");
  } catch {
    return failure(503, "AUTH_NOT_CONFIGURED", "Supabase REST must use HTTPS and an anon key");
  }

  async function rows(table, query = {}) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [key, value] of Object.entries(query)) endpoint.searchParams.set(key, String(value));
    const response = await fetcher(endpoint.toString(), {
      method: "GET",
      headers: { apikey: anonKey, authorization: "Bearer " + token, accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) throw new Error("Supabase REST redirect blocked");
    if (!response.ok) {
      const error = new Error("Subject plan read failed");
      error.status = response.status;
      error.table = table;
      const details = await response.json().catch(() => null);
      error.code = typeof details?.code === "string" ? details.code.slice(0, 40) : "REST_ERROR";
      throw error;
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid Supabase collection");
    return payload;
  }

  async function withSchedule(plan, subject) {
    const scheduleResult = await listSupabaseSchedule(request, env, {
      from: "2000-01-01",
      to: "2100-12-31",
      all_groups: true,
    }, fetcher);
    if (!scheduleResult.ok) {
      return { ok: true, data: {
        plan,
        schedule_count: null,
        schedule_sample: [],
        subject: subject && typeof subject === "object" ? subject : null,
        available: true,
        schedule_available: false,
        source: plan.source || "site_content",
      } };
    }
    const subjectName = String(subject?.name || plan.subject || "");
    const subjectId = String(subject?.id || "");
    const subjectSlug = String(subject?.slug || databaseSlug || normalized);
    const schedule = scheduleResult.data.items.filter((row) =>
      (subjectId && String(row.subject_id || "") === subjectId)
      || String(row.subject_slug || "") === normalized
      || String(row.subject_slug || "") === subjectSlug
      || (!row.subject_slug && String(row.subject_name || row.subject || "") === subjectName)
    );
    return { ok: true, data: {
      plan,
      schedule_count: schedule.length,
      schedule_sample: schedule.slice(0, 5),
      subject: subject && typeof subject === "object" ? subject : null,
      available: true,
      schedule_available: true,
      source: plan.source || "site_content",
    } };
  }

  try {
    // The curated CMS plans are private under site_content RLS. Use the narrowly
    // scoped student RPC first so we can return the original weekly lecture,
    // practice and preparation list without widening table access.
    if (curatedSlugs.has(normalized)) {
      try {
        const rpcEndpoint = new URL("/rest/v1/rpc/medbiohim_get_student_subject_plan", base);
        const rpcResponse = await fetcher(rpcEndpoint.toString(), {
          method: "POST",
          headers: {
            apikey: anonKey,
            authorization: "Bearer " + token,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            p_subject_slug: normalized,
            p_course_number: requestedCourse,
            p_semester: requestedSemester,
          }),
          redirect: "error",
          signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
        });
        if (!rpcResponse.ok) {
          const rpcError = await rpcResponse.json().catch(() => null);
          const rpcCode = String(rpcError?.code || "");
          if (rpcCode === "42501" || rpcResponse.status === 403) {
            return failure(403, "FORBIDDEN", "Доступ к учебному плану доступен участникам МБХ");
          }
          if (rpcCode === "22023") {
            return failure(422, "VALIDATION_ERROR", "Invalid subject plan filters");
          }
          // A not-yet-deployed RPC may happen while the two Worker sources are
          // being synchronized. Preserve the published-curriculum fallback.
          console.error("MEDBIOHIM_SUBJECT_PLAN_RPC_UNAVAILABLE", JSON.stringify({
            status: Number(rpcResponse.status) || 0,
            code: rpcCode.slice(0, 32),
          }));
        } else {
          const envelope = await rpcResponse.json();
          const curatedPlan = envelope?.plan && typeof envelope.plan === "object" ? envelope.plan : null;
          const subject = envelope?.subject && typeof envelope.subject === "object" ? envelope.subject : null;
          if (curatedPlan && subject && Array.isArray(curatedPlan.weeks) && curatedPlan.weeks.length > 0) {
            const weeks = curatedPlan.weeks.map((week, index) => ({
              ...week,
              n: week?.n ?? week?.week ?? index + 1,
              week: week?.week ?? week?.n ?? index + 1,
              date: week?.date || week?.planned_date || null,
              lecture: week?.lecture || "",
              practice: week?.practice || "",
              preparations: Array.isArray(week?.preparations) ? week.preparations : [],
            }));
            const plan = {
              ...curatedPlan,
              subject: subject.name || curatedPlan.subject || normalized,
              subject_slug: subject.slug || databaseSlug,
              description: subject.description || curatedPlan.description || "",
              course_number: subject.course_number ?? curatedPlan.course ?? null,
              semester: subject.semester ?? curatedPlan.semester ?? null,
              control: subject.control_type ?? curatedPlan.control ?? curatedPlan.control_type ?? null,
              hours: {
                lecture: subject.lecture_hours ?? curatedPlan.hours?.lecture ?? curatedPlan.lecture_hours ?? null,
                practice: subject.practice_hours ?? curatedPlan.hours?.practice ?? curatedPlan.practice_hours ?? null,
                self_study: subject.self_study_hours ?? curatedPlan.hours?.self_study ?? curatedPlan.self_study_hours ?? null,
                total: subject.total_hours ?? curatedPlan.hours?.total ?? curatedPlan.total_hours ?? null,
              },
              total_hours: subject.total_hours ?? curatedPlan.total_hours ?? curatedPlan.hours?.total ?? null,
              credits: subject.credits ?? curatedPlan.credits ?? null,
              note: curatedPlan.note || curatedPlan.source_note || "",
              source: "site_content",
              weeks,
            };
            return await withSchedule(plan, subject);
          }
        }
      } catch (rpcError) {
        // The regular curriculum route remains a graceful fallback if the RPC
        // endpoint is temporarily unavailable. Access-denied SQL responses are
        // handled explicitly above and are never silently bypassed.
        console.error("MEDBIOHIM_SUBJECT_PLAN_RPC_FAILED", JSON.stringify({
          status: Number(rpcError?.status) || 0,
          code: String(rpcError?.code || "").slice(0, 32),
        }));
      }
    }

    let savedRows = [];
    try {
      savedRows = await rows("site_content", {
        select: "payload",
        key: "eq.subject_plan:" + normalized,
        limit: "1",
      });
    } catch (error) {
      // Student RLS intentionally denies site_content. Treat a 401/403 on this
      // optional curated JSON as "no saved plan" and continue with the
      // caller-visible curriculum below; do not weaken the table's RLS.
      if (![401, 403, 404].includes(Number(error?.status))) throw error;
    }
    const savedPlan = savedRows[0]?.payload && typeof savedRows[0].payload === "object"
      ? savedRows[0].payload
      : null;
    if (savedPlan) return await withSchedule(savedPlan, { name: savedPlan.subject || "" });

    // JSON plans are curated only for a few subjects. For all others, build the
    // same page contract from published curriculum rows visible to this caller.
    // Never create dates or lessons: every item comes from Supabase curriculum
    // or the user's current group schedule, both queried with their JWT.
    const memberships = await rows("group_memberships", {
      select: "group_id,groups(specialty_slug,is_active,course_number)",
      user_id: "eq." + identity.user.id,
      is_active: "eq.true",
      limit: "100",
    });
    const activeGroups = memberships.flatMap((membership) => {
      const raw = membership?.groups;
      const group = Array.isArray(raw) ? raw[0] : raw;
      return group && group.is_active !== false && membership.group_id
        ? [{ id: String(membership.group_id), ...group }]
        : [];
    });
    const allowedSpecialties = new Set(activeGroups.map((group) => String(group.specialty_slug || "").trim().toLowerCase()).filter(Boolean));
    if (allowedSpecialties.has("mbh")) allowedSpecialties.add("histology");

    const subjectRows = await rows("subjects", {
      select: "id,slug,name,description,specialty_slug,course_number,semester,control_type,lecture_hours,practice_hours,self_study_hours,total_hours,credits,is_active",
      slug: "eq." + databaseSlug,
      is_active: "eq.true",
      order: "course_number.asc.nullslast,semester.asc.nullslast,name.asc",
      limit: "200",
    });
    const visibleSubjects = subjectRows.filter((subject) => {
      const specialty = String(subject.specialty_slug || "").trim().toLowerCase();
      const requiredSpecialty = curatedSlugs.has(normalized) || specialty === "mbh" ? "mbh" : specialty;
      return !requiredSpecialty || allowedSpecialties.has(requiredSpecialty);
    });
    if (!visibleSubjects.length) {
      return { ok: true, data: { plan: null, schedule_count: 0, schedule_sample: [], available: false, schedule_available: false, source: "none" } };
    }

    let profile = null;
    try {
      const profileRows = await rows("users", {
        select: "course_number,semester",
        id: "eq." + identity.user.id,
        limit: "1",
      });
      profile = profileRows[0] || null;
    } catch {
      // Older installations may not expose optional profile fields; group data is enough.
    }
    const groupCourse = activeGroups.find((group) => group.course_number != null && String(group.course_number).trim() !== "")?.course_number;
    const profileCourse = profile?.course_number == null || String(profile.course_number).trim() === "" ? null : Number(profile.course_number);
    const groupCourseNumber = groupCourse == null ? null : Number(groupCourse);
    const preferredCourse = Number.isFinite(profileCourse) ? profileCourse : (Number.isFinite(groupCourseNumber) ? groupCourseNumber : null);
    const preferredSemester = profile?.semester == null || String(profile.semester).trim() === "" ? null : Number(profile.semester);
    const scoreSubject = (subject) => {
      let score = 0;
      const course = Number(subject.course_number);
      const semester = Number(subject.semester);
      if (preferredCourse !== null && subject.course_number != null) score += course === preferredCourse ? 8 : -4;
      if (preferredSemester !== null && Number.isFinite(preferredSemester) && subject.semester != null) score += semester === preferredSemester ? 4 : -2;
      return score;
    };
    visibleSubjects.sort((a, b) => scoreSubject(b) - scoreSubject(a));
    const subject = visibleSubjects[0];

    const curriculumItems = await rows("curriculum_items", {
      select: "id,subject_id,module_id,topic_id,course_number,semester,item_type,title,description,planned_date,due_at,order_index,is_required,source,metadata",
      subject_id: "eq." + subject.id,
      is_active: "eq.true",
      order: "planned_date.asc.nullslast,order_index.asc,title.asc",
      limit: "2000",
    });

    const scheduleResult = await listSupabaseSchedule(request, env, {
      from: "2000-01-01",
      to: "2100-12-31",
      all_groups: true,
    }, fetcher);
    const schedule = scheduleResult.ok
      ? scheduleResult.data.items.filter((row) =>
          String(row.subject_id || "") === String(subject.id)
          || String(row.subject_slug || "") === normalized
          || (!row.subject_slug && String(row.subject_name || row.subject || "") === String(subject.name || ""))
        )
      : [];

    const buckets = new Map();
    const safeDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
    const ensureBucket = (key, date = null, metadata = {}) => {
      if (!buckets.has(key)) {
        buckets.set(key, {
          date,
          week: Number.isFinite(Number(metadata.calendar_week)) ? Number(metadata.calendar_week) : null,
          lecture: "",
          practice: "",
          preparations: [],
          items: [],
          schedule: [],
          _sort: date || "9999-99-99",
        });
      }
      return buckets.get(key);
    };
    const append = (bucket, field, text) => {
      const value = String(text || "").trim();
      if (!value) return;
      bucket[field] = bucket[field] ? bucket[field] + "\n" + value : value;
    };

    for (const [index, item] of curriculumItems.entries()) {
      const date = safeDate(item.planned_date);
      const bucket = ensureBucket(date ? "date:" + date : "undated:" + index, date || null, item.metadata || {});
      const title = String(item.title || "").trim();
      const kind = String(item.item_type || "lesson").trim().toLowerCase();
      const description = String(item.description || "").trim();
      const entry = {
        id: item.id ?? null,
        item_type: kind,
        title,
        description: description || null,
        planned_date: date || null,
        due_at: item.due_at ?? null,
        order_index: item.order_index ?? null,
        topic_id: item.topic_id ?? null,
        module_id: item.module_id ?? null,
        is_required: item.is_required === true,
        source: item.source ?? null,
        metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
      };
      bucket.items.push(entry);
      if (["lecture", "лекция", "lectures"].includes(kind)) append(bucket, "lecture", title);
      else if (["practice", "practical", "lab", "laboratory", "seminar", "практика", "лабораторная", "семинар"].includes(kind)) {
        append(bucket, "practice", title ? (["practice", "practical", "практика"].includes(kind) ? title : "Практика: " + title) : "");
      } else if (["exam", "credit", "зачет", "зачёт", "экзамен", "assessment", "control"].includes(kind)) {
        append(bucket, "practice", title ? "Контроль: " + title : "");
      } else {
        append(bucket, "practice", title ? (kind === "lesson" ? title : kind + ": " + title) : "");
      }
    }

    for (const [index, event] of schedule.entries()) {
      const date = safeDate(event.date);
      const bucket = ensureBucket(date ? "date:" + date : "schedule:" + index, date || null, {});
      const time = [event.start_time, event.end_time].map((value) => String(value || "").slice(0, 5)).filter(Boolean).join("–");
      const title = String(event.title || event.event_title || event.notes || event.event_kind || event.type || "Занятие").trim();
      const where = [event.building, event.room].map((value) => String(value || "").trim()).filter(Boolean).join(", ");
      const line = ["Расписание", time, title, where].filter(Boolean).join(" · ");
      append(bucket, bucket.lecture ? "practice" : "lecture", line);
      bucket.schedule.push({
        id: event.id ?? null,
        date: event.date ?? null,
        start_time: event.start_time ?? null,
        end_time: event.end_time ?? null,
        type: event.type ?? null,
        event_kind: event.event_kind ?? null,
        room: event.room ?? null,
        building: event.building ?? null,
        is_cancelled: event.is_cancelled === true,
      });
    }

    const weeks = [...buckets.values()]
      .sort((a, b) => a._sort.localeCompare(b._sort) || String(a.date || "").localeCompare(String(b.date || "")))
      .map((week, index) => {
        const { _sort, ...value } = week;
        const weekNumber = value.week || index + 1;
        return { n: index + 1, week: weekNumber, ...value };
      });
    const available = curriculumItems.length > 0 || schedule.length > 0;
    if (!available) {
      return { ok: true, data: { plan: null, schedule_count: 0, schedule_sample: [], available: false, schedule_available: scheduleResult.ok, source: "none" } };
    }

    const plan = {
      subject: String(subject.name || normalized),
      subject_slug: normalized,
      description: subject.description || "",
      course_number: subject.course_number ?? null,
      semester: subject.semester ?? null,
      control: subject.control_type ?? null,
      hours: {
        lecture: subject.lecture_hours ?? null,
        practice: subject.practice_hours ?? null,
        self_study: subject.self_study_hours ?? null,
        total: subject.total_hours ?? null,
      },
      credits: subject.credits ?? null,
      note: "План собран из опубликованной учебной программы и расписания группы. Показаны только данные, сохранённые в Supabase.",
      source: "supabase_curriculum_and_schedule",
      weeks,
      updated_at: curriculumItems.reduce((value, item) => {
        const date = String(item.planned_date || item.due_at || "");
        return date && date > value ? date : value;
      }, ""),
    };
    return { ok: true, data: {
      plan,
      schedule_count: schedule.length,
      schedule_sample: schedule.slice(0, 5),
      available: true,
      schedule_available: scheduleResult.ok,
      source: "supabase_curriculum_and_schedule",
    } };
  } catch (error) {
    console.error("MEDBIOHIM_SUBJECT_PLAN_FAILED", JSON.stringify({
      table: String(error?.table || "unknown").slice(0, 50),
      status: Number(error?.status) || 0,
    }));
    return failure(503, "SUBJECT_PLAN_UNAVAILABLE", "Учебный план предмета временно недоступен");
  }
}
